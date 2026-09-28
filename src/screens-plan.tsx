import { useState } from 'react'
import { CalendarDays, Check, Clock3, Heart, MapPin } from 'lucide-react'
import type { CommonProps } from './appTypes'
import type { PlanType, SharedPlan } from './types'
import { Avatar, Field, Page, TopBack } from './UI'
import { addPlan } from './lib/demoStore'
import { localISODate, validTimeRange } from './lib/dates'
import { planIdeas } from './lib/planIdeas'
import { cancelRemotePlan, confirmRemotePlan, saveRemotePlan, updateRemotePlan } from './lib/remoteStore'
import { supabase } from './lib/supabase'

const uid = () => `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const formatDate = (date: string) => new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(`${date}T12:00:00`))

export function PlanForm({ state, updateState, notify, onClose, initialPlan, suggestedSlot }: CommonProps & {
  onClose: () => void
  initialPlan?: SharedPlan
  suggestedSlot?: { date: string; start: string; end: string }
}) {
  const [type, setType] = useState<PlanType>(initialPlan?.type ?? 'soft')
  const [title, setTitle] = useState(initialPlan?.title ?? '')
  const [date, setDate] = useState(initialPlan?.date ?? suggestedSlot?.date ?? localISODate())
  const [start, setStart] = useState(initialPlan?.start ?? suggestedSlot?.start ?? '19:00')
  const [end, setEnd] = useState(initialPlan?.end ?? suggestedSlot?.end ?? '21:00')
  const [location, setLocation] = useState(initialPlan?.location ?? '')
  const [note, setNote] = useState(initialPlan?.note ?? '')
  const [selectedIdea, setSelectedIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const suggested = planIdeas(state, date)

  const save = async () => {
    if (busy) return
    if (!title.trim()) return notify('Hãy đặt tên cho kế hoạch.', 'normal')
    if (!validTimeRange(start, end)) return notify('Giờ kết thúc phải sau giờ bắt đầu trong cùng một ngày.', 'normal')
    if (title.trim().length > 160 || location.length > 300 || note.length > 800) {
      return notify('Tên, địa điểm hoặc ghi chú quá dài.', 'normal')
    }
    const next: SharedPlan = {
      id: initialPlan?.id ?? uid(), title: title.trim(), date, start, end, type,
      status: 'proposed', revision: initialPlan?.revision ?? 1,
      location: location.trim(), note: note.trim(), createdBy: initialPlan?.createdBy ?? state.me.id,
    }
    setBusy(true)
    try {
      if (supabase) {
        if (initialPlan) next.revision = await updateRemotePlan(state.id, next)
        else Object.assign(next, await saveRemotePlan(state.id, next))
      } else if (initialPlan) {
        next.revision += 1
      }
      updateState(draft => {
        if (initialPlan) draft.plans = draft.plans.map(plan => plan.id === initialPlan.id ? next : plan)
        else addPlan(draft, next)
      })
      notify(type === 'hard' ? 'Đã gửi kế hoạch. Người ấy cần xác nhận.' : initialPlan ? 'Đã lưu thay đổi kế hoạch.' : 'Đã tạo kế hoạch chung.')
      onClose()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể lưu kế hoạch.', 'normal')
    } finally { setBusy(false) }
  }

  return <Page className="form-page">
    <TopBack title={initialPlan ? 'Chỉnh sửa kế hoạch' : 'Tạo kế hoạch chung'} onBack={onClose}/>
    <div className="plan-type-tabs">
      <button className={type === 'soft' ? 'active' : ''} onClick={() => setType('soft')}>
        <strong>Kế hoạch mềm</strong><small>Có thể thay đổi</small>
      </button>
      <button className={type === 'hard' ? 'active' : ''} onClick={() => setType('hard')}>
        <strong>Cần cả hai xác nhận</strong><small>Gửi người ấy cùng chốt</small>
      </button>
    </div>
    <section className="idea-panel">
      <div className="idea-heading"><strong>Chưa biết làm gì?</strong><p>{suggested.hint}</p></div>
      <div className="idea-options">{suggested.ideas.map(idea => <button
        key={idea.title} type="button" className={selectedIdea === idea.title ? 'active' : ''}
        onClick={() => { setTitle(idea.title); setLocation(idea.location); setNote(idea.note); setSelectedIdea(idea.title) }}
      >{idea.title}</button>)}</div>
    </section>
    <div className="form-stack">
      <Field label="Tiêu đề"><input value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="Ăn tối, cafe workdate, xem phim…"/></Field>
      <Field label="Ngày"><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
      <div className="two-cols">
        <Field label="Từ"><input type="time" value={start} onChange={e => setStart(e.target.value)}/></Field>
        <Field label="Đến"><input type="time" value={end} onChange={e => setEnd(e.target.value)}/></Field>
      </div>
      <Field label="Địa điểm (tuỳ chọn)"><input value={location} maxLength={300} onChange={e => setLocation(e.target.value)} placeholder="Gần nhà, quán quen, ở nhà…"/></Field>
      <Field label="Ghi chú (tuỳ chọn)"><textarea rows={3} value={note} maxLength={800} onChange={e => setNote(e.target.value)} placeholder="Hai người muốn ăn gì, cần chuẩn bị gì…"/></Field>
    </div>
    <div className="members-preview"><span className="eyebrow">Thành viên</span><div>
      <Avatar profile={state.me} size="sm"/><Avatar profile={state.partner} size="sm"/>
      <strong>{state.me.displayName} + {state.partner.displayName}</strong>
    </div></div>
    <button className="primary-button sticky-action" disabled={busy} onClick={save}>
      {busy ? 'Đang lưu…' : initialPlan ? 'Lưu thay đổi' : 'Tạo kế hoạch'}
    </button>
  </Page>
}

export function PlanDetail({ plan, state, updateState, notify, onClose, onEdit }: CommonProps & {
  plan: SharedPlan
  onClose: () => void
  onEdit: () => void
}) {
  const current = state.plans.find(item => item.id === plan.id) ?? plan
  const [busy, setBusy] = useState(false)
  // Keep the version the person deliberately opened. A realtime refresh may
  // change the visible proposal; that must require an explicit second review.
  const [viewedRevision, setViewedRevision] = useState(plan.revision ?? current.revision)
  const isHardPending = current.type === 'hard' && current.status === 'proposed'
  const needsReview = isHardPending && current.createdBy !== state.me.id && current.revision !== viewedRevision
  const canConfirm = isHardPending && current.createdBy !== state.me.id && !needsReview
  const confirm = async () => {
    if (busy || !canConfirm) return
    setBusy(true)
    try {
      const revision = supabase ? await confirmRemotePlan(state.id, current.id, viewedRevision) : current.revision + 1
      updateState(draft => { draft.plans = draft.plans.map(item => item.id === current.id ? { ...item, status: 'confirmed', revision } : item) })
      notify('Hai người đã xác nhận kế hoạch.')
    } catch (error) { notify(error instanceof Error ? error.message : 'Không thể xác nhận kế hoạch.', 'normal') }
    finally { setBusy(false) }
  }
  const cancel = async () => {
    if (busy || !window.confirm('Huỷ kế hoạch này cho cả hai?')) return
    setBusy(true)
    try {
      const revision = supabase ? await cancelRemotePlan(state.id, current.id, current.revision) : current.revision + 1
      updateState(draft => { draft.plans = draft.plans.map(item => item.id === current.id ? { ...item, status: 'cancelled', revision } : item) })
      notify('Đã huỷ kế hoạch.')
      onClose()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể huỷ kế hoạch.', 'normal')
    } finally { setBusy(false) }
  }

  return <Page className="detail-page">
    <TopBack title="Chi tiết kế hoạch" onBack={onClose}/>
    <div className="plan-detail-hero"><div className="cinema-illustration"><span/><span/><span/><i/></div>
      <div className="detail-title"><div>
        <span className={`status-chip ${current.type}`}>{current.status === 'cancelled' ? 'Đã huỷ' : current.type === 'soft' ? 'Kế hoạch mềm' : isHardPending ? 'Chờ xác nhận' : 'Đã xác nhận'}</span>
        <h1>{current.title}</h1>
      </div><Heart size={26}/></div>
    </div>
    <div className="detail-list">
      <div><CalendarDays/><span>{formatDate(current.date)}</span></div>
      <div><Clock3/><span>{current.start} – {current.end}</span></div>
      {current.location && <div><MapPin/><span>{current.location}</span></div>}
    </div>
    {current.note && <blockquote>“{current.note}”</blockquote>}
    <section className="detail-members"><span className="eyebrow">Thành viên</span>
      <Member profile={state.me}/><Member profile={state.partner}/>
    </section>
    {isHardPending && current.createdBy === state.me.id && <p className="privacy-note">Đã gửi lời mời. Khi người ấy xác nhận, kế hoạch mới được chốt.</p>}
    {needsReview && <div className="privacy-note">
      <p>Đề xuất đã được cập nhật sau khi bạn mở trang này. Xem lại ngày, giờ và nội dung mới trước khi xác nhận.</p>
      <button className="secondary-button" disabled={busy} onClick={()=>setViewedRevision(current.revision)}>Tôi đã xem nội dung mới</button>
    </div>}
    {canConfirm && <button className="primary-button" disabled={busy} onClick={confirm}>{busy ? 'Đang xác nhận…' : 'Xác nhận kế hoạch cùng nhau'}</button>}
    {current.status !== 'cancelled' && <div className="detail-actions">
      {(current.type === 'soft' || current.createdBy === state.me.id) && <button className="secondary-button" disabled={busy} onClick={onEdit}>Chỉnh sửa</button>}
      <button className="secondary-button danger-outline" disabled={busy} onClick={cancel}>{busy ? 'Đang huỷ…' : 'Huỷ kế hoạch'}</button>
    </div>}
  </Page>
}

function Member({ profile }: { profile: CoupleStateMember }) {
  return <div className="member-row"><Avatar profile={profile} size="md"/>
    <div><strong>{profile.displayName}</strong><small>Trong không gian chung</small></div><Check size={17}/>
  </div>
}

type CoupleStateMember = { displayName: string; avatarUrl?: string; id: string; avatarPath?: string }
