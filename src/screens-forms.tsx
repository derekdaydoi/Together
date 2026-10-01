import { useState } from 'react'
import { BriefcaseBusiness, CalendarDays, Clock3, Coffee, Heart, Laptop, MoonStar, Zap } from 'lucide-react'
import type { CommonProps } from './appTypes'
import type { AvailabilityBlock, AvailabilityStatus, DailyState, WeeklyCheckin, WorkSchedule, WorkType } from './types'
import { Field, Page, TopBack } from './UI'
import { addAvailability, addWork, upsertCheckin, upsertDailyState } from './lib/demoStore'
import { saveRemoteAvailability, saveRemoteCheckin, saveRemoteDaily, saveRemoteWork } from './lib/remoteStore'
import { supabase } from './lib/supabase'
import { localISODate, validTimeRange, weekStartISO } from './lib/dates'

const todayDate=localISODate
const uid=(p:string)=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
const formatDate=(iso:string)=>new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${iso}T12:00:00`))
const getWeekStart=weekStartISO
const energyLabels=['Rất mệt','Hơi đuối','Bình thường','Khá ổn','Rất tốt']; const closenessLabels=['Cần không gian','Ở riêng cũng ổn','Có gặp thì vui','Muốn gần nhau','Rất muốn ở bên nhau']
const workMeta:Record<WorkType,{label:string;icon:typeof Coffee}>={office:{label:'Văn phòng',icon:BriefcaseBusiness},remote:{label:'Remote',icon:Laptop},shift:{label:'Ca làm',icon:Clock3},off:{label:'Nghỉ',icon:Coffee},other:{label:'Khác',icon:CalendarDays}}
const availabilityMeta:Record<AvailabilityStatus,{label:string;className:string}>={available:{label:'Rảnh',className:'mint'},busy:{label:'Bận',className:'rose'},prefer_alone:{label:'Muốn ở một mình',className:'lilac'},want_together:{label:'Muốn gặp',className:'peach'}}

export function DailyStateForm({state,updateState,onClose,notify,sync}:CommonProps&{onClose:()=>void}){const date=todayDate(),current=state.dailyStates.find(x=>x.userId===state.me.id&&x.date===date),[energy,setEnergy]=useState(current?.energy??3),[closeness,setCloseness]=useState(current?.closeness??3),[note,setNote]=useState(current?.note??'');const save=()=>{const next:DailyState={userId:state.me.id,date,energy,closeness,note:note.trim()||undefined},coupleId=state.id;updateState(d=>upsertDailyState(d,next));sync(()=>saveRemoteDaily(coupleId,next),'Không thể lưu trạng thái.');notify('Đã cập nhật trạng thái hôm nay.');onClose()};return <Page className="form-page"><TopBack title="Hôm nay bạn thế nào?" onBack={onClose}/><div className="form-intro"><span className="eyebrow">{formatDate(date)}</span><h2>Một tín hiệu nhỏ giúp người kia hiểu bạn hơn.</h2><p>Không có đáp án đúng. Trạng thái này chỉ dành cho hôm nay.</p></div><Scale label="Mức năng lượng" value={energy} onChange={setEnergy} tone="energy" labels={energyLabels}/><Scale label="Mức muốn gần nhau" value={closeness} onChange={setCloseness} tone="heart" labels={closenessLabels}/><Field label="Chia sẻ thêm (tuỳ chọn)"><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Hôm nay hơi mệt, chỉ muốn ở cạnh nhau nhẹ nhàng."/></Field><div className="privacy-note"><MoonStar size={16}/> Chỉ người trong couple mới nhìn thấy trạng thái này.</div><button className="primary-button sticky-action" onClick={save}>Lưu trạng thái</button></Page>}
function Scale({label,value,onChange,tone,labels}:{label:string;value:number;onChange:(v:number)=>void;tone:string;labels:string[]}){const Icon=tone==='heart'?Heart:Zap;return <section className="scale-section"><div className="scale-label"><Icon size={18}/><strong>{label}</strong></div><div className={`scale-buttons ${tone}`}>{[1,2,3,4,5].map(n=><button key={n} className={n===value?'active':''} onClick={()=>onChange(n)}><Icon size={22} fill={n<=value?'currentColor':'none'}/></button>)}</div><strong className="scale-current">{labels[value-1]}</strong></section>}

export function CheckinForm({ state, updateState, onClose, notify, sync }: CommonProps & { onClose: () => void }) {
  const weekStart = weekStartISO()
  const current = state.checkins.find(x => x.userId === state.me.id && x.weekStart === weekStart)
  const partner = state.checkins.find(x => x.userId === state.partner.id && x.weekStart === weekStart)
  // Partner's answer is revealed only after both completed the check-in.
  const locked = Boolean(current && partner)
  const [feeling, setFeeling] = useState<1 | 2 | 3>(current?.feeling ?? 2)
  const [note, setNote] = useState(current?.note ?? '')
  const [busy, setBusy] = useState(false)

  const save = () => {
    if (busy || locked) return
    setBusy(true)
    const next: WeeklyCheckin = { userId: state.me.id, weekStart, feeling, note: note.trim() || undefined }
    const coupleId = state.id
    updateState(draft => upsertCheckin(draft, next))
    sync(() => saveRemoteCheckin(coupleId, next), 'Không thể gửi check-in.')
    notify('Đã gửi check-in tuần này.')
    onClose()
  }

  return <Page className="form-page checkin-page">
    <TopBack title="Weekly check-in" onBack={onClose}/>
    <div className="form-intro">
      <span className="eyebrow">Tuần này của bạn thế nào?</span>
      <h2>Thời gian bên nhau so với điều bạn cần?</h2>
      <p>Không chấm điểm. Chỉ là tín hiệu để tuần sau dễ điều chỉnh hơn.</p>
    </div>
    <div className="feeling-options" role="group" aria-label="Thời gian bên nhau tuần này">
      {([
        { value: 1 as const, glyph: '☹', label: 'Quá ít' },
        { value: 2 as const, glyph: '☺', label: 'Vừa đủ' },
        { value: 3 as const, glyph: '◔', label: 'Quá nhiều' },
      ]).map(option => <button key={option.value} type="button" disabled={busy||locked}
        className={feeling===option.value?'active':''} aria-pressed={feeling===option.value}
        onClick={()=>setFeeling(option.value)}><span>{option.glyph}</span><strong>{option.label}</strong></button>)}
    </div>
    <Field label="Chia sẻ thêm (tuỳ chọn)">
      <textarea rows={4} maxLength={500} disabled={busy||locked} value={note}
        onChange={event=>setNote(event.target.value)} placeholder="Tuần này ổn áp! 💕"/>
    </Field>
    {locked
      ? <p className="privacy-note" role="status">Cả hai đã trả lời. Check-in tuần này đã chốt và không thể sửa.</p>
      : <div className="privacy-note"><Heart size={16} aria-hidden="true"/> Câu trả lời được giữ riêng cho tới khi cả hai cùng hoàn thành.</div>}
    <button className="primary-button sticky-action" disabled={busy||locked} onClick={()=>void save()}>
      {locked ? 'Đã hoàn thành' : busy ? 'Đang gửi…' : 'Gửi phản hồi'}
    </button>
  </Page>
}
