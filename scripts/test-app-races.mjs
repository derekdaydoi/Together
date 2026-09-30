// Execute the actual App effect/handlers with controlled network responses.
// No browser, generated files, or live Supabase requests are needed.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const handlers = {}
let remoteEffect
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['updateState', 'startWithoutEmail'].includes(node.name.getText(ast))) {
    handlers[node.name.getText(ast)] = node.initializer.getText(ast)
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1]?.getText(ast) === '[authUserId,remoteRetry]') remoteEffect = node.arguments[0].getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(remoteEffect && handlers.updateState && handlers.startWithoutEmail)
function run(scope, code) {
  return vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope)
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
const snapshot = (plans = [{ id: 'p', revision: 1, status: 'proposed' }]) => ({
  id: 'couple', me: { id: 'A' }, plans, workSchedules: [], availability: [],
})

function remoteHarness() {
  const state = { value: snapshot(), view: 'today', status: '', error: null, subscriptions: [], unsubscribed: 0 }
  const loads = [], profiles = [], queued = [], events = new Map()
  let queueState = false
  const scope = vm.createContext({
    Error, structuredClone, supabase: {}, authUserId: 'A',
    authUserRef: { current: 'A' }, authEpochRef: { current: 0 },
    mutationVersionRef: { current: 0 }, requestRefreshRef: { current: null },
    sessionIsCurrent: () => scope.authEpochRef.current === 0,
    loadRemoteState: () => { const d = deferred(); loads.push(d); return d.promise },
    loadRemoteProfileState: () => { const d = deferred(); profiles.push(d); return d.promise },
    setState: update => {
      const apply = () => { state.value = typeof update === 'function' ? update(state.value) : update }
      if (queueState) queued.push(apply)
      else apply()
    },
    setView: value => { state.view = value },
    setRemoteStatus: value => { state.status = value },
    setRemoteError: value => { state.error = value },
    setSelectedPlan: () => {}, setEditingPlan: () => {},
    subscribeRemote: (id, refresh) => {
      state.subscriptions.push(id)
      state.realtime = refresh
      return () => { state.unsubscribed++ }
    },
    localStorage: { setItem: () => {} },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    document: { visibilityState: 'visible', addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  })
  run(scope, `globalThis.updateState=${handlers.updateState}; globalThis.cleanup=(${remoteEffect})()`)
  return {
    state, scope, loads, profiles, events,
    mutate: fn => scope.updateState(fn), refresh: () => scope.requestRefreshRef.current(),
    queue: () => { queueState = true },
    flush: () => { queueState = false; while (queued.length) queued.shift()() },
    cleanup: () => scope.cleanup(),
    ready: async (value = snapshot()) => { loads[0].resolve(value); await settle() },
  }
}

for (const [name, mutate] of [
  ['edited revision', d => { d.plans[0] = { id: 'p', revision: 2, status: 'proposed', title: 'new' } }],
  ['confirmation', d => { d.plans[0] = { id: 'p', revision: 2, status: 'confirmed' } }],
  ['cancellation', d => { d.plans[0] = { id: 'p', revision: 2, status: 'cancelled' } }],
  ['deleted plan', d => { d.plans = [] }],
  ['newly saved plan', d => { d.plans.push({ id: 'new', revision: 1, status: 'proposed' }) }],
  ['schedule deletion without revisions', d => { d.workSchedules = [] }],
]) {
  test(`late refresh preserves ${name} and refetches without a Realtime event`, async () => {
    const h = remoteHarness()
    const old = snapshot(); old.workSchedules = [{ id: 'work' }]
    await h.ready(old)
    h.refresh()
    h.mutate(mutate)
    const expected = structuredClone(h.state.value)
    h.loads[1].resolve(old)
    await settle()
    assert.deepEqual(h.state.value, expected)
    assert.equal(h.loads.length, 3)
    h.loads[2].resolve(expected)
    await settle()
    assert.deepEqual(h.state.value, expected)
    assert.deepEqual(h.state.subscriptions, ['couple'])
    h.cleanup()
  })
}

test('initial load also rejects a snapshot superseded by a mutation', async () => {
  const h = remoteHarness()
  h.mutate(d => { d.plans = [] })
  h.loads[0].resolve(snapshot())
  await settle()
  assert.equal(h.state.value.plans.length, 0)
  assert.equal(h.loads.length, 2)
  h.loads[1].resolve(snapshot([])); await settle()
  assert.equal(h.state.status, 'ready')
  h.cleanup()
})

test('late no-couple profile cannot erase a newly connected couple or navigate away', async () => {
  const h = remoteHarness(); await h.ready()
  h.state.view = 'connect'
  h.refresh(); h.loads[1].resolve(null); await settle()
  h.mutate(d => { d.id = 'new-couple' })
  h.profiles[0].resolve({ id: '', me: { id: 'A' }, plans: [] }); await settle()
  assert.equal(h.state.value.id, 'new-couple')
  assert.equal(h.state.view, 'connect')
  assert.equal(h.state.unsubscribed, 0)
  h.loads[2].resolve({ ...snapshot(), id: 'new-couple' }); await settle()
  assert.deepEqual(h.state.subscriptions, ['couple', 'new-couple'])
  assert.equal(h.state.unsubscribed, 1)
  h.cleanup()
})

test('current no-couple response still clears state and removes the subscription', async () => {
  const h = remoteHarness(); await h.ready()
  h.refresh(); h.loads[1].resolve(null); await settle()
  h.profiles[0].resolve({ id: '', me: { id: 'A' }, plans: [] }); await settle()
  assert.equal(h.state.value.id, '')
  assert.equal(h.state.view, 'profile')
  assert.equal(h.state.unsubscribed, 1)
  h.cleanup()
})

test('profile save refetch preserves the next setup screen for an unpaired user', async () => {
  const h = remoteHarness()
  h.loads[0].resolve(null); await settle()
  const profile = { id: '', me: { id: 'A', displayName: 'Before' }, plans: [] }
  h.profiles[0].resolve(profile); await settle()
  assert.equal(h.state.view, 'profile')
  h.mutate(d => { d.me.displayName = 'After' })
  h.state.view = 'connect'
  h.loads[1].resolve(null); await settle()
  h.profiles[1].resolve({ ...profile, me: { id: 'A', displayName: 'After' } }); await settle()
  assert.equal(h.state.view, 'connect')
  assert.equal(h.state.value.me.displayName, 'After')
  assert.equal(h.state.subscriptions.length, 0)
  h.cleanup()
})

test('snapshot updater delayed by React checks mutations again when evaluated', async () => {
  const h = remoteHarness(); await h.ready(snapshot([{ id: 'p', revision: 2, status: 'confirmed' }]))
  h.queue(); h.refresh()
  h.loads[1].resolve(snapshot()); await settle()
  h.mutate(d => { d.workSchedules.push({ id: 'new-work' }) })
  h.flush()
  assert.equal(h.state.value.plans[0].revision, 2)
  assert.equal(h.state.value.workSchedules.length, 1)
  h.loads[2].resolve(h.state.value); await settle()
  h.cleanup()
})

test('obsolete refresh errors do not hide a successful mutation', async () => {
  const h = remoteHarness(); await h.ready()
  h.refresh(); h.mutate(d => { d.plans = [] })
  h.loads[1].reject(new Error('outdated request failed')); await settle()
  assert.equal(h.state.status, 'ready'); assert.equal(h.state.error, null)
  assert.equal(h.loads.length, 3)
  h.loads[2].resolve(snapshot([])); await settle(); h.cleanup()
})

test('current refresh errors remain visible and a later focus retries', async () => {
  const h = remoteHarness(); await h.ready()
  h.refresh(); h.loads[1].reject(new Error('offline')); await settle()
  assert.equal(h.state.status, 'error'); assert.equal(h.state.error, 'offline')
  h.events.get('focus')(); h.loads[2].resolve(snapshot()); await settle()
  assert.equal(h.state.status, 'ready'); assert.equal(h.state.error, null)
  h.cleanup()
})

test('Realtime bursts are coalesced while a request is in flight', async () => {
  const h = remoteHarness(); await h.ready()
  h.refresh(); h.refresh(); h.state.realtime(); h.events.get('focus')()
  assert.equal(h.loads.length, 2)
  h.loads[1].resolve(snapshot()); await settle()
  assert.equal(h.loads.length, 3)
  h.loads[2].resolve(snapshot()); await settle(); h.cleanup()
})

test('same user returning in a new auth epoch cannot receive an old snapshot', async () => {
  const h = remoteHarness(); await h.ready()
  h.refresh(); h.scope.authEpochRef.current += 2
  h.state.value = snapshot([])
  h.loads[1].resolve(snapshot()); await settle()
  assert.equal(h.state.value.plans.length, 0)
  h.cleanup()
})

test('effect cleanup prevents late commits and detaches its refresh request', async () => {
  const h = remoteHarness(); await h.ready()
  h.refresh(); h.cleanup(); h.state.value = snapshot([])
  h.loads[1].resolve(snapshot()); await settle()
  assert.equal(h.state.value.plans.length, 0)
  assert.equal(h.scope.requestRefreshRef.current, null)
  assert.equal(h.events.size, 0)
})

function anonymousHarness() {
  const pending = deferred()
  const state = { calls: 0, busy: false, error: null, view: 'onboarding', saved: false }
  const scope = vm.createContext({
    Error, sessionChecked: true, anonymousBusy: false, anonymousBusyRef: { current: false },
    authEpochRef: { current: 0 }, authUserRef: { current: null },
    supabase: { auth: { signInAnonymously: () => { state.calls++; return pending.promise } } },
    setAnonymousBusy: value => { state.busy = value }, setAuthError: value => { state.error = value },
    setView: value => { state.view = value }, localStorage: { setItem: () => { state.saved = true } },
  })
  run(scope, `globalThis.start=${handlers.startWithoutEmail}`)
  return { scope, state, pending, start: scope.start }
}

test('anonymous failure after another sign-in cannot change its screen or error', async () => {
  const h = anonymousHarness(); const work = h.start()
  h.scope.authEpochRef.current++; h.scope.authUserRef.current = 'B'
  h.state.view = 'today'; h.state.error = 'new session message'
  h.pending.reject(new Error('late failure')); await work
  assert.equal(h.state.view, 'today'); assert.equal(h.state.error, 'new session message')
  assert.equal(h.state.busy, false); assert.equal(h.scope.anonymousBusyRef.current, false)
})

test('anonymous duplicate calls in the same render create only one request', async () => {
  const h = anonymousHarness(); const work = h.start(); await h.start()
  assert.equal(h.state.calls, 1); assert.equal(h.state.busy, true)
  h.pending.resolve({ error: null }); await work
  assert.equal(h.state.saved, true); assert.equal(h.state.busy, false)
})

test('anonymous same-session failure surfaces and releases the request lock', async () => {
  const h = anonymousHarness(); const work = h.start()
  h.pending.reject(new Error('network failure')); await work
  assert.equal(h.state.error, 'network failure'); assert.equal(h.state.view, 'login')
  assert.equal(h.scope.anonymousBusyRef.current, false)
  await h.start(); assert.equal(h.state.calls, 2)
})

test('anonymous startup waits for session checking and preserves an existing identity', async () => {
  const h = anonymousHarness()
  h.scope.sessionChecked = false; await h.start(); assert.equal(h.state.calls, 0)
  h.scope.sessionChecked = true; h.scope.authUserRef.current = 'A'
  await h.start(); assert.equal(h.state.calls, 0)
})

for (const error of [
  { code: 'anonymous_provider_disabled', message: 'Provider unavailable' },
  new Error('Anonymous sign-ins are disabled'),
]) {
  test(`disabled anonymous provider surfaces actionable configuration error (${error.code ?? 'message'})`, async () => {
    const h = anonymousHarness(); const work = h.start()
    h.pending.resolve({ error }); await work
    assert.equal(h.state.view, 'login')
    assert.match(h.state.error, /Anonymous access/)
    assert.doesNotMatch(h.state.error, /email|Magic Link/i)
    assert.equal(h.state.busy, false)
  })
}

test('late disabled-provider error does not overwrite a new session', async () => {
  const h = anonymousHarness(); const work = h.start()
  h.scope.authEpochRef.current++; h.state.view = 'today'
  h.pending.resolve({ error: { code: 'anonymous_provider_disabled' } }); await work
  assert.equal(h.state.view, 'today')
  assert.equal(h.state.error, null)
})
