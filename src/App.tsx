import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import type { View, Tone } from './appTypes'
import type { CoupleState, SharedPlan } from './types'
import { BottomNav, BrandMark, Shell, Signature, TopBack } from './UI'
import { loadDemoState, saveDemoState } from './lib/demoStore'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { loadRemoteProfileState, loadRemoteState, subscribeRemote } from './lib/remoteStore'
import { Onboarding, ProfileSetup, Connect } from './screens-setup'
import { Today, Week, Us } from './screens-home'
import { Plans } from './screens-plans'
import { CheckinForm, DailyStateForm } from './screens-forms'
import { PlanDetail, PlanForm } from './screens-plan'
import { AvailabilityForm, WorkForm } from './screens-schedule'

type ToastState={message:string;tone?:Tone}

// A remote account must never inherit the locally cached demo or another
// account's profile, couple, schedules, and private check-ins.
const emptyRemoteState=(userId=''):CoupleState=>({
  id:'',name:'Chúng mình',inviteCode:'',
  me:{id:userId,displayName:'Bạn'},
  partner:{id:'waiting-partner',displayName:'Người ấy'},
  dailyStates:[],workSchedules:[],availability:[],plans:[],checkins:[],
})

const initialView=():View=>{
  if(!localStorage.getItem('together-onboarded'))return 'onboarding'
  return isSupabaseConfigured?'login':'today'
}

// URLSearchParams already decodes percent escapes. Decoding again can throw on
// a literal percent sign in an Auth error and crash the callback page.
export const readAuthCallbackError=(search:string,hash:string)=>{
  for(const part of [search,hash.replace(/^#/, '')]){
    const params=new URLSearchParams(part)
    const message=params.get('error_description')??params.get('error')
    if(message)return [params.get('error_code'),message].filter(Boolean).join(': ')
  }
  return null
}
export const authErrorText=(error:unknown)=>{
  if(error&&typeof error==='object'){
    const detail=error as {message?:string;code?:string;status?:number}
    return [detail.code,detail.status===429?'rate limit':null,detail.message].filter(Boolean).join(': ')||'Không thể gửi email đăng nhập.'
  }
  return 'Không thể gửi email đăng nhập. Kiểm tra kết nối rồi thử lại.'
}
export const isRateLimitError=(value:string|null)=>Boolean(value&&/(rate.?limit|too many requests|over_email_send_rate_limit|over_request_rate_limit)/i.test(value))
export const friendlyAuthError=(value:string)=>{
  if(isRateLimitError(value))return 'Dịch vụ email đang tạm giới hạn số lần gửi. Chờ rồi thử lại; thời gian chờ của dịch vụ có thể lâu hơn bộ đếm trên nút.'
  if(/(email_address_invalid|email_address_not_authorized|invalid email)/i.test(value))return 'Kiểm tra địa chỉ email. Nếu địa chỉ đúng nhưng chưa được phép nhận thư, quản trị viên cần kiểm tra cấu hình gửi email.'
  if(/(otp_expired|expired|invalid.*(link|token)|(link|token).*invalid)/i.test(value))return 'Link này đã hết hạn hoặc đã được dùng. Hãy gửi một link mới rồi chỉ mở email mới nhất.'
  if(/(smtp|error sending|email.*(disabled|not enabled))/i.test(value))return 'Dịch vụ chưa gửi được email. Quản trị viên cần kiểm tra cấu hình email và nhật ký Supabase.'
  if(/(fetch|network|load failed)/i.test(value))return 'Không kết nối được dịch vụ đăng nhập. Kiểm tra kết nối mạng rồi thử lại.'
  return value
}
// Follow the actual host, including localhost when previewing a production build.
export const authRedirectUrl=(origin:string,base:string)=>new URL(base,origin).toString()
const callbackError=readAuthCallbackError(window.location.search,window.location.hash)

export default function App(){
  const [state,setState]=useState<CoupleState>(()=>isSupabaseConfigured?emptyRemoteState():loadDemoState())
  const [view,setView]=useState<View>(initialView)
  const [previousView,setPreviousView]=useState<View>('today')
  const [toast,setToast]=useState<ToastState|null>(null)
  const [selectedPlan,setSelectedPlan]=useState<SharedPlan|null>(null)
  const [editingPlan,setEditingPlan]=useState<SharedPlan|null>(null)
  const [suggestedPlan,setSuggestedPlan]=useState<{date:string;start:string;end:string}|null>(null)
  const [authEmail,setAuthEmail]=useState(()=>sessionStorage.getItem('together-auth-email')??'')
  const [authSent,setAuthSent]=useState(false)
  const [authSending,setAuthSending]=useState(false)
  const [anonymousBusy,setAnonymousBusy]=useState(false)
  const anonymousBusyRef=useRef(false)
  const [emailMode,setEmailMode]=useState(false)
  const [authIsAnonymous,setAuthIsAnonymous]=useState(false)
  const authSendingRef=useRef(false)
  const [authError,setAuthError]=useState<string|null>(null)
  const [authCooldown,setAuthCooldown]=useState(0)
  const [authUserId,setAuthUserId]=useState<string|null>(null)
  const authUserRef=useRef<string|null>(null)
  const authEpochRef=useRef(0)
  const mutationVersionRef=useRef(0)
  const requestRefreshRef=useRef<(()=>void)|null>(null)
  const sessionReady=!isSupabaseConfigured||Boolean(authUserId)
  const [sessionChecked,setSessionChecked]=useState(!isSupabaseConfigured)
  const [remoteStatus,setRemoteStatus]=useState<'loading'|'ready'|'error'>(isSupabaseConfigured?'loading':'ready')
  const [remoteError,setRemoteError]=useState<string|null>(null)
  const [remoteRetry,setRemoteRetry]=useState(0)

  useEffect(()=>{if(!isSupabaseConfigured)saveDemoState(state)},[state])
  useEffect(()=>{if(!toast)return;const t=window.setTimeout(()=>setToast(null),2400);return()=>window.clearTimeout(t)},[toast])
  useEffect(()=>{if(authCooldown<=0)return;const t=window.setTimeout(()=>setAuthCooldown(v=>Math.max(0,v-1)),1000);return()=>window.clearTimeout(t)},[authCooldown])
  useEffect(()=>{
    if(callbackError){setAuthError(callbackError);localStorage.setItem('together-onboarded','1');setView('login')}
  },[])
  useEffect(()=>{
    if(!supabase)return
    let alive=true
    let authEventObserved=false
    const applySession=(userId:string|null,isAnonymous=false)=>{
      if(!alive)return
      if(authUserRef.current!==userId){
        if(authUserRef.current&&!userId){sessionStorage.removeItem('together-auth-email');setAuthEmail('')}
        authUserRef.current=userId
        authEpochRef.current++
        setState(emptyRemoteState(userId??''))
        setSelectedPlan(null)
        setEditingPlan(null)
        setSuggestedPlan(null)
        setPreviousView('today')
        setToast(null)
        setRemoteError(null)
        setRemoteStatus('loading')
        setView(userId?'today':'login')
      }
      setAuthUserId(userId)
      setAuthIsAnonymous(isAnonymous)
      setSessionChecked(true)
    }
    supabase.auth.getSession().then(({data,error})=>{
      if(!alive||authEventObserved)return
      if(error)setAuthError(error.message)
      applySession(data.session?.user.id??null,Boolean(data.session?.user.is_anonymous))
    }).catch(error=>{
      if(!alive||authEventObserved)return
      setAuthError(error instanceof Error?error.message:'Không thể kiểm tra phiên đăng nhập.')
      applySession(null)
    })
    const{data:l}=supabase.auth.onAuthStateChange((event,session)=>{
      authEventObserved=true
      applySession(session?.user.id??null,Boolean(session?.user.is_anonymous))
      if(session){localStorage.setItem('together-onboarded','1');setAuthError(null);setAuthCooldown(0)}
      if(event==='SIGNED_OUT'){setAuthSent(false);setView('login')}
    })
    return()=>{alive=false;l.subscription.unsubscribe()}
  },[])
  useEffect(()=>{
    if(!supabase||!authUserId)return
    let dead=false
    let unsubscribe=()=>{}
    let subscribedCoupleId:string|null=null
    let initialLoad=true
    const sessionEpoch=authEpochRef.current
    const isActive=()=>!dead&&authUserRef.current===authUserId&&authEpochRef.current===sessionEpoch
    // Realtime can deliver several events for one action. Process refreshes in
    // order, then rerun once when changes arrive during an in-flight request.
    let refreshInFlight=false
    let refreshAgain=false
    const refresh=async()=>{
      if(!isActive())return
      if(refreshInFlight){refreshAgain=true;return}
      refreshInFlight=true
      try {
        do {
          refreshAgain=false
          const mutationVersion=mutationVersionRef.current
          try {
            const fresh=await loadRemoteState()
            if(!isActive())return
            if(mutationVersionRef.current!==mutationVersion){refreshAgain=true;continue}
            if(fresh){
              // React may evaluate this updater after a local mutation was queued.
              setState(old=>isActive()&&mutationVersionRef.current===mutationVersion?fresh:old)
              if(initialLoad)setView('today')
              if(subscribedCoupleId!==fresh.id){
                unsubscribe()
                subscribedCoupleId=fresh.id
                unsubscribe=subscribeRemote(fresh.id,refresh)
              }
            }
            else{
              const profile=await loadRemoteProfileState()
              if(!isActive())return
              if(mutationVersionRef.current!==mutationVersion){refreshAgain=true;continue}
              const lostCouple=subscribedCoupleId!==null
              unsubscribe();unsubscribe=()=>{};subscribedCoupleId=null
              setState(old=>isActive()&&mutationVersionRef.current===mutationVersion?profile:old)
              setSelectedPlan(null);setEditingPlan(null)
              if(initialLoad||lostCouple)setView('profile')
            }
            if(initialLoad)localStorage.setItem('together-onboarded','1')
            initialLoad=false
            setRemoteError(null);setRemoteStatus('ready')
          }catch(error){
            if(!isActive())return
            if(mutationVersionRef.current!==mutationVersion){refreshAgain=true;continue}
            setRemoteError(error instanceof Error?error.message:'Không thể đồng bộ dữ liệu.');setRemoteStatus('error')
            return
          }
        } while(refreshAgain&&isActive())
      } finally {refreshInFlight=false}
    }
    setRemoteStatus('loading')
    setRemoteError(null)
    const requestRefresh=()=>{void refresh()}
    requestRefreshRef.current=requestRefresh
    void refresh()
    // Browser sleep/offline transitions can drop change events even when a
    // websocket reconnects. Refresh the authorized couple snapshot on return.
    const refreshWhenVisible=()=>{if(document.visibilityState==='visible')void refresh()}
    const refreshWhenFocused=()=>{void refresh()}
    document.addEventListener('visibilitychange',refreshWhenVisible)
    window.addEventListener('focus',refreshWhenFocused)
    return()=>{
      dead=true;unsubscribe()
      if(requestRefreshRef.current===requestRefresh)requestRefreshRef.current=null
      document.removeEventListener('visibilitychange',refreshWhenVisible)
      window.removeEventListener('focus',refreshWhenFocused)
    }
  },[authUserId,remoteRetry])
  useEffect(()=>{
    if(remoteStatus!=='error')return
    const retry=()=>setRemoteRetry(value=>value+1)
    window.addEventListener('online',retry)
    return()=>window.removeEventListener('online',retry)
  },[remoteStatus])

  // Async callbacks from unmounted screens must not write into a new session.
  const updateEpoch=authEpochRef.current
  const sessionIsCurrent=()=>authEpochRef.current===updateEpoch
  const updateState=(fn:(draft:CoupleState)=>void)=>{
    if(!sessionIsCurrent())return
    // Invalidate pending snapshots before React runs the state updater. Request
    // another read even if Realtime misses the corresponding mutation event.
    mutationVersionRef.current++
    setState(old=>{if(!sessionIsCurrent())return old;const draft=structuredClone(old);fn(draft);return draft})
    requestRefreshRef.current?.()
  }
  const navigate=(next:View)=>{if(sessionIsCurrent())setView(next)}
  const open=(next:View,from:View=view)=>{if(!sessionIsCurrent())return;if(next==='plan'){setEditingPlan(null);setSuggestedPlan(null)}setPreviousView(from);window.scrollTo({top:0,behavior:'smooth'});setView(next)}
  const suggestPlan=(date:string,start:string,end:string,from:View)=>{open('plan',from);setSuggestedPlan({date,start,end})}
  const notify=(message:string,tone:Tone='success')=>{if(sessionIsCurrent())setToast({message,tone})}
  const startWithoutEmail=async()=>{
    if(!supabase||!sessionChecked||authUserRef.current||anonymousBusyRef.current)return
    anonymousBusyRef.current=true
    const requestEpoch=authEpochRef.current
    setAnonymousBusy(true);setAuthError(null)
    try{
      const {error}=await supabase.auth.signInAnonymously()
      if(error)throw error
      localStorage.setItem('together-onboarded','1')
      // onAuthStateChange and the remote loader handle the next screen.
    }catch(error){
      if(authEpochRef.current!==requestEpoch)return
      const detail=error as {code?:string;message?:string}|null
      const anonymousDisabled=detail?.code==='anonymous_provider_disabled'||/Anonymous sign-ins are disabled/i.test(detail?.message??'')
      if(anonymousDisabled)setEmailMode(true)
      setAuthError(anonymousDisabled
        ?'Đăng nhập không cần email chưa được bật. Bạn có thể nhập email bên dưới và chọn Gửi Magic Link để tiếp tục.'
        :error instanceof Error?error.message:'Không thể khởi tạo không gian riêng.')
      setView('login')
    }finally{anonymousBusyRef.current=false;setAnonymousBusy(false)}
  }
  const finishOnboarding=()=>{
    localStorage.setItem('together-onboarded','1')
    if(supabase)void startWithoutEmail()
    else setView('profile')
  }
  // First-time members had no couple during the initial session load, so they
  // must start their couple-scoped realtime subscription after creating/joining.
  const finishCoupleSetup=()=>{if(!sessionIsCurrent())return;if(supabase)setRemoteRetry(value=>value+1);setView('today')}
  const backToOnboarding=()=>{localStorage.removeItem('together-onboarded');setAuthSent(false);setAuthError(null);setAuthCooldown(0);setView('onboarding')}
  const backToLogin=async()=>{
    if(authIsAnonymous&&!window.confirm('Tài khoản hiện tại chưa có email khôi phục. Đăng xuất có thể khiến bạn mất quyền truy cập lịch và dữ liệu hai người. Vẫn đăng xuất?'))return
    setAuthSent(false);setAuthError(null);setAuthCooldown(0)
    if(supabase){
      setRemoteStatus('loading')
      const{error}=await supabase.auth.signOut()
      if(error){setRemoteStatus('ready');notify(error.message,'normal');return}
    }
    setView('login')
  }
  const sendMagicLink=async()=>{
    if(!supabase||authSendingRef.current||authCooldown>0)return
    const email=authEmail.trim().toLowerCase()
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      setAuthError('Vui lòng nhập địa chỉ email hợp lệ.');return
    }
    authSendingRef.current=true
    setAuthSending(true);setAuthError(null);setAuthSent(false)
    const requestEpoch=authEpochRef.current
    try{
      const redirectTo=authRedirectUrl(window.location.origin,import.meta.env.BASE_URL)
      // Storage can be disabled; it must not prevent requesting a link.
      try{sessionStorage.setItem('together-auth-email',email)}catch{/* optional convenience */}
      const{error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}})
      if(error)throw error
      if(authEpochRef.current!==requestEpoch)return
      setAuthSent(true);setAuthCooldown(60)
    }catch(error){
      if(authEpochRef.current!==requestEpoch)return
      const message=authErrorText(error)
      setAuthError(message)
      if(isRateLimitError(message))setAuthCooldown(60)
      notify(friendlyAuthError(message),'normal')
    }finally{
      authSendingRef.current=false
      setAuthSending(false)
    }
  }

  if(view==='onboarding')return <Shell minimal><Onboarding onStart={finishOnboarding} busy={anonymousBusy||(isSupabaseConfigured&&!sessionChecked)}/>{authError&&<div className="auth-error" role="alert">{authError}</div>}</Shell>

  if(isSupabaseConfigured&&sessionReady&&remoteStatus!=='ready')return <Shell minimal><div className="auth-page">
    <div className="auth-brand"><BrandMark/></div>
    <div className="auth-copy"><span className="eyebrow">Đồng bộ không gian chung</span>
      <h1>{remoteStatus==='loading'?'Đang kết nối hai người…':'Chưa tải được dữ liệu của hai bạn.'}</h1>
      <p>{remoteStatus==='loading'?'Together đang tải lịch, trạng thái và kế hoạch đã lưu.':'Dữ liệu đã lưu vẫn ở Supabase. Hãy thử kết nối lại.'}</p>
    </div>
    {remoteStatus==='loading'?<div className="auth-card auth-loading"><span className="auth-spinner"/><p>Đang đồng bộ…</p></div>:<div className="auth-card">
      <div className="auth-error"><CircleAlert size={17}/><span>{remoteError??'Kết nối thất bại.'}</span></div>
      <button className="primary-button" onClick={()=>setRemoteRetry(value=>value+1)}>Thử kết nối lại</button>
      <button className="text-button" onClick={backToLogin}>Đăng nhập tài khoản khác</button>
    </div>}
  </div></Shell>

  const shouldShowAuth=isSupabaseConfigured&&(!sessionChecked||!sessionReady)
  const rateLimited=isRateLimitError(authError)
  if(shouldShowAuth)return <Shell minimal><div className="auth-page"><TopBack title="Bắt đầu Together" onBack={backToOnboarding}/><div className="auth-brand"><BrandMark/></div><div className="auth-copy"><span className="eyebrow">Không gian riêng của hai người</span><h1>Hai người. Một chạm để bắt đầu.</h1><p>Tạo không gian ngay trên điện thoại này. Mỗi người dùng máy riêng, rồi gửi liên kết để ghép đôi.</p></div>{!sessionChecked?<div className="auth-card auth-loading"><span className="auth-spinner"/><p>Đang kiểm tra phiên kết nối…</p></div>:<div className="auth-card"><button className="primary-button" onClick={startWithoutEmail} disabled={anonymousBusy}>{anonymousBusy?'Đang tạo không gian…':'Bắt đầu không cần email'}</button><p className="form-hint">Để tránh mất dữ liệu, hãy cài Together lên màn hình chính trước khi bắt đầu và luôn sử dụng đúng biểu tượng vừa cài. Xoá dữ liệu trình duyệt có thể làm mất tài khoản chưa liên kết.</p><button className="text-button" onClick={()=>setEmailMode(v=>!v)} aria-expanded={emailMode} aria-controls="email-signin">{emailMode?'Ẩn đăng nhập email':'Đã có tài khoản? Dùng email'}</button>{emailMode&&<div id="email-signin"><label htmlFor="auth-email">Email của bạn</label><input id="auth-email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void sendMagicLink()}} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"/><button className="secondary-button" onClick={sendMagicLink} disabled={authSending||authCooldown>0}>{authSending?'Đang gửi…':authCooldown>0?`Gửi lại sau ${authCooldown}s`:authSent?'Gửi lại Magic Link':'Gửi Magic Link'}</button>{authSent&&!authError&&<p className="form-hint success-text">Kiểm tra hộp thư đến và thư rác; mở link mới nhất trên đúng thiết bị.</p>}</div>}{authError&&<div className="auth-error" role="alert"><CircleAlert size={17}/><div><strong>{rateLimited?'Tạm giới hạn gửi email':'Chưa thể bắt đầu'}</strong><span>{friendlyAuthError(authError)}</span></div></div>}</div>}<Signature compact/></div></Shell>

  const common={state,updateState,open,notify}
  const minimal=['login','profile','connect','daily','work','availability','plan','plan-detail','checkin'].includes(view)
  return <Shell minimal={minimal}>
    {view==='profile'&&<ProfileSetup key={authUserId??'demo'} {...common} onBack={backToLogin} onContinue={()=>navigate('connect')}/>}
    {view==='connect'&&<Connect key={authUserId??'demo'} {...common} onBack={()=>navigate('profile')} onDone={finishCoupleSetup}/>}
    {view==='today'&&<Today {...common} onPickSuggestion={(date,start,end)=>suggestPlan(date,start,end,'today')}/>}
    {view==='week'&&<Week {...common} onPickSuggestion={(date,start,end)=>suggestPlan(date,start,end,'week')}/>}
    {view==='plans'&&<Plans {...common} onSelect={plan=>{setSelectedPlan(plan);open('plan-detail','plans')}}/>} 
    {view==='us'&&<Us {...common}/>} 
    {view==='daily'&&<DailyStateForm {...common} onClose={()=>navigate(previousView)}/>}
    {view==='work'&&<WorkForm {...common} onClose={()=>navigate(previousView)}/>}
    {view==='availability'&&<AvailabilityForm {...common} onClose={()=>navigate(previousView)}/>}
    {view==='plan'&&<PlanForm {...common} initialPlan={editingPlan??undefined} suggestedSlot={suggestedPlan??undefined} onClose={()=>{if(sessionIsCurrent()){setEditingPlan(null);setView(previousView)}}}/>}
    {view==='plan-detail'&&selectedPlan&&<PlanDetail plan={selectedPlan} {...common} onClose={()=>navigate(previousView)} onEdit={()=>{if(!sessionIsCurrent())return;setEditingPlan(state.plans.find(plan=>plan.id===selectedPlan.id)??selectedPlan);setPreviousView('plan-detail');setView('plan')}}/>}
    {view==='checkin'&&<CheckinForm {...common} onClose={()=>navigate(previousView)}/>}
    {['today','week','plans','us'].includes(view)&&<BottomNav active={view} onChange={v=>setView(v)}/>} 
    {toast&&<div className={`toast ${toast.tone==='success'?'success':''}`}><Check size={16}/>{toast.message}</div>}
  </Shell>
}
