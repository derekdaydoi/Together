import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/account.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
})
const dir = await mkdtemp(join(tmpdir(), 'together-account-'))
try {
  const filepath = join(dir, 'account.mjs')
  await writeFile(filepath, outputText)
  const { accountFromUser, describeAuthError } = await import(pathToFileURL(filepath).href)
  assert.equal(accountFromUser(null), null)
  assert.deepEqual(accountFromUser({ is_anonymous: true, email: null }), { isAnonymous: true, email: undefined })
  assert.equal(accountFromUser({ is_anonymous: false, email: 'me@example.org' }).isAnonymous, false)
  assert.equal(accountFromUser({}).isAnonymous, true, 'unknown identity must not be considered protected')
  assert.match(describeAuthError({ code: 'identity_already_exists' }), /khôi phục/)
  assert.match(describeAuthError({ message: 'Manual linking is disabled' }), /Manual Linking/)
  assert.doesNotMatch(describeAuthError({ message: 'internal-secret' }), /internal-secret/)
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /view==='login'\|\|localStorage\.getItem\('together-google-recovery'\)/)
  assert.match(app, /void startWithGoogle\(\)/)
  assert.match(app, /googleRecoveryEnabled&&<button/, 'Google login must be gated')
  const release = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')
  assert.match(release, /VITE_GOOGLE_RECOVERY_ENABLED: 'false'/, 'ship no-email first')
  console.log('PASS: account recovery helper and recovery gating')
} finally { await rm(dir, { recursive: true, force: true }) }
