import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import type { View, Tone } from './appTypes'
import type { CoupleState, SharedPlan } from './types'
import { BottomNav, BrandMark, Shell, Signature } from './UI'
import { loadDemoState, saveDemoState } from './lib/demoStore'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { loadRemoteProfileState, loadRemoteState, signInWithGoogle, subscribeRemote } from './lib/remoteStore'
import { describeAuthError } from './lib/account'
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

export default function App(){
  const [state,setState]=useState<CoupleState>(()=>isSupabaseConfigured?emptyRemoteState():loadDemoState())
  const [view,setView]=useState<View>(initialView)
  const [previousView,setPreviousView]=useState<View>('today')
  const [toast,setToast]=useState<ToastState|null>(null)
  const [selectedPlan,setSelectedPlan]=useState<SharedPlan|null>(null)
  const [editingPlan,setEditingPlan]=useState<SharedPlan|null>(null)
  const [suggestedPlan,setSuggestedPlan]=useState<{date:string;start:string;end:string}|null>(null)
  const [anonymousBusy,setAnonymousBusy]=useState(false)
  const anonymousBusyRef=useRef(false)
  const [authError,setAuthError]=useState<string|null>(null)
  const [authUserId,setAuthUserId]=useState<string|null>(null)
  const [googleBusy,setGoogleBusy]=useState(false)
  const googleBusyRef=useRef(false)
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
  useEffect(()=>{
    if(!supabase)return
    let alive=true
    let authEventObserved=false
    const applySession=(userId:string|null)=>{
      if(!alive)return
      if(authUserRef.current!==userId){
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
      setSessionChecked(true)
    }
    supabase.auth.getSession().then(({data,error})=>{
      if(!alive||authEventObserved)return
      if(error)setAuthError(error.message)
      if(data.session?.user?.is_anonymous===false)localStorage.removeItem('together-google-recovery')
      applySession(data.session?.user.id??null)
    }).catch(error=>{
      if(!alive||authEventObserved)return
      setAuthError(error instanceof Error?error.message:'Không thể kiểm tra phiên đăng nhập.')
      applySession(null)
    })
    const{data:l}=supabase.auth.onAuthStateChange((event,session)=>{
      authEventObserved=true
      if(session?.user?.is_anonymous===false)localStorage.removeItem('together-google-recovery')
      applySession(session?.user.id??null)
      if(session){localStorage.setItem('together-onboarded','1');setAuthError(null)}
      if(event==='SIGNED_OUT')setView('login')
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
              if(initialLoad)setView(fresh.me.zodiacKey?'today':'profile')
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
    localStorage.removeItem('together-google-recovery')
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
      setAuthError(anonymousDisabled
        ?'Together chưa mở được tài khoản riêng trên thiết bị này. Anonymous access của backend hiện chưa được bật; bật cấu hình này rồi chọn Thử lại.'
        :error instanceof Error?error.message:'Không thể khởi tạo phiên riêng trên thiết bị này.')
      setView('login')
    }finally{anonymousBusyRef.current=false;setAnonymousBusy(false)}
  }
  const startWithGoogle=async()=>{
    if(!supabase||!sessionChecked||authUserRef.current||anonymousBusyRef.current||googleBusyRef.current)return
    googleBusyRef.current=true
    localStorage.setItem('together-google-recovery','1')
    setGoogleBusy(true);setAuthError(null)
    try{await signInWithGoogle()}
    catch(error){
      localStorage.removeItem('together-google-recovery')
      setAuthError(describeAuthError(error))
      googleBusyRef.current=false;setGoogleBusy(false)
    }
  }
  useEffect(()=>{
    const reset=(event:PageTransitionEvent)=>{if(event.persisted){googleBusyRef.current=false;setGoogleBusy(false)}}
    window.addEventListener('pageshow',reset)
    return()=>window.removeEventListener('pageshow',reset)
  },[])
  const finishOnboarding=()=>{
    localStorage.setItem('together-onboarded','1')
    if(supabase){if(authUserRef.current)setView('profile');else void startWithoutEmail()}
    else setView('profile')
  }
  // First-time members had no couple during the initial session load, so they
  // must start their couple-scoped realtime subscription after creating/joining.
  const finishCoupleSetup=()=>{if(!sessionIsCurrent())return;if(supabase)setRemoteRetry(value=>value+1);setView('today')}
  const backToOnboarding=()=>{localStorage.removeItem('together-onboarded');setAuthError(null);setView('onboarding')}

  useEffect(()=>{
    if(!supabase||!sessionChecked||authUserId||view==='onboarding'||view==='login'||localStorage.getItem('together-google-recovery')||authError)return
    void startWithoutEmail()
  },[sessionChecked,authUserId,view,authError])

  if(view==='onboarding')return <Shell minimal><Onboarding onStart={finishOnboarding} busy={anonymousBusy||googleBusy||(isSupabaseConfigured&&!sessionChecked)} onGoogle={isSupabaseConfigured&&sessionChecked&&!authUserId?startWithGoogle:undefined} googleBusy={googleBusy}/>{authError&&<div className="auth-error" role="alert">{authError}</div>}</Shell>

  if(isSupabaseConfigured&&sessionReady&&remoteStatus!=='ready')return <Shell minimal><div className="auth-page">
    <div className="auth-brand"><BrandMark/></div>
    <div className="auth-copy"><span className="eyebrow">Đồng bộ không gian chung</span>
      <h1>{remoteStatus==='loading'?'Đang kết nối hai người…':'Chưa tải được dữ liệu của hai bạn.'}</h1>
      <p>{remoteStatus==='loading'?'Together đang tải lịch, trạng thái và kế hoạch đã lưu.':'Dữ liệu đã lưu vẫn ở Supabase. Hãy thử kết nối lại.'}</p>
    </div>
    {remoteStatus==='loading'?<div className="auth-card auth-loading"><span className="auth-spinner"/><p>Đang đồng bộ…</p></div>:<div className="auth-card">
      <div className="auth-error"><CircleAlert size={17}/><span>{remoteError??'Kết nối thất bại.'}</span></div>
      <button className="primary-button" onClick={()=>setRemoteRetry(value=>value+1)}>Thử kết nối lại</button>
    </div>}
  </div></Shell>

  const shouldShowAuth=isSupabaseConfigured&&(!sessionChecked||!sessionReady)
  if(shouldShowAuth)return <Shell minimal><div className="auth-page">
    <div className="auth-brand"><BrandMark/></div>
    <div className="auth-copy"><span className="eyebrow">Không gian riêng của hai người</span><h1>Chào mừng trở lại Together.</h1>
      <p>Nếu đã liên kết Google, khôi phục tài khoản cũ để giữ nguyên dữ liệu. Nếu chưa, bắt đầu bằng danh tính riêng không cần email.</p></div>
    {!sessionChecked ? <div className="auth-card auth-loading"><span className="auth-spinner"/>Đang kiểm tra phiên…</div>
    : <div className="auth-card">
      <button type="button" className="primary-button" disabled={googleBusy||anonymousBusy} onClick={()=>void startWithGoogle()}>{googleBusy?'Đang chuyển đến Google…':'Đăng nhập bằng Google'}</button>
      <button type="button" className="secondary-button" disabled={googleBusy||anonymousBusy} onClick={()=>void startWithoutEmail()}>{anonymousBusy?'Đang tạo tài khoản…':'Bắt đầu mới không cần Google'}</button>
      {authError&&<p className="auth-error" role="alert">{authError}</p>}
      <p className="form-hint">Nếu đã sử dụng Together trước đây, hãy thử khôi phục trước khi tạo tài khoản mới.</p>
    </div>}
    <Signature compact/>
  </div></Shell>

  const common={state,updateState,open,notify}
  const minimal=['login','profile','connect','daily','work','availability','plan','plan-detail','checkin'].includes(view)
  return <Shell minimal={minimal}>
    {view==='profile'&&<ProfileSetup key={authUserId??'demo'} {...common} onBack={backToOnboarding} onContinue={()=>navigate(state.id?'today':'connect')}/>}
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
