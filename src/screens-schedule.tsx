import { useState } from 'react'
import { BriefcaseBusiness, CalendarDays, Clock3, Coffee, Laptop, Trash2 } from 'lucide-react'
import type { CommonProps } from './appTypes'
import type { AvailabilityStatus, AvailabilityBlock, WorkSchedule, WorkType } from './types'
import { Field, Page, TopBack } from './UI'
import { addAvailability, addWork } from './lib/demoStore'
import { REPEAT_HORIZON_DAYS, firstWeekdayOnOrAfter, localISODate, repeatDates, validTimeRange, weekdayIndex } from './lib/dates'
import { FrequencyButton, describeWeekdays } from './frequency'
import { workOccursOn } from './lib/insights'
import { deleteRemoteAvailability, deleteRemoteWork, newId, saveRemoteAvailability, saveRemoteWork } from './lib/remoteStore'
import { isSupabaseConfigured } from './lib/supabase'
import { SwipeRow } from './gestures'

// Remote rows use a device-generated UUID so the insert never blocks the screen.
const uid = (prefix: string) => isSupabaseConfigured ? newId() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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

export function WorkForm({ state, updateState, notify, onClose, sync }: CommonProps & { onClose: () => void }) {
  const [date, setDate] = useState(localISODate())
  const [type, setType] = useState<WorkType>('office')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:30')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const mySchedules = state.workSchedules.filter(x => x.userId === state.me.id && workOccursOn(x, date))

  const save = async (days?: number[]) => {
    if (busy) return
    if (!validTimeRange(start, end)) return notify('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.', 'normal')
    if (note.length > 500) return notify('Ghi chú quá dài.', 'normal')
    // Each chosen weekday becomes one weekly-repeating series starting at its first occurrence.
    const chosen = days ?? []
    const items: WorkSchedule[] = chosen.length
      ? chosen.map(weekday => ({ id: uid('work'), userId: state.me.id, date: firstWeekdayOnOrAfter(date, weekday), start, end, type, note, repeatsWeekly: true }))
      : [{ id: uid('work'), userId: state.me.id, date, start, end, type, note, repeatsWeekly: false }]
    setBusy(true)
    const coupleId = state.id
    for (const item of items) {
      updateState(draft => addWork(draft, item))
      sync(() => saveRemoteWork(coupleId, item), 'Không thể lưu lịch làm việc.')
    }
    notify(chosen.length ? `Đã lưu lịch làm việc lặp ${describeWeekdays(chosen)}.` : 'Đã lưu lịch làm việc.')
    onClose()
  }
  const remove = (item: WorkSchedule, ask = true) => {
    if (busy || (ask && !window.confirm(item.repeatsWeekly ? 'Xóa cả lịch làm việc lặp lại hàng tuần này?' : 'Xóa lịch làm việc này?'))) return
    removeWork(state, updateState, sync, item)
    notify('Đã xóa lịch làm việc.')
  }

  return <Page className="form-page"><TopBack title="Lịch làm việc" onBack={onClose}/>
    <div className="form-stack">
      <Field label="Ngày"><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
      {mySchedules.length > 0 && <section className="schedule-current"><strong>Đang có trong ngày</strong>
        {mySchedules.map(item => <SwipeRow key={item.id} actionLabel={item.repeatsWeekly ? 'Xoá chuỗi' : 'Xoá'} onAction={() => remove(item, false)}><div className="schedule-existing">
          <div><b>{workOptions.find(option => option.type === item.type)?.label ?? 'Công việc'}</b>
            <small>{item.start} – {item.end}{item.repeatsWeekly ? ' · Lặp hàng tuần' : ''}</small></div>
          <button type="button" aria-label="Xóa lịch làm việc" disabled={busy} onClick={() => remove(item)}><Trash2 size={17}/></button>
        </div></SwipeRow>)}
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
      <FrequencyButton initialDay={weekdayIndex(date)} onPick={days => void save(days)}
        hint="Lịch làm việc lặp mỗi tuần cho đến khi bạn xoá chuỗi (vuốt trái hoặc bấm xoá)."/>
    </div>
    <button className="primary-button sticky-action" disabled={busy} onClick={() => void save()}>{busy ? 'Đang xử lý…' : 'Thêm lịch làm việc'}</button>
  </Page>
}

export function AvailabilityForm({ state, updateState, notify, onClose, sync }: CommonProps & { onClose: () => void }) {
  const [date, setDate] = useState(localISODate())
  const [status, setStatus] = useState<AvailabilityStatus>('available')
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('22:00')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = state.availability.filter(x => x.userId === state.me.id && x.date === date)

  const save = async (days?: number[]) => {
    if (busy) return
    if (!validTimeRange(start, end)) return notify('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.', 'normal')
    if (note.length > 500) return notify('Ghi chú quá dài.', 'normal')
    const chosen = days ?? []
    const dates = chosen.length ? repeatDates(date, chosen) : [date]
    const items: AvailabilityBlock[] = dates.map(day => ({ id: uid('availability'), userId: state.me.id, date: day, start, end, status, note }))
    setBusy(true)
    const coupleId = state.id
    for (const item of items) {
      updateState(draft => addAvailability(draft, item))
      sync(() => saveRemoteAvailability(coupleId, item), 'Không thể lưu lịch.')
    }
    notify(chosen.length ? `Đã lưu ${items.length} khung giờ lặp ${describeWeekdays(chosen)}.` : 'Đã lưu lịch và nhu cầu của bạn.')
    onClose()
  }
  const remove = (item: AvailabilityBlock, ask = true) => {
    if (busy || (ask && !window.confirm('Xóa khung giờ này?'))) return
    removeAvailability(state, updateState, sync, item)
    notify('Đã xóa khung giờ.')
  }

  return <Page className="form-page"><TopBack title="Lịch & nhu cầu của bạn" onBack={onClose}/>
    <div className="form-stack">
      <Field label="Ngày"><input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
      {mine.length > 0 && <section className="schedule-current"><strong>Đang có trong ngày</strong>
        {mine.map(item => <SwipeRow key={item.id} actionLabel="Xoá" onAction={() => remove(item, false)}><div className="schedule-existing">
          <div><b>{availabilityOptions.find(option => option.type === item.status)?.label ?? 'Lịch cá nhân'}</b>
            <small>{item.start} – {item.end}{item.note ? ` · ${item.note}` : ''}</small></div>
          <button type="button" aria-label="Xóa khung giờ" disabled={busy} onClick={() => remove(item)}><Trash2 size={17}/></button>
        </div></SwipeRow>)}
      </section>}
      <div><label className="field-label">Bạn muốn đánh dấu khoảng này là</label><div className="option-grid availability-options">
        {availabilityOptions.map(option => <button key={option.type} type="button" className={`${option.color} ${option.type === status ? 'active' : ''}`} onClick={() => setStatus(option.type)}>{option.label}</button>)}
      </div></div>
      <div className="two-cols">
        <Field label="Từ"><input type="time" value={start} onChange={e => setStart(e.target.value)}/></Field>
        <Field label="Đến"><input type="time" value={end} onChange={e => setEnd(e.target.value)}/></Field>
      </div>
      <Field label="Ghi chú (tuỳ chọn)"><textarea rows={3} value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Có thể đi ăn, cần yên tĩnh…"/></Field>
      <FrequencyButton initialDay={weekdayIndex(date)} onPick={days => void save(days)}
        hint={`Tạo khung giờ cho ${REPEAT_HORIZON_DAYS / 7} tuần tới kể từ ngày đã chọn.`}/>
    </div>
    <button className="primary-button sticky-action" disabled={busy} onClick={() => void save()}>{busy ? 'Đang xử lý…' : 'Thêm khung giờ'}</button>
  </Page>
}

type Sync = CommonProps['sync']
type Update = CommonProps['updateState']
// Shared by the forms and the week calendar's swipe-to-delete rows.
export function removeWork(state: CommonProps['state'], updateState: Update, sync: Sync, item: WorkSchedule) {
  const coupleId = state.id
  updateState(draft => { draft.workSchedules = draft.workSchedules.filter(x => x.id !== item.id) })
  sync(() => deleteRemoteWork(coupleId, item.id), 'Không thể xóa lịch làm việc.')
}
export function removeAvailability(state: CommonProps['state'], updateState: Update, sync: Sync, item: AvailabilityBlock) {
  const coupleId = state.id
  updateState(draft => { draft.availability = draft.availability.filter(x => x.id !== item.id) })
  sync(() => deleteRemoteAvailability(coupleId, item.id), 'Không thể xóa khung giờ.')
}
