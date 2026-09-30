import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const setupSource = await readFile(new URL('../src/screens-setup.tsx', import.meta.url), 'utf8')
const zodiacSource = await readFile(new URL('../src/zodiac.ts', import.meta.url), 'utf8')
const uiSource = await readFile(new URL('../src/UI.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

let startWithoutEmail
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'startWithoutEmail') {
    startWithoutEmail = node.initializer.getText(ast)
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(startWithoutEmail)

const handlerJS = ts.transpileModule(`globalThis.startWithoutEmail=${startWithoutEmail}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness() {
  const pending = deferred()
  const state = { calls: 0, busy: false, error: null, view: 'onboarding', saved: false }
  const scope = vm.createContext({
    Error,
    sessionChecked: true,
    anonymousBusyRef: { current: false },
    authEpochRef: { current: 0 },
    authUserRef: { current: null },
    supabase: { auth: { signInAnonymously: () => { state.calls++; return pending.promise } } },
    setAnonymousBusy: value => { state.busy = value },
    setAuthError: value => { state.error = value },
    setView: value => { state.view = value },
    localStorage: { setItem: () => { state.saved = true } },
  })
  vm.runInContext(handlerJS, scope)
  return { scope, state, pending, start: scope.startWithoutEmail }
}

test('zero-email architecture contains no OTP or Magic Link fallback', () => {
  assert.doesNotMatch(source, /signInWithOtp|sendMagicLink|authEmail|emailMode|Gửi Magic Link|Magic Link/)
  assert.match(source, /signInAnonymously/)
})

test('profile onboarding uses 12 Vietnamese zodiac avatars instead of initial-letter placeholders', () => {
  assert.match(setupSource, /ZODIAC_OPTIONS/)
  assert.doesNotMatch(setupSource, /type="file"/)
  assert.equal([...zodiacSource.matchAll(/\{ key: '/g)].length, 12)
  assert.match(zodiacSource, /key: 'cat',[^\n]+animal: 'Mèo'/)
  assert.doesNotMatch(uiSource, /slice\(0,1\)/)
})

test('deep-link invite is redeemed automatically instead of requiring confirmation', () => {
  assert.match(setupSource, /deepLinkMode/)
  assert.match(setupSource, /void join\(code\)/)
  assert.doesNotMatch(setupSource, /Xác nhận tham gia/)
  assert.match(setupSource, /Bạn không cần nhập lại mã/)
})

test('rapid anonymous bootstrap calls create only one identity request', async () => {
  const h = harness()
  const first = h.start()
  await h.start()
  assert.equal(h.state.calls, 1)
  assert.equal(h.state.busy, true)
  h.pending.resolve({ error: null })
  await first
  assert.equal(h.state.saved, true)
  assert.equal(h.state.busy, false)
  assert.equal(h.scope.anonymousBusyRef.current, false)
})

test('bootstrap never replaces an existing identity', async () => {
  const h = harness()
  h.scope.authUserRef.current = 'existing-user'
  await h.start()
  assert.equal(h.state.calls, 0)
})

test('bootstrap waits until the existing session check is complete', async () => {
  const h = harness()
  h.scope.sessionChecked = false
  await h.start()
  assert.equal(h.state.calls, 0)
})

for (const error of [
  { code: 'anonymous_provider_disabled', message: 'Provider unavailable' },
  new Error('Anonymous sign-ins are disabled'),
]) {
  test(`disabled anonymous provider surfaces configuration error without email fallback (${error.code ?? 'message'})`, async () => {
    const h = harness()
    const work = h.start()
    h.pending.resolve({ error })
    await work
    assert.equal(h.state.view, 'login')
    assert.match(h.state.error, /Anonymous Sign-ins đang tắt/)
    assert.doesNotMatch(h.state.error, /email|Magic Link/i)
    assert.equal(h.state.busy, false)
  })
}

test('late bootstrap failure cannot overwrite a newer session', async () => {
  const h = harness()
  const work = h.start()
  h.scope.authEpochRef.current++
  h.scope.authUserRef.current = 'new-user'
  h.state.view = 'today'
  h.state.error = 'new session state'
  h.pending.reject(new Error('late failure'))
  await work
  assert.equal(h.state.view, 'today')
  assert.equal(h.state.error, 'new session state')
  assert.equal(h.state.busy, false)
})
