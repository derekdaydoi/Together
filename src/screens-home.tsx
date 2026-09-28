import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Coffee, Copy, Share2, Heart, MapPin, Plus, RefreshCcw, Settings, Sparkles, Sun, Zap, Camera, Laptop, Home, Clock } from 'lucide-react'
import type { CommonProps } from './appTypes'
import type { CoupleState, DailyState, SharedPlan, WorkSchedule, WorkType } from './types'
import { AppHeader, Avatar, Page } from './UI'
import { overlapSuggestion, workOccursOn, workOnDate } from './lib/insights'
import { addDaysISO, localISODate, weekStartISO } from './lib/dates'
import { blobToDataUrl, compressAvatar } from './lib/image'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { rotateRemoteInvite, saveRemoteProfile } from './lib/remoteStore'
import { resetDemoState } from './lib/demoStore'

const todayDate=localISODate
const formatDate=(iso:string,options?:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('vi-VN',options??{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${iso}T12:00:00`))
const getWeekStart=weekStartISO
const daysFrom=(startIso:string,count=7)=>Array.from({length:count},(_,i)=>addDaysISO(startIso,i))
const workTypeMeta:Record<WorkType,{label:string;icon:typeof Home}>={office:{label:'Văn phòng',icon:BriefcaseBusiness},remote:{label:'Remote',icon:Laptop},shift:{label:'Ca làm',icon:Clock3},off:{label:'Nghỉ',icon:Coffee},other:{label:'Khác',icon:CalendarDays}}

export function Today({state,open,onPickSuggestion}:CommonProps&{onPickSuggestion?:(date:string,start:string,end:string)=>void}){const date=todayDate(),myDaily=state.dailyStates.find(x=>x.userId===state.me.id&&x.date===date),partnerDaily=state.dailyStates.find(x=>x.userId===state.partner.id&&x.date===date),myWork=workOnDate(state,state.me.id,date)[0],partnerWork=workOnDate(state,state.partner.id,date)[0],insight=overlapSuggestion(state,date)
return <Page className="dashboard-page with-nav"><AppHeader state={state} subtitle={formatDate(date,{weekday:'long',day:'numeric',month:'long'})}/><section className="welcome-row"><div><span className="eyebrow">Hôm nay của cả hai</span><h1>Chào buổi sáng.</h1></div><Sun className="sun-doodle"/></section><div className="couple-cards"><PersonToday profile={state.me} daily={myDaily} work={myWork} me/><PersonToday profile={state.partner} daily={partnerDaily} work={partnerWork}/></div><button className="insight-card" onClick={()=>insight&&onPickSuggestion?onPickSuggestion(date,insight.start,insight.end):open('plan','today')}><span className="insight-icon"><Sparkles size={20}/></span><div><strong>{insight?'Gợi ý cho hôm nay':'Hôm nay chưa có overlap rõ ràng'}</strong>{insight?<><b>{insight.start} – {insight.end}</b><p>{insight.message}</p></>:<p>Cập nhật lịch rảnh hoặc trạng thái để Together hiểu ngày hôm nay hơn.</p>}</div><ChevronRight size={20}/></button><section className="section-block"><div className="section-title"><div><span className="eyebrow">Điều chỉnh nhanh</span><h3>Để hôm nay dễ hiểu hơn.</h3></div></div><div className="quick-grid"><Quick icon={Zap} label="Năng lượng & closeness" tone="peach" onClick={()=>open('daily','today')}/><Quick icon={BriefcaseBusiness} label="Thêm workdate" tone="mint" onClick={()=>open('work','today')}/><Quick icon={CalendarDays} label="Thêm lịch rảnh" tone="rose" onClick={()=>open('availability','today')}/><Quick icon={Heart} label="Tạo kế hoạch" tone="lilac" onClick={()=>open('plan','today')}/></div></section><section className="section-block weekly-nudge"><div><span className="eyebrow">Cuối tuần</span><h3>Hai người thấy tuần này thế nào?</h3><p>Chỉ 10 giây. Mỗi người trả lời riêng rồi mới nhìn thấy nhau.</p></div><button className="secondary-button" onClick={()=>open('checkin','today')}>Check-in tuần <ArrowRight size={16}/></button></section></Page>}
function PersonToday({profile,daily,work,me=false}:{profile:CoupleState['me'];daily?:DailyState;work?:WorkSchedule;me?:boolean}){const WorkIcon=work?workTypeMeta[work.type].icon:Coffee;return <article className={`person-card ${me?'person-me':'person-partner'}`}><div className="person-top"><Avatar profile={profile} size="md"/><span className="presence-dot"/></div><h3>{profile.displayName}</h3><Metric icon={Zap} label="Năng lượng" value={daily?.energy} color="energy"/><Metric icon={Heart} label="Muốn gần nhau" value={daily?.closeness} color="heart"/><div className="work-summary"><WorkIcon size={15}/><div><small>{work?workTypeMeta[work.type].label:'Chưa có workdate'}</small>{work&&<span>{work.start} – {work.end}</span>}</div></div></article>}
function Metric({icon:Icon,label,value,color}:{icon:typeof Heart;label:string;value?:number;color:string}){
  return <div className="metric">
    <div className="metric-label"><Icon size={14}/><span>{label}</span></div>
    {value===undefined?<small className="metric-unknown">Chưa cập nhật</small>:<div className={`metric-dots ${color}`}>{[1,2,3,4,5].map(i=><span key={i} className={i<=value?'on':''}/>)}</div>}
  </div>
}
function Quick({icon:Icon,label,tone,onClick}:{icon:typeof Heart;label:string;tone:string;onClick:()=>void}){return <button className={`quick-action ${tone}`} onClick={onClick}><Icon size={20}/><span>{label}</span><ChevronRight size={17}/></button>}

export function Week({state,open,onPickSuggestion}:CommonProps&{onPickSuggestion?:(date:string,start:string,end:string)=>void}){
  const [weekOffset,setWeekOffset]=useState(0)
  const weekStart=addDaysISO(getWeekStart(),weekOffset*7)
  const days=daysFrom(weekStart)
  const today=todayDate()
  const suggestions=days.map(date=>({date,insight:overlapSuggestion(state,date)})).filter(x=>x.insight)
  return <Page className="week-page with-nav">
    <AppHeader state={state}/>
    <div className="page-heading-row">
      <div>
        <span className="eyebrow">Lịch chung + gợi ý</span>
        <h1>Tuần của chúng ta.</h1>
        <p>{formatDate(weekStart,{day:'numeric',month:'short'})} – {formatDate(days[6],{day:'numeric',month:'short',year:'numeric'})}</p>
      </div>
      <button className="icon-button" aria-label="Thêm lịch rảnh" onClick={()=>open('availability','week')}><Plus size={22}/></button>
    </div>
    <div className="week-navigator">
      <button type="button" aria-label="Tuần trước" onClick={()=>setWeekOffset(v=>v-1)}><ChevronLeft size={17}/></button>
      <button type="button" className="week-current" onClick={()=>setWeekOffset(0)} disabled={weekOffset===0}>Tuần này</button>
      <button type="button" aria-label="Tuần sau" onClick={()=>setWeekOffset(v=>v+1)}><ChevronRight size={17}/></button>
    </div>
    <div className="week-strip">{days.map(d=><div key={d} className={'day-pill '+(d===today?'active':'')}>
      <small>{new Intl.DateTimeFormat('vi-VN',{weekday:'short'}).format(new Date(d+'T12:00'))}</small>
      <strong>{new Date(d+'T12:00').getDate()}</strong>
    </div>)}</div>
    <div className="calendar-legend">
      <span><i className="legend-dot me"/>Bạn</span>
      <span><i className="legend-dot partner"/>Người ấy</span>
      <span><i className="legend-dot together"/>Cùng rảnh</span>
      <span><i className="legend-dot work"/>Đi làm</span>
    </div>
    <WeekGrid state={state} days={days}/>
    <section className="recommendation-panel">
      <div className="recommendation-title"><Sparkles size={19}/><div>
        <span className="eyebrow">Khung giờ phù hợp tuần này</span>
        <strong>{suggestions.length?('Có '+suggestions.length+' khoảng thời gian đáng giữ lại'):'Chưa đủ dữ liệu để gợi ý'}</strong>
      </div></div>
      {suggestions.slice(0,3).map(({date,insight})=>insight&&<button key={date} className="recommendation-row" onClick={()=>onPickSuggestion?onPickSuggestion(date,insight.start,insight.end):open('plan','week')}>
        <div><b>{formatDate(date,{weekday:'long',day:'numeric',month:'numeric'})}</b>
          <small>{insight.start} – {insight.end} · {insight.closeness===null?'chưa có trạng thái chung':('closeness '+insight.closeness+'/5')}</small>
        </div><ChevronRight size={18}/>
      </button>)}
    </section>
    <div className="week-actions">
      <button className="secondary-button" onClick={()=>open('work','week')}><BriefcaseBusiness size={16}/> Workdate</button>
      <button className="primary-button compact-button" onClick={()=>open('plan','week')}><Heart size={16}/> Tạo plan</button>
    </div>
  </Page>
}
function WeekGrid({state,days}:{state:CoupleState;days:string[]}){const hours=[8,10,12,14,16,18,20,22];const style=(start:string,end:string)=>{const[sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number),startM=sh*60+sm,endM=eh*60+em,top=((startM-480)/840)*100,height=Math.max(3,((endM-startM)/840)*100);return{top:`${Math.max(0,top)}%`,height:`${Math.min(100-Math.max(0,top),height)}%`}};return <div className="week-grid-wrap"><div className="time-axis">{hours.map(h=><span key={h} style={{top:`${((h-8)/14)*100}%`}}>{String(h).padStart(2,'0')}:00</span>)}</div><div className="week-columns">{days.map(day=><div className="week-column" key={day}>{hours.map(h=><i key={h} style={{top:`${((h-8)/14)*100}%`}}/>)}{state.availability.filter(x=>x.date===day).map(b=><span key={b.id} className={`calendar-block ${b.userId===state.me.id?'me':'partner'} ${b.status}`} style={style(b.start,b.end)}/>)}{state.workSchedules.filter(w=>w.type!=='off'&&workOccursOn(w,day)).map(w=><span key={`work-${w.id}`} className={`calendar-block work ${w.userId===state.me.id?'me':'partner'}`} style={style(w.start,w.end)}/>)}</div>)}</div></div>}

export function Us({state,updateState,open,notify}:CommonProps){
  const [inviteNow,setInviteNow]=useState(Date.now)
  const [inviteOwner,setInviteOwner]=useState<string|null>(null)
  const [inviteBusy,setInviteBusy]=useState(false)
  const [inviteFeedback,setInviteFeedback]=useState('')
  const inviteLock=useRef(false)
  const latestInviteState=useRef(state)
  latestInviteState.current=state
  const inviteMounted=useRef(true)
  const waiting=state.partner.id==='waiting-partner'
  const expiresAt=Date.parse(state.inviteExpiresAt??'')
  const activeInvite=waiting&&Boolean(state.inviteCode)&&expiresAt>inviteNow
  const ownerKey=JSON.stringify([state.id,state.me.id])
  const canRotate=isSupabaseConfigured&&waiting&&inviteOwner===ownerKey
  const touchTarget={minHeight:44,minWidth:44}
  useEffect(()=>{inviteMounted.current=true;return()=>{inviteMounted.current=false}},[])
  useEffect(()=>{
    setInviteNow(Date.now());setInviteFeedback('')
    if(!waiting||!Number.isFinite(expiresAt))return
    const refresh=()=>setInviteNow(Date.now())
    const timer=window.setTimeout(refresh,Math.min(2147483647,Math.max(0,expiresAt-Date.now()+1)))
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refresh)
    return()=>{window.clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  },[waiting,expiresAt,state.inviteCode])
  useEffect(()=>{
    let alive=true
    setInviteOwner(null)
    if(supabase&&waiting){
      void supabase.from('couple_members').select('role').eq('couple_id',state.id).eq('user_id',state.me.id).maybeSingle()
        .then(({data,error})=>{if(alive&&!error&&data?.role==='owner')setInviteOwner(ownerKey)},()=>{/* fail closed: keep renewal hidden */})
    }
    return()=>{alive=false}
  },[ownerKey,waiting,state.id,state.me.id])
  const currentInviteUrl=()=>{
    const current=latestInviteState.current
    if(current.partner.id!=='waiting-partner'||!current.inviteCode||!(Date.parse(current.inviteExpiresAt??'')>Date.now())){
      setInviteNow(Date.now());setInviteFeedback('Lời mời không còn hiệu lực. Hãy tạo lời mời mới.');return null
    }
    const url=new URL(import.meta.env.BASE_URL,window.location.origin)
    url.searchParams.set('invite',current.inviteCode)
    return url.toString()
  }
  const sendInvite=async(share:boolean)=>{
    if(inviteLock.current)return
    const url=currentInviteUrl()
    if(!url)return
    inviteLock.current=true;setInviteBusy(true);setInviteFeedback('')
    try{
      if(share&&navigator.share){
        await navigator.share({title:'Together',text:'Cùng mình giữ nhịp mỗi ngày nhé',url})
      }else{
        if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable')
        await navigator.clipboard.writeText(url)
        if(inviteMounted.current)setInviteFeedback('Đã sao chép link mời.')
      }
    }catch(error){
      if(inviteMounted.current&&!(error instanceof DOMException&&error.name==='AbortError'))setInviteFeedback('Không thể chia sẻ tự động. Bạn có thể chọn và sao chép mã mời đang hiển thị.')
    }finally{inviteLock.current=false;if(inviteMounted.current)setInviteBusy(false)}
  }
  const renewInvite=async()=>{
    if(!canRotate||inviteLock.current)return
    const coupleId=state.id,userId=state.me.id
    inviteLock.current=true;setInviteBusy(true);setInviteFeedback('')
    try{
      const invite=await rotateRemoteInvite()
      const current=latestInviteState.current
      if(!inviteMounted.current||current.id!==coupleId||current.me.id!==userId||current.partner.id!=='waiting-partner')return
      updateState(d=>{if(d.id===coupleId&&d.me.id===userId&&d.partner.id==='waiting-partner'){d.inviteCode=invite.code;d.inviteExpiresAt=invite.expiresAt}})
      setInviteNow(Date.now());setInviteFeedback('Đã tạo lời mời mới. Mã cũ không còn hiệu lực.')
    }catch{if(inviteMounted.current)setInviteFeedback('Chưa tạo được lời mời mới. Hãy tải lại để kiểm tra kết nối và quyền chủ sở hữu.')}
    finally{inviteLock.current=false;if(inviteMounted.current)setInviteBusy(false)}
  }
const [privacyExpanded,setPrivacyExpanded]=useState(false);const fileRef=useRef<HTMLInputElement>(null);const updateAvatar=async(file?:File)=>{if(!file)return;try{const blob=await compressAvatar(file);let avatarUrl=await blobToDataUrl(blob),avatarPath=state.me.avatarPath;if(supabase){const{data:userData}=await supabase.auth.getUser(),userId=userData.user?.id;if(!userId||userId!==state.me.id)throw new Error('Tài khoản đã thay đổi. Hãy tải lại hồ sơ.');{avatarPath=`${userId}/avatar-${Date.now()}.webp`;const{error}=await supabase.storage.from('avatars').upload(avatarPath,blob,{contentType:'image/webp',upsert:false});if(error)throw error;const signed=await supabase.storage.from('avatars').createSignedUrl(avatarPath,3600);avatarUrl=signed.data?.signedUrl??avatarUrl;await saveRemoteProfile(state.me.displayName,avatarPath,state.me.id)}}updateState(d=>{d.me.avatarUrl=avatarUrl;d.me.avatarPath=avatarPath});notify('Đã đổi ảnh đại diện.')}catch(e){notify(e instanceof Error?e.message:'Không thể đổi ảnh.','normal')}};const my=state.checkins.find(x=>x.userId===state.me.id&&x.weekStart===getWeekStart()),partner=state.checkins.find(x=>x.userId===state.partner.id&&x.weekStart===getWeekStart());return <Page className="us-page with-nav"><AppHeader state={state}/><div className="us-hero"><div className="couple-avatar-stack"><Avatar profile={state.me} size="lg"/><Avatar profile={state.partner} size="lg"/></div><h1>{state.name}</h1><p>Hai cuộc sống khác nhau. Một nhịp chung.</p></div><section className="settings-card"><button onClick={()=>fileRef.current?.click()}><Camera size={18}/><div><strong>Ảnh đại diện của bạn</strong><small>Tải ảnh mới từ thiết bị</small></div><ChevronRight size={18}/></button><input hidden ref={fileRef} type="file" accept="image/*" onChange={e=>updateAvatar(e.target.files?.[0])}/><button onClick={()=>open('daily','us')}><Zap size={18}/><div><strong>Trạng thái hôm nay</strong><small>Energy + closeness</small></div><ChevronRight size={18}/></button><button onClick={()=>open('checkin','us')}><Heart size={18}/><div><strong>Weekly check-in</strong><small>{my?'Bạn đã trả lời tuần này':'Chưa trả lời tuần này'}</small></div><ChevronRight size={18}/></button><button onClick={()=>setPrivacyExpanded(value=>!value)}><Settings size={18}/><div><strong>Quyền riêng tư</strong><small>Couple-only · không public profile</small></div><ChevronRight size={18}/></button></section>{privacyExpanded&&<section className="privacy-note"><Heart size={16}/> Chỉ thành viên trong couple đọc được lịch, năng lượng và kế hoạch. Check-in chỉ hiện khi cả hai cùng trả lời. Ảnh được lưu trong private Storage.</section>}<section className="reveal-card"><span className="eyebrow">Check-in tuần này</span><h3>Mỗi người cảm thấy thế nào?</h3>{my&&partner?<div className="checkin-reveal"><Feeling feeling={my.feeling} name={state.me.displayName}/><Feeling feeling={partner.feeling} name={state.partner.displayName}/></div>:<p>Chỉ reveal khi cả hai đã trả lời. Không tạo áp lực trả lời giống nhau.</p>}</section><section className="invite-card" aria-labelledby="us-invite-heading" aria-busy={inviteBusy}>
  <span className="eyebrow" id="us-invite-heading">Kết nối của hai người</span>
  {!waiting?<p>Hai bạn đã kết nối. Lời mời cũ không còn dùng được.</p>:activeInvite?<>
    <label htmlFor="us-invite-code">Mã mời dùng một lần</label>
    <input id="us-invite-code" readOnly value={state.inviteCode} onFocus={event=>event.currentTarget.select()} style={{...touchTarget,width:'100%',minWidth:0,fontSize:16}}/>
    <p>Hết hạn lúc <time dateTime={state.inviteExpiresAt}>{new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(expiresAt))}</time>. Chỉ gửi cho người bạn muốn kết nối.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
      <button type="button" className="primary-button" style={touchTarget} disabled={inviteBusy} onClick={()=>void sendInvite(true)}><Share2 size={18} aria-hidden="true"/> Chia sẻ lời mời</button>
      <button type="button" className="secondary-button" style={touchTarget} disabled={inviteBusy} onClick={()=>void sendInvite(false)}><Copy size={18} aria-hidden="true"/> Sao chép link</button>
    </div>
  </>:<p role="status">Lời mời đã hết hạn hoặc không còn hiệu lực. Mã cũ đã được ẩn.</p>}
  {canRotate&&<><button type="button" className="secondary-button" style={touchTarget} disabled={inviteBusy} onClick={()=>void renewInvite()}><RefreshCcw size={18} aria-hidden="true"/>{inviteBusy?'Đang xử lý…':'Tạo lời mời mới'}</button><p>Tạo mới sẽ vô hiệu hóa lời mời trước đó.</p></>}
  {waiting&&!canRotate&&isSupabaseConfigured&&<p>Chỉ chủ sở hữu không gian có thể tạo lại lời mời.</p>}
  {!isSupabaseConfigured&&<p>Đây là bản demo trên thiết bị. Kết nối người thật cần đăng nhập.</p>}
  <p role="status" aria-live="polite">{inviteFeedback}</p>
</section>{!isSupabaseConfigured&&<button className="text-button danger" onClick={()=>{resetDemoState();localStorage.removeItem('together-onboarded');location.reload()}}><RefreshCcw size={15}/> Reset bản demo</button>}</Page>}
function Feeling({feeling,name}:{feeling:1|2|3;name:string}){const map={1:['Quá ít','☹'],2:['Vừa đủ','☺'],3:['Quá nhiều','◔']} as const;return <div className={`feeling-badge feeling-${feeling}`}><span>{map[feeling][1]}</span><div><strong>{name}</strong><small>{map[feeling][0]}</small></div></div>}
