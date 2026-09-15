import { useEffect, useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import type { View, Tone } from './appTypes'
import type { CoupleState, SharedPlan } from './types'
import { BottomNav, BrandMark, Shell, Signature, TopBack } from './UI'
import { loadDemoState, saveDemoState } from './lib/demoStore'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { loadRemoteState, subscribeRemote } from './lib/remoteStore'
import { Onboarding, ProfileSetup, Connect } from './screens-setup'
import { Today, Week, Plans, Us } from './screens-home'
import { AvailabilityForm, CheckinForm, DailyStateForm, PlanDetail, PlanForm, WorkForm } from './screens-forms'

type ToastState={message:string;tone?:Tone}

const initialView=():View=>{
  if(!localStorage.getItem('together-onboarded'))return 'onboarding'
  return isSupabaseConfigured?'login':'today'
}

const cleanAuthError=(value:string)=>decodeURIComponent(value.replace(/\+/g,' '))

export default function App(){
  const [state,setState]=useState<CoupleState>(()=>loadDemoState())
  const [view,setView]=useState<View>(initialView)
  const [previousView,setPreviousView]=useState<View>('today')
  const [toast,setToast]=useState<ToastState|null>(null)
  const [selectedPlan,setSelectedPlan]=useState<SharedPlan|null>(null)
  const [authEmail,setAuthEmail]=useState(()=>sessionStorage.getItem('together-auth-email')??'')
  const [authSent,setAuthSent]=useState(false)
  const [authError,setAuthError]=useState<string|null>(null)
  const [sessionReady,setSessionReady]=useState(!isSupabaseConfigured)
  const [sessionChecked,setSessionChecked]=useState(!isSupabaseConfigured)

  useEffect(()=>{if(!isSupabaseConfigured)saveDemoState(state)},[state])
  useEffect(()=>{if(!toast)return;const t=window.setTimeout(()=>setToast(null),2400);return()=>window.clearTimeout(t)},[toast])
  useEffect(()=>{
    const query=new URLSearchParams(window.location.search)
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,''))
    const message=query.get('error_description')??hash.get('error_description')
    if(message){setAuthError(cleanAuthError(message));localStorage.setItem('together-onboarded','1');setView('login')}
  },[])
  useEffect(()=>{
    if(!supabase)return
    let alive=true
    supabase.auth.getSession().then(({data,error})=>{
      if(!alive)return
      if(error)setAuthError(error.message)
      setSessionReady(Boolean(data.session))
      setSessionChecked(true)
    })
    const{data:l}=supabase.auth.onAuthStateChange((_event,session)=>{
      setSessionReady(Boolean(session))
      setSessionChecked(true)
      if(session){localStorage.setItem('together-onboarded','1');setAuthError(null)}
    })
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
        localStorage.setItem('together-onboarded','1')
        if(remote){
          setState(remote)
          setView('today')
          unsubscribe=subscribeRemote(remote.id,async()=>{const fresh=await loadRemoteState();if(fresh&&!dead)setState(fresh)})
        }else setView('profile')
      }catch(e){if(!dead)setAuthError(e instanceof Error?e.message:'Không thể tải không gian Together.')}
    })()
    return()=>{dead=true;unsubscribe()}
  },[sessionReady])

  const updateState=(fn:(draft:CoupleState)=>void)=>setState(old=>{const draft=structuredClone(old);fn(draft);return draft})
  const open=(next:View,from:View=view)=>{setPreviousView(from);window.scrollTo({top:0,behavior:'smooth'});setView(next)}
  const notify=(message:string,tone:Tone='success')=>setToast({message,tone})
  const finishOnboarding=()=>{localStorage.setItem('together-onboarded','1');setView(isSupabaseConfigured?'login':'profile')}
  const backToOnboarding=()=>{localStorage.removeItem('together-onboarded');setAuthSent(false);setAuthError(null);setView('onboarding')}
  const backToLogin=async()=>{setAuthSent(false);setAuthError(null);if(supabase)await supabase.auth.signOut();setSessionReady(false);setSessionChecked(true);setView('login')}
  const sendMagicLink=async()=>{
    if(!supabase||!authEmail.trim())return
    setAuthError(null)
    const email=authEmail.trim().toLowerCase()
    const redirectTo=new URL(import.meta.env.BASE_URL,window.location.origin).toString()
    sessionStorage.setItem('together-auth-email',email)
    const{error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}})
    if(error){setAuthError(error.message);notify(error.message,'normal')}else setAuthSent(true)
  }

  if(view==='onboarding')return <Shell minimal><Onboarding onStart={finishOnboarding}/></Shell>

  const shouldShowAuth=isSupabaseConfigured&&(!sessionChecked||!sessionReady)
  if(shouldShowAuth)return <Shell minimal><div className="auth-page"><TopBack title="Đăng nhập" onBack={backToOnboarding}/><div className="auth-brand"><BrandMark/></div><div className="auth-copy"><span className="eyebrow">Không gian riêng của hai người</span><h1>Đăng nhập để giữ nhịp chung.</h1><p>Together dùng Magic Link. Không mật khẩu, không social feed, không public profile.</p></div>{!sessionChecked?<div className="auth-card auth-loading"><span className="auth-spinner"/><p>Đang kiểm tra phiên đăng nhập…</p></div>:<div className="auth-card"><label>Email của bạn</label><input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')sendMagicLink()}} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"/><button className="primary-button" onClick={sendMagicLink}>{authSent?'Gửi lại Magic Link':'Gửi Magic Link'}</button>{authSent&&<p className="form-hint success-text">Đã gửi. Mở email mới nhất và bấm link một lần. Link sẽ quay về đúng Together trên GitHub Pages.</p>}{authError&&<div className="auth-error"><CircleAlert size={17}/><div><strong>Link đăng nhập chưa hoàn tất</strong><span>{authError}</span><small>Nếu link đã cũ hoặc đã bấm trước đó, hãy gửi một Magic Link mới.</small></div></div>}<p className="auth-route-hint">Callback: {new URL(import.meta.env.BASE_URL,window.location.origin).toString()}</p></div>}<Signature compact/></div></Shell>

  const common={state,updateState,open,notify}
  const minimal=['login','profile','connect','daily','work','availability','plan','plan-detail','checkin'].includes(view)
  return <Shell minimal={minimal}>
    {view==='profile'&&<ProfileSetup {...common} onBack={backToLogin} onContinue={()=>setView('connect')}/>} 
    {view==='connect'&&<Connect {...common} onBack={()=>setView('profile')} onDone={()=>setView('today')}/>} 
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
