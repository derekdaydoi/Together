import { useState } from 'react'
import { BriefcaseBusiness, CalendarDays, Clock3, Coffee, Laptop, Trash2 } from 'lucide-react'
import type { CommonProps } from './appTypes'
import type { AvailabilityStatus, AvailabilityBlock, WorkSchedule, WorkType } from './types'
import { Field, Page, TopBack } from './UI'
import { addAvailability, addWork } from './lib/demoStore'
import { localISODate, validTimeRange } from './lib/dates'
import { workOccursOn } from './lib/insights'
import { deleteRemoteAvailability, deleteRemoteWork, saveRemoteAvailability, saveRemoteWork } from './lib/remoteStore'
import { supabase } from './lib/supabase'

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const workOptions: { type: WorkType; label: string; Icon: typeof Coffee }[] = [
  { type: 'office', label: 'Văn phòng', Icon: BriefcaseBusiness },
  { type: 'remote', label: 'Remote', Icon: Laptop },
  { type: 'shift', label: 'Ca làm', Icon: Clock3 },
  { type: 'off', label: 'Nghỉ', Icon: Coffee },
  { type: 'other', label: 'Khác', Icon: CalendarDays },
]
const availabilityOptions: { type: AvailabilityStatus; label: string; color: string }[] = [
  { type: 'available', label: 'Rảnh', color: 'mint' },
  { type: 'busy', label: 'Bận', color: 'rose' },
  { type: 'prefer_alone', label: 'Muốn ở một mình', color: 'lilac' },
  { type: 'want_together', label: 'Muốn gặp', color: 'peach' },
]

export function WorkForm({ state, updateState, notify, onClose }: CommonProps & { onClose: () => void }) {
  const [date, setDate] = useState(localISODate())
  const [type, setType] = useState<WorkType>('office')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:30')
  const [note, setNote] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [busy, setBusy] = useState(false)
  const mySchedules = state.workSchedules.filter(x => x.userId === state.me.id && workOccursOn(x, date))

  const save = async () => {
    if (busy) return
    if (!validTimeRange(start, end)) return notify('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.', 'normal')
    if (note.length > 500) return notify('Ghi chú quá dài.', 'normal')
    const item: WorkSchedule = { id: uid('work'), userId: state.me.id, date, start, end, type, note, repeatsWeekly: repeat }
    setBusy(true)
    try {
      if (supabase) item.id = await saveRemoteWork(state.id, item)
      updateState(draft => addWork(draft, item))
      notify('Đã lưu lịch làm việc.')
      onClose()
    } catch (e) { notify(e instanceof Error ? e.message : 'Không thể lưu lịch.', 'normal') }
    finally { setBusy(false) }
  }
  const remove = async (item: WorkSchedule) => {
    if (busy || !window.confirm(item.repeatsWeekly ? 'Xóa cả lịch làm việc lặp lại hàng tuần này?' : 'Xóa lịch làm việc này?')) return
    setBusy(true)
    try {
      if (supabase) await deleteRemoteWork(state.id, item.id)
      updateState(draft => { draft.workSchedules = draft.workSchedules.filter(x => x.id !== item.id) })
      notify('Đã xóa lịch làm việc.')
    } catch (e) { notify(e instanceof Error ? e.message : 'Không thể xóa lịch.', 'normal') }
    finally { setBusy(false) }
  }

  return <Page className="form-page"><TopBack title="Lịch làm việc" onBack={onClose}/>
    <div className="form-stack">
      <Field label="Ngày"><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
      {mySchedules.length > 0 && <section className="schedule-current"><strong>Đang có trong ngày</strong>
        {mySchedules.map(item => <div key={item.id} className="schedule-existing">
          <div><b>{workOptions.find(option => option.type === item.type)?.label ?? 'Công việc'}</b>
            <small>{item.start} – {item.end}{item.repeatsWeekly ? ' · Lặp hàng tuần' : ''}</small></div>
          <button type="button" aria-label="Xóa lịch làm việc" disabled={busy} onClick={() => remove(item)}><Trash2 size={17}/></button>
        </div>)}
      </section>}
      <div><label className="field-label">Loại lịch</label><div className="option-grid work-options">
        {workOptions.map(({ type: option, label, Icon }) => <button key={option} type="button" className={option === type ? 'active' : ''} onClick={() => setType(option)}>
          <Icon size={19}/><span>{label}</span>
        </button>)}
      </div></div>
      <div className="two-cols">
        <Field label="Từ"><input type="time" value={start} onChange={e => setStart(e.target.value)}/></Field>
        <Field label="Đến"><input type="time" value={end} onChange={e => setEnd(e.target.value)}/></Field>
      </div>
      <Field label="Ghi chú (tuỳ chọn)"><input value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Họp team, làm việc ở nhà…"/></Field>
      <label className="toggle-row"><button type="button" className={`toggle ${repeat ? 'on' : ''}`} onClick={() => setRepeat(!repeat)}><span/></button>
        <div><strong>Lặp hàng tuần</strong><small>Có thể xóa cả chuỗi lịch khi thay đổi</small></div>
      </label>
    </div>
    <button className="primary-button sticky-action" disabled={busy} onClick={save}>{busy ? 'Đang xử lý…' : 'Thêm lịch làm việc'}</button>
  </Page>
}

export function AvailabilityForm({ state, updateState, notify, onClose }: CommonProps & { onClose: () => void }) {
  const [date, setDate] = useState(localISODate())
  const [status, setStatus] = useState<AvailabilityStatus>('available')
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('22:00')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = state.availability.filter(x => x.userId === state.me.id && x.date === date)

  const save = async () => {
    if (busy) return
    if (!validTimeRange(start, end)) return notify('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.', 'normal')
    if (note.length > 500) return notify('Ghi chú quá dài.', 'normal')
    const item: AvailabilityBlock = { id: uid('availability'), userId: state.me.id, date, start, end, status, note }
    setBusy(true)
    try {
      if (supabase) item.id = await saveRemoteAvailability(state.id, item)
      updateState(draft => addAvailability(draft, item))
      notify('Đã lưu lịch và nhu cầu của bạn.')
      onClose()
    } catch (e) { notify(e instanceof Error ? e.message : 'Không thể lưu lịch.', 'normal') }
    finally { setBusy(false) }
  }
  const remove = async (item: AvailabilityBlock) => {
    if (busy || !window.confirm('Xóa khung giờ này?')) return
    setBusy(true)
    try {
      if (supabase) await deleteRemoteAvailability(state.id, item.id)
      updateState(draft => { draft.availability = draft.availability.filter(x => x.id !== item.id) })
      notify('Đã xóa khung giờ.')
    } catch (e) { notify(e instanceof Error ? e.message : 'Không thể xóa khung giờ.', 'normal') }
    finally { setBusy(false) }
  }

  return <Page className="form-page"><TopBack title="Lịch & nhu cầu của bạn" onBack={onClose}/>
    <div className="form-stack">
      <Field label="Ngày"><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
      {mine.length > 0 && <section className="schedule-current"><strong>Đang có trong ngày</strong>
        {mine.map(item => <div key={item.id} className="schedule-existing">
          <div><b>{availabilityOptions.find(option => option.type === item.status)?.label ?? 'Lịch cá nhân'}</b>
            <small>{item.start} – {item.end}{item.note ? ` · ${item.note}` : ''}</small></div>
          <button type="button" aria-label="Xóa khung giờ" disabled={busy} onClick={() => remove(item)}><Trash2 size={17}/></button>
        </div>)}
      </section>}
      <div><label className="field-label">Bạn muốn đánh dấu khoảng này là</label><div className="option-grid availability-options">
        {availabilityOptions.map(option => <button key={option.type} type="button" className={`${option.color} ${option.type === status ? 'active' : ''}`} onClick={() => setStatus(option.type)}>{option.label}</button>)}
      </div></div>
      <div className="two-cols">
        <Field label="Từ"><input type="time" value={start} onChange={e => setStart(e.target.value)}/></Field>
        <Field label="Đến"><input type="time" value={end} onChange={e => setEnd(e.target.value)}/></Field>
      </div>
      <Field label="Ghi chú (tuỳ chọn)"><textarea rows={3} value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Có thể đi ăn, cần yên tĩnh…"/></Field>
    </div>
    <button className="primary-button sticky-action" disabled={busy} onClick={save}>{busy ? 'Đang xử lý…' : 'Thêm khung giờ'}</button>
  </Page>
}
