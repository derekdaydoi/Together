import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['readAuthCallbackError', 'authErrorText', 'isRateLimitError', 'friendlyAuthError', 'authRedirectUrl']
const declarations = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(ast))))
const js = ts.transpileModule(declarations.map(n => n.getText(ast).replace(/^export /, '')).join('\n'), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText
const context = vm.createContext({URL, URLSearchParams})
vm.runInContext(`${js}\nglobalThis.helpers={${names.join(',')}}`, context)
const h = context.helpers

test('callback errors decode once and preserve literal percent and plus signs', () => {
  assert.equal(h.readAuthCallbackError('', '#error_description=100%25+invalid%2Blink'), '100% invalid+link')
  assert.equal(h.readAuthCallbackError('?error_code=otp_expired&error_description=Expired', ''), 'otp_expired: Expired')
  assert.equal(h.readAuthCallbackError('', '#access_token=secret'), null)
  assert.equal(h.readAuthCallbackError('?error=access_denied', ''), 'access_denied')
})
test('redirect follows actual origin and base for dev, local production preview and hosted app', () => {
  assert.equal(h.authRedirectUrl('http://localhost:3000', '/'), 'http://localhost:3000/')
  assert.equal(h.authRedirectUrl('http://localhost:3000', '/Together/'), 'http://localhost:3000/Together/')
  assert.equal(h.authRedirectUrl('https://derekdaydoi.github.io', '/Together/'), 'https://derekdaydoi.github.io/Together/')
})
test('structured Auth codes distinguish quotas, invalid email, expired links, SMTP and network', () => {
  assert.ok(h.isRateLimitError(h.authErrorText({status:429,message:'Request rejected'})))
  assert.ok(h.isRateLimitError(h.authErrorText({code:'over_email_send_rate_limit',message:'Rejected'})))
  assert.match(h.friendlyAuthError('email_address_invalid: invalid email'), /địa chỉ email/)
  assert.match(h.friendlyAuthError('otp_expired: expired'), /hết hạn/)
  assert.match(h.friendlyAuthError('Error sending confirmation email'), /cấu hình email/)
  assert.match(h.friendlyAuthError('Failed to fetch'), /kết nối mạng/)
})

let handler
function find(node) {
  if(ts.isVariableDeclaration(node) && node.name.getText(ast)==='sendMagicLink')handler=node.initializer.getText(ast)
  ts.forEachChild(node,find)
}
find(ast)
assert.ok(handler)
const handlerJS=ts.transpileModule(`globalThis.sendMagicLink=${handler.replace('import.meta.env.BASE_URL', "'/'")}`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function harness(request,email=' person@example.com ') {
  const state={sending:false,error:null,sent:false,cooldown:0,calls:0}
  const scope=vm.createContext({
    ...h,authEmail:email,authCooldown:0,authSendingRef:{current:false},authEpochRef:{current:0},
    supabase:{auth:{signInWithOtp:args=>{state.calls++;state.args=args;return request(args)}}},
    setAuthSending:value=>state.sending=value,setAuthError:value=>state.error=value,
    setAuthSent:value=>state.sent=value,setAuthCooldown:value=>state.cooldown=value,
    sessionStorage:{setItem:()=>{}},window:{location:{origin:'http://localhost:3000'}},notify:()=>{},
  })
  vm.runInContext(handlerJS,scope)
  return {state,scope,send:scope.sendMagicLink}
}
test('rapid duplicate submissions make one request and release pending state',async()=>{
  let resolve
  const pending=new Promise(r=>resolve=r)
  const {state,send}=harness(()=>pending)
  const first=send()
  await send()
  assert.equal(state.calls,1)
  assert.equal(state.sending,true)
  resolve({error:null})
  await first
  assert.equal(state.sent,true)
  assert.equal(state.cooldown,60)
  assert.equal(state.sending,false)
  assert.equal(state.args.email,'person@example.com')
  assert.equal(state.args.options.emailRedirectTo,'http://localhost:3000/')
})
test('rejected network request surfaces error and releases lock for retry',async()=>{
  const {state,send}=harness(()=>Promise.reject(new Error('Failed to fetch')))
  await send()
  assert.match(state.error,/Failed to fetch/)
  assert.equal(state.sending,false)
  await send()
  assert.equal(state.calls,2)
})
test('provider rate limit response is shown and starts minimum cooldown',async()=>{
  const {state,send}=harness(async()=>({error:{status:429,code:'over_email_send_rate_limit',message:'Rejected'}}))
  await send()
  assert.equal(state.sent,false)
  assert.equal(state.cooldown,60)
  assert.ok(h.isRateLimitError(state.error))
})
test('invalid email does not issue an Auth request',async()=>{
  const {state,send}=harness(async()=>({error:null}),'bad address')
  await send()
  assert.equal(state.calls,0)
  assert.match(state.error,/email hợp lệ/)
})
test('late request result cannot replace state after account changes',async()=>{
  let resolve
  const pending=new Promise(r=>resolve=r)
  const {state,scope,send}=harness(()=>pending)
  const first=send()
  scope.authEpochRef.current++
  resolve({error:{message:'Late failure'}})
  await first
  assert.equal(state.error,null)
  assert.equal(state.sending,false)
})
