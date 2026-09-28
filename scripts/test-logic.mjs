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

// Execute the pure response reconciler from the actual TSX module, without
// importing its browser/UI dependencies or maintaining a duplicate algorithm.
const planScreenSource = await readFile(new URL('../src/screens-plan.tsx', import.meta.url), 'utf8')
const planScreenAst = ts.createSourceFile('screens-plan.tsx', planScreenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const reconciler = planScreenAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reconcilePlanResponse')
assert.ok(reconciler, 'Plan UI must expose its production response reconciler')
const { outputText: reconcilerJS } = ts.transpileModule(reconciler.getText(planScreenAst), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
await writeFile(join(scratch, 'plan-response.mjs'), reconcilerJS)
const { reconcilePlanResponse } = await import(pathToFileURL(join(scratch, 'plan-response.mjs')).href)

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
    plans: [{ id: 'existing', date: future, start: '20:00', end: '21:00', type: 'hard', status: 'confirmed' }],
  }), future)
  assert.deepEqual([slot.start, slot.end], ['21:00', '22:00'])
})

test('soft plans reserve time, hard proposals wait for confirmation, cancelled plans do not reserve', () => {
  const base = { id: 'existing', date: day, start: '19:00', end: '21:00' }
  const soft = overlapSuggestion(state({ plans: [{ ...base, type: 'soft', status: 'proposed' }] }), day)
  assert.deepEqual([soft.start, soft.end], ['21:00', '22:00'])

  const pendingHard = overlapSuggestion(state({ plans: [{ ...base, type: 'hard', status: 'proposed' }] }), day)
  assert.deepEqual([pendingHard.start, pendingHard.end], ['19:00', '22:00'])

  const cancelledSoft = overlapSuggestion(state({ plans: [{ ...base, type: 'soft', status: 'cancelled' }] }), day)
  assert.deepEqual([cancelledSoft.start, cancelledSoft.end], ['19:00', '22:00'])
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

const responsePlan = (revision, status = 'proposed', extra = {}) => ({
  id: 'shared-plan', title: 'Dinner', date: day, start: '19:00', end: '20:00',
  type: 'hard', createdBy: 'me', revision, status, ...extra,
})

test('late confirmation cannot undo a cancellation already received through realtime', () => {
  const current = [responsePlan(3, 'cancelled')]
  assert.strictEqual(reconcilePlanResponse(current, responsePlan(2, 'confirmed')), current)
})

test('late cancellation cannot overwrite a newer reopened proposal', () => {
  const current = [responsePlan(4, 'proposed', { title: 'Rescheduled dinner', start: '20:00' })]
  assert.strictEqual(reconcilePlanResponse(current, responsePlan(3, 'cancelled')), current)
})

test('late edit response preserves newer content and partner confirmation', () => {
  const current = [responsePlan(5, 'confirmed', { title: 'Current title' })]
  assert.strictEqual(reconcilePlanResponse(current, responsePlan(4, 'proposed', { title: 'Old title' })), current)
})

test('edit, confirmation and cancellation responses never resurrect a missing plan', () => {
  const current = [responsePlan(9, 'proposed', { id: 'unrelated-plan' })]
  for (const status of ['proposed', 'confirmed', 'cancelled']) {
    assert.strictEqual(reconcilePlanResponse(current, responsePlan(2, status)), current)
  }
  // Create insertion is also suppressed if the form already observed the row
  // before a subsequent realtime snapshot removed it.
  assert.strictEqual(reconcilePlanResponse(current, responsePlan(1), false), current)
})

test('create response inserts once and preserves a newer cancelled or confirmed row', () => {
  const created = responsePlan(1)
  const inserted = reconcilePlanResponse([], created, true)
  assert.deepEqual(inserted, [created])
  assert.strictEqual(reconcilePlanResponse(inserted, created, true), inserted)
  for (const status of ['cancelled', 'confirmed']) {
    const realtime = [responsePlan(2, status)]
    assert.strictEqual(reconcilePlanResponse(realtime, created, true), realtime)
  }
})

test('fresh mutation applies its complete version without mutating prior state', () => {
  const old = Object.freeze(responsePlan(1))
  const other = Object.freeze(responsePlan(7, 'proposed', { id: 'other' }))
  const plans = Object.freeze([old, other])
  const fresh = responsePlan(2, 'proposed', { title: 'Edited title', note: 'Edited note' })
  assert.deepEqual(reconcilePlanResponse(plans, fresh), [fresh, other])
  assert.equal(plans[0].revision, 1)
  const confirmed = responsePlan(3, 'confirmed')
  assert.deepEqual(reconcilePlanResponse([fresh], confirmed), [confirmed])
  const cancelled = responsePlan(4, 'cancelled')
  assert.deepEqual(reconcilePlanResponse([confirmed], cancelled), [cancelled])
})

test('equal revisions retain the existing snapshot rather than mixing response fields', () => {
  const current = [responsePlan(3, 'cancelled', { title: 'Authoritative snapshot' })]
  assert.strictEqual(reconcilePlanResponse(current, responsePlan(3, 'confirmed')), current)
})

after(async () => { await rm(scratch, { force: true, recursive: true }) })
