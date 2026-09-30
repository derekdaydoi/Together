import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronRight, Copy, Heart, Link2, Plus, Share2, Smartphone, UsersRound, Zap } from 'lucide-react'
import type { CommonProps } from './appTypes'
import { Avatar, BrandMark, Field, Page, Signature, TopBack } from './UI'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { ZODIAC_OPTIONS } from './zodiac'
import type { ZodiacKey } from './types'
import { createRemoteCouple, joinRemoteCouple, saveRemoteProfile } from './lib/remoteStore'

export function Onboarding({ onStart,busy=false }: { onStart: () => void; busy?:boolean }) {
  return <div className="onboarding-screen">
    <div className="onboarding-art" aria-hidden><div className="big-heart heart-a"/><div className="big-heart heart-b"/><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="tiny-note note-one">better together</div><div className="tiny-note note-two">every day ♡</div></div>
    <div className="onboarding-copy"><BrandMark/><h1>Hai cuộc sống khác nhau.<br/>Một nhịp chung.</h1><p>Together không ép hai người dính lấy nhau. Nó giúp cả hai nhìn thấy lịch làm việc, năng lượng và nhu cầu gần gũi — rồi tìm ra khoảng thời gian thật sự phù hợp.</p></div>
    <div className="feature-grid"><Feature icon={CalendarDays} title="Quản lý workdate" text="Biết lúc nào thật sự rảnh" tone="mint"/><Feature icon={Zap} title="Theo dõi năng lượng" text="Đỡ lên plan sai thời điểm" tone="peach"/><Feature icon={Heart} title="Hiểu nhu cầu gần gũi" text="Không ai phải đoán ý ai" tone="rose"/><Feature icon={UsersRound} title="Lên kế hoạch chung" text="Soft plan hoặc hard plan" tone="lilac"/></div>
    {isSupabaseConfigured&&<div className="privacy-note"><Smartphone size={19} aria-hidden="true"/><span><strong>Cài Together lên màn hình chính trước nhé.</strong> Trên iPhone: Chia sẻ → Thêm vào MH chính. Trên Android: menu trình duyệt → Cài đặt ứng dụng. Hãy mở bằng biểu tượng đó rồi bắt đầu để giữ tài khoản trên máy.</span></div>}
    <button className="primary-button onboarding-button" onClick={onStart} disabled={busy}>{busy?'Đang chuẩn bị…':'Bắt đầu'} <ArrowRight size={18}/></button><p className="small-note center">Bận rộn hơn, nhưng vẫn gần nhau hơn mỗi ngày.</p><Signature compact/>
  </div>
}
function Feature({ icon: Icon, title, text, tone }: { icon: typeof Heart; title: string; text: string; tone: string }) { return <div className={`feature-card ${tone}`}><span className="feature-icon"><Icon size={20}/></span><strong>{title}</strong><small>{text}</small></div> }

export function ProfileSetup({ state, updateState, onContinue, onBack, notify }: CommonProps & { onContinue: () => void; onBack:()=>void }) {
  const [name,setName]=useState(state.me.displayName==='Bạn'?'':state.me.displayName)
  const [zodiac,setZodiac]=useState<ZodiacKey|''>(state.me.zodiacKey??'')
  const [busy,setBusy]=useState(false)
  const preview={...state.me,displayName:name.trim()||'Bạn',avatarUrl:zodiac?undefined:state.me.avatarUrl,zodiacKey:zodiac||undefined}

  const next=async()=>{
    const nextName=name.trim()
    if(!nextName)return notify('Đặt một cái tên để người ấy nhận ra bạn.','normal')
    if(!zodiac)return notify('Chọn một con giáp làm avatar của bạn.','normal')
    setBusy(true)
    try{
      if(supabase)await saveRemoteProfile(nextName,null,state.me.id,zodiac)
      updateState(d=>{d.me.displayName=nextName;d.me.zodiacKey=zodiac;d.me.avatarUrl=undefined;d.me.avatarPath=undefined})
      onContinue()
    }catch(error){
      notify(error instanceof Error?error.message:'Không thể lưu hồ sơ.','normal')
    }finally{setBusy(false)}
  }

  return <Page className="setup-page zodiac-setup-page">
    <TopBack title="Tạo hồ sơ của bạn" onBack={onBack}/>
    <div className="profile-hero zodiac-profile-hero">
      <span className="eyebrow">Nhân vật của bạn</span>
      <div className="zodiac-preview"><Avatar profile={preview} size="xl"/></div>
      <h2>Chọn một con giáp.</h2>
      <p>Không ảnh mặc định, không chữ cái đại diện. Mỗi người có một linh vật riêng để nhận ra nhau ngay.</p>
    </div>
    <div className="form-stack">
      <Field label="Tên người ấy gọi bạn"><input value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Derek"/></Field>
      <div className="zodiac-field">
        <span className="field-label">Avatar · 12 con giáp Việt Nam</span>
        <div className="zodiac-grid" role="radiogroup" aria-label="Chọn avatar con giáp">
          {ZODIAC_OPTIONS.map(option=><button key={option.key} type="button" role="radio" aria-checked={zodiac===option.key}
            className={`zodiac-option zodiac-tone-${option.tone} ${zodiac===option.key?'active':''}`}
            onClick={()=>setZodiac(option.key)}>
            <span className="zodiac-option-glyph" aria-hidden="true">{option.glyph}</span>
            <span><strong>{option.label}</strong><small>{option.animal}</small></span>
          </button>)}
        </div>
      </div>
      <div className="privacy-note"><Heart size={16}/> Together tạo một tài khoản riêng ngay trên thiết bị. Không cần Gmail, mật khẩu hay hồ sơ công khai.</div>
    </div>
    <button className="primary-button sticky-action" onClick={next} disabled={busy||!name.trim()||!zodiac}>{busy?'Đang lưu…':'Tiếp tục'} <ArrowRight size={17}/></button>
    <Signature compact/>
  </Page>
}

function PairingPreview({state}:{state:CommonProps['state']}) {
  return <div className="pairing-preview" aria-label="Ghép đôi hai tài khoản">
    <div className="pairing-person"><Avatar profile={state.me} size="lg"/><span>Bạn</span></div>
    <span className="pairing-heart" aria-hidden="true"><Heart size={18}/></span>
    <div className="pairing-person pending"><span className="pairing-empty-avatar"><UsersRound size={25}/></span><span>Người ấy</span></div>
  </div>
}

export function Connect({ state, updateState, onDone, onBack, notify }: CommonProps & { onDone: () => void; onBack:()=>void }) {
  const initialInvite=()=>new URLSearchParams(window.location.search).get('invite')?.trim().toUpperCase()??''
  const [mode,setMode]=useState<'choose'|'invite'|'join'>(()=>initialInvite()?'join':'choose'); const [code,setCode]=useState(initialInvite); const [busy,setBusy]=useState(false); const [deepLinkMode,setDeepLinkMode]=useState(()=>Boolean(initialInvite())); const [joinError,setJoinError]=useState<string|null>(null); const autoJoinRef=useRef(false)
  const createBusyRef=useRef(false); const joinBusyRef=useRef(false); const mountedRef=useRef(true)
  useEffect(()=>()=>{mountedRef.current=false},[])
  const validInvite=(value:string)=>/^[A-F0-9]{10,32}$/.test(value.trim().toUpperCase())
  const create=async()=>{if(createBusyRef.current)return;createBusyRef.current=true;setBusy(true);try{if(supabase){const created=await createRemoteCouple(state.me.id);if(!mountedRef.current)return;updateState(d=>{d.id=created.id;d.inviteCode=created.code;d.inviteExpiresAt=created.expiresAt})}else updateState(d=>{d.inviteCode=`TOG${Math.random().toString(36).slice(2,8).toUpperCase()}`});if(!mountedRef.current)return;setMode('invite');notify('Đã tạo lời mời ghép đôi. Gửi link này cho người ấy.') }catch(e){if(mountedRef.current)notify(e instanceof Error?e.message:'Không thể tạo couple.','normal')}finally{createBusyRef.current=false;if(mountedRef.current)setBusy(false)}}
  const join=async(inviteCode=code)=>{const normalized=inviteCode.trim().toUpperCase();if(!validInvite(normalized)){setJoinError('Mã mời chưa hợp lệ.');return notify('Nhập mã mời hợp lệ.','normal')}if(joinBusyRef.current)return;joinBusyRef.current=true;setBusy(true);setJoinError(null);try{if(supabase)await joinRemoteCouple(normalized,state.me.id);if(!mountedRef.current)return;const url=new URL(window.location.href);url.searchParams.delete('invite');window.history.replaceState(null,'',url);notify('Match rồi — hai bạn đã kết nối.');onDone()}catch(e){if(!mountedRef.current)return;const message=e instanceof Error?e.message:'Không thể kết nối lời mời.';setJoinError(message);notify(message,'normal')}finally{joinBusyRef.current=false;if(mountedRef.current)setBusy(false)}}
  useEffect(()=>{if(!supabase||!deepLinkMode||autoJoinRef.current||code.trim().length<10)return;autoJoinRef.current=true;void join(code)},[])
  const inviteUrl=()=>`${window.location.origin}${import.meta.env.BASE_URL}?invite=${encodeURIComponent(state.inviteCode)}`
  const copy=async()=>{try{await navigator.clipboard.writeText(inviteUrl());notify('Đã sao chép link mời.')}catch{notify('Không sao chép được. Bạn có thể gửi mã bên trên.','normal')}}
  const share=async()=>{if(navigator.share){try{await navigator.share({title:'Together',text:'Cùng mình giữ nhịp mỗi ngày nhé',url:inviteUrl()})}catch{/* The share sheet can be dismissed intentionally. */}}else await copy()}
  const back=()=>{if(mode==='choose')onBack();else{setDeepLinkMode(false);setJoinError(null);setMode('choose')}}
  return <Page className="connect-page"><TopBack title="Kết nối cùng nhau" onBack={back}/><div className="center-heading"><span className="eyebrow">Ghép đôi riêng tư</span><h2>Hai tài khoản. Một không gian chung.</h2><p>Mỗi máy có một danh tính riêng. Ghép đúng người rồi Together mới mở dữ liệu chung.</p></div><PairingPreview state={state}/>{mode==='choose'?<div className="choice-stack"><button className="choice-card rose" onClick={create} disabled={busy}><span className="round-icon"><Plus/></span><div><strong>{busy?'Đang tạo…':'Tạo lời mời ghép đôi'}</strong><small>Tạo link riêng, dùng một lần cho đúng người</small></div><ChevronRight/></button><button className="choice-card mint" onClick={()=>{setDeepLinkMode(false);setJoinError(null);setMode('join')}}><span className="round-icon"><Link2/></span><div><strong>Ghép đôi bằng link hoặc mã</strong><small>Mở link hoặc nhập mã người ấy gửi</small></div><ChevronRight/></button></div>:mode==='invite'?<div className="invite-card"><Heart size={28}/><span className="eyebrow">Lời mời ghép đôi</span><strong className="invite-code">{state.inviteCode}</strong><p>Link có hiệu lực 7 ngày và chỉ dùng một lần. Người ấy mở link trên điện thoại riêng, chọn tên + con giáp, rồi Together tự ghép hai tài khoản.</p><button className="primary-button" onClick={share}><Share2 size={16}/> Chia sẻ link mời</button><button className="secondary-button" onClick={copy}><Copy size={16}/> Sao chép link</button><button className="text-button" onClick={onDone}>Vào Together</button></div>:deepLinkMode?<div className="invite-card" aria-live="polite"><Link2 size={28}/><span className="eyebrow">Lời mời của hai bạn</span><strong>{busy?'Đang kết nối…':joinError?'Chưa kết nối được':'Đang chuẩn bị kết nối…'}</strong><p>{joinError??'Together đang xác nhận lời mời trên thiết bị này. Bạn không cần nhập lại mã.'}</p>{joinError&&<button className="primary-button" onClick={()=>void join(code)} disabled={busy}>{busy?'Đang thử lại…':'Thử kết nối lại'}</button>}<button className="text-button" onClick={()=>{setDeepLinkMode(false);setJoinError(null);setCode('');setMode('join')}}>Nhập mã khác</button></div>:<div className="invite-card"><Link2 size={28}/><span className="eyebrow">Mã người yêu gửi cho bạn</span><label htmlFor="join-code" className="form-hint">Kết nối bằng mã mời</label><input id="join-code" value={code} maxLength={32} onChange={e=>{setJoinError(null);setCode(e.target.value.toUpperCase())}} placeholder="Nhập hoặc dán mã mời" autoCapitalize="characters" autoComplete="off"/><button className="primary-button" onClick={()=>void join()} disabled={busy||code.trim().length<10}>{busy?'Đang kết nối…':'Kết nối'}</button>{joinError&&<p className="form-hint" role="alert">{joinError}</p>}<button className="text-button" onClick={()=>setMode('choose')}>Quay lại</button>{!isSupabaseConfigured&&<button className="text-button" onClick={onDone}>Tiếp tục bản demo</button>}</div>}<div className="line-art">two different lives · one beautiful rhythm ♡</div><Signature compact/></Page>
}
