// Regression tests for the planning algorithm. Run with `node scripts/test-logic.mjs`.
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test, { after } from 'node:test'
import ts from 'typescript'

// Run the same TypeScript source as production without adding a test framework.
const scratch = await mkdtemp(join(tmpdir(), 'together-logic-'))
for (const name of ['dates', 'insights', 'planIdeas']) {
  const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: `${name}.ts`,
    reportDiagnostics: true,
  })
  await writeFile(join(scratch, `${name}.mjs`), outputText.replaceAll("from './dates'", "from './dates.mjs'"))
}

const { localISODate, weekStartISO, addDaysISO, validTimeRange } = await import(pathToFileURL(join(scratch, 'dates.mjs')).href)
const { overlapSuggestion, workOccursOn } = await import(pathToFileURL(join(scratch, 'insights.mjs')).href)
const { planIdeas } = await import(pathToFileURL(join(scratch, 'planIdeas.mjs')).href)

const day = '2026-09-28'
const available = (userId, start, end, status = 'available', date = day) =>
  ({ id: `${userId}-${start}-${status}`, userId, date, start, end, status })
const work = (userId, start, end, date = day, repeatsWeekly = false) =>
  ({ id: `${userId}-work`, userId, date, start, end, type: 'office', repeatsWeekly })
const state = (overrides = {}) => ({
  me: { id: 'me' }, partner: { id: 'partner' },
  availability: [available('me', '19:00', '22:00'), available('partner', '19:00', '22:00')],
  workSchedules: [], plans: [], dailyStates: [
    { userId: 'me', date: day, energy: 4, closeness: 4 },
    { userId: 'partner', date: day, energy: 4, closeness: 4 },
  ], ...overrides,
})

test('dates use Vietnam calendar day across UTC midnight and week boundaries', () => {
  process.env.TZ = 'Asia/Bangkok'
  assert.equal(localISODate(new Date('2026-09-27T20:30:00Z')), day)
  assert.equal(weekStartISO(new Date('2026-09-27T20:30:00Z')), day)
  assert.equal(addDaysISO('2026-09-28', 6), '2026-10-04')
  assert.equal(validTimeRange('19:00', '18:59'), false)
  assert.equal(validTimeRange('19:00', '21:00'), true)
})

test('ordinary overlapping availability suggests the shared interval', () => {
  const slot = overlapSuggestion(state({
    availability: [available('me', '18:00', '21:00'), available('partner', '19:00', '22:00')],
  }), day)
  assert.deepEqual([slot.start, slot.end, slot.duration], ['19:00', '21:00', 120])
})

test('an explicit busy or alone interval from either partner takes priority', () => {
  const slot = overlapSuggestion(state({ availability: [
    available('me', '19:00', '22:00'), available('partner', '19:00', '22:00'),
    available('partner', '19:00', '21:00', 'prefer_alone'),
  ] }), day)
  assert.deepEqual([slot.start, slot.end], ['21:00', '22:00'])
})

test('recurring work and an existing confirmed plan exclude occupied time', () => {
  const future = '2026-10-05' // Next Monday.
  const busy = work('me', '19:00', '20:00', day, true)
  assert.equal(workOccursOn(busy, future), true)
  assert.equal(workOccursOn(busy, '2026-10-06'), false)
  const slot = overlapSuggestion(state({
    workSchedules: [busy],
    availability: [available('me', '19:00', '22:00', 'available', future), available('partner', '19:00', '22:00', 'available', future)],
    plans: [{ id: 'existing', date: future, start: '20:00', end: '21:00', status: 'confirmed' }],
  }), future)
  assert.deepEqual([slot.start, slot.end], ['21:00', '22:00'])
})

test('intervals shorter than 45 minutes do not produce a recommendation', () => {
  const slot = overlapSuggestion(state({ availability: [
    available('me', '19:00', '19:35'), available('partner', '19:00', '22:00'),
  ] }), day)
  assert.equal(slot, null)
})

test('suggestions respect the lower energy and closeness signal', () => {
  const fatigue = state({ dailyStates: [
    { userId: 'me', date: day, energy: 5, closeness: 5 },
    { userId: 'partner', date: day, energy: 1, closeness: 2 },
  ] })
  const slot = overlapSuggestion(fatigue, day)
  assert.equal(slot.energy, 1)
  assert.equal(slot.closeness, 2)
  assert.match(slot.message, /không gian riêng/)
  assert.match(planIdeas(fatigue, day).hint, /không gian riêng/)
})

test('missing daily states never masquerade as real closeness measurements', () => {
  const withoutCheckins = state({ dailyStates: [] })
  const slot = overlapSuggestion(withoutCheckins, day)
  assert.equal(slot.closeness, null)
  assert.equal(slot.energy, null)
  assert.match(planIdeas(withoutCheckins, '2026-10-05').hint, /Chưa có đủ trạng thái/)
})

after(async () => { await rm(scratch, { force: true, recursive: true }) })
