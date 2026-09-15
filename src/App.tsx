import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { View, Tone } from './appTypes'
import type { CoupleState, SharedPlan } from './types'
import { BottomNav, BrandMark, Shell } from './UI'
import { loadDemoState, saveDemoState } from './lib/demoStore'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { loadRemoteState, subscribeRemote } from './lib/remoteStore'
import { Onboarding, ProfileSetup, Connect } from './screens-setup'
import { Today, Week, Plans, Us } from './screens-home'
import { AvailabilityForm, CheckinForm, DailyStateForm, PlanDetail, PlanForm, WorkForm } from './screens-forms'

type ToastState={message:string;tone?:Tone}

export default function App(){
  const [state,setState]=useState<CoupleState>(()=>loadDemoState())
  const [view,setView]=useState<View>(()=>localStorage.getItem('together-onboarded')?'today':'onboarding')
  const [previousView,setPreviousView]=useState<View>('today')
  const [toast,setToast]=useState<ToastState|null>(null)
  const [selectedPlan,setSelectedPlan]=useState<SharedPlan|null>(null)
  const [authEmail,setAuthEmail]=useState('')
  const [authSent,setAuthSent]=useState(false)
  const [sessionReady,setSessionReady]=useState(!isSupabaseConfigured)
  const [sessionChecked,setSessionChecked]=useState(!isSupabaseConfigured)

  useEffect(()=>{if(!isSupabaseConfigured)saveDemoState(state)},[state])
  useEffect(()=>{if(!toast)return;const t=window.setTimeout(()=>setToast(null),2400);return()=>window.clearTimeout(t)},[toast])
  useEffect(()=>{
    if(!supabase)return
    let alive=true
    supabase.auth.getSession().then(({data})=>{if(alive){setSessionReady(Boolean(data.session));setSessionChecked(true)}})
    const{data:l}=supabase.auth.onAuthStateChange((_e,s)=>{setSessionReady(Boolean(s));setSessionChecked(true)})
    return()=>{alive=false;l.subscription.unsubscribe()}
  },[])
  useEffect(()=>{
    if(!supabase||!sessionReady)return
    let dead=false
    let unsubscribe=()=>{}
    ;(async()=>{
      try{
        const remote=await loadRemoteState()
        if(dead)return
        if(remote){
          setState(remote)
          if(localStorage.getItem('together-onboarded'))setView('today')
          unsubscribe=subscribeRemote(remote.id,async()=>{const fresh=await loadRemoteState();if(fresh&&!dead)setState(fresh)})
        }else if(localStorage.getItem('together-onboarded'))setView('profile')
      }catch(e){console.error(e)}
    })()
    return()=>{dead=true;unsubscribe()}
  },[sessionReady])

  const updateState=(fn:(draft:CoupleState)=>void)=>setState(old=>{const draft=structuredClone(old);fn(draft);return draft})
  const open=(next:View,from:View=view)=>{setPreviousView(from);window.scrollTo({top:0,behavior:'smooth'});setView(next)}
  const notify=(message:string,tone:Tone='success')=>setToast({message,tone})
  const finishOnboarding=()=>{localStorage.setItem('together-onboarded','1');setView('profile')}
  const sendMagicLink=async()=>{
    if(!supabase||!authEmail.trim())return
    const redirectTo=`${window.location.origin}${import.meta.env.BASE_URL}`
    const{error}=await supabase.auth.signInWithOtp({email:authEmail.trim(),options:{emailRedirectTo:redirectTo}})
    if(error)notify(error.message,'normal');else setAuthSent(true)
  }

  const shouldShowAuth=isSupabaseConfigured&&sessionChecked&&!sessionReady&&view!=='onboarding'
  if(isSupabaseConfigured&&!sessionChecked&&view!=='onboarding')return <Shell minimal><div className="auth-page"><BrandMark/><div className="auth-copy"><span className="eyebrow">Đang kết nối</span><h1>Đang mở không gian riêng.</h1><p>Together đang kiểm tra phiên đăng nhập trên thiết bị này.</p></div></div></Shell>
  if(shouldShowAuth)return <Shell minimal><div className="auth-page"><BrandMark/><div className="auth-copy"><span className="eyebrow">Không gian riêng của hai người</span><h1>Đăng nhập để giữ nhịp chung.</h1><p>Together dùng Magic Link. Không mật khẩu, không social feed, không public profile.</p></div><div className="auth-card"><label>Email của bạn</label><input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"/><button className="primary-button" onClick={sendMagicLink}>{authSent?'Gửi lại Magic Link':'Gửi Magic Link'}</button>{authSent&&<p className="form-hint success-text">Đã gửi. Mở link trong email để tiếp tục; Together sẽ tự nhận phiên đăng nhập khi quay lại.</p>}</div></div></Shell>

  const common={state,updateState,open,notify}
  const minimal=['onboarding','profile','connect','daily','work','availability','plan','plan-detail','checkin'].includes(view)
  return <Shell minimal={minimal}>
    {view==='onboarding'&&<Onboarding onStart={finishOnboarding}/>} 
    {view==='profile'&&<ProfileSetup {...common} onContinue={()=>setView('connect')}/>} 
    {view==='connect'&&<Connect {...common} onDone={()=>setView('today')}/>} 
    {view==='today'&&<Today {...common}/>} 
    {view==='week'&&<Week {...common}/>} 
    {view==='plans'&&<Plans {...common} onSelect={plan=>{setSelectedPlan(plan);open('plan-detail','plans')}}/>} 
    {view==='us'&&<Us {...common}/>} 
    {view==='daily'&&<DailyStateForm {...common} onClose={()=>setView(previousView)}/>} 
    {view==='work'&&<WorkForm {...common} onClose={()=>setView(previousView)}/>} 
    {view==='availability'&&<AvailabilityForm {...common} onClose={()=>setView(previousView)}/>} 
    {view==='plan'&&<PlanForm {...common} onClose={()=>setView(previousView)}/>} 
    {view==='plan-detail'&&selectedPlan&&<PlanDetail plan={selectedPlan} {...common} onClose={()=>setView(previousView)}/>} 
    {view==='checkin'&&<CheckinForm {...common} onClose={()=>setView(previousView)}/>} 
    {['today','week','plans','us'].includes(view)&&<BottomNav active={view} onChange={v=>setView(v)}/>} 
    {toast&&<div className={`toast ${toast.tone==='success'?'success':''}`}><Check size={16}/>{toast.message}</div>}
  </Shell>
}
