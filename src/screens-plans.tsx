import { useEffect, useState } from 'react'
import { CalendarHeart, ChevronRight, Clock, Heart, MapPin, Plus, Trash2, UserRoundCheck, X } from 'lucide-react'
import type { CommonProps } from './appTypes'
import type { AvailabilityBlock, AvailabilityStatus, SharedPlan } from './types'
import { AppHeader, Avatar, Page } from './UI'
import { SwipeRow } from './gestures'
import { planTint } from './lib/planColor'
import { cancelPlan } from './screens-plan'
import { removeAvailability } from './screens-schedule'

const availabilityText: Record<AvailabilityStatus, string> = {
  available: 'Rảnh', busy: 'Bận', prefer_alone: 'Muốn ở một mình', want_together: 'Muốn gặp',
}
const monthOf = (date: string) => new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(new Date(`${date}T12:00`))
const dayOf = (date: string) => new Date(`${date}T12:00`).getDate()

type Item =
  | { key: string; kind: 'plan'; date: string; start: string; end: string; plan: SharedPlan }
  | { key: string; kind: 'availability'; date: string; start: string; end: string; block: AvailabilityBlock }

/** Everything the two of you have lined up lives here: shared plans plus each person's free/busy blocks. */
export function Plans({ state, open, onSelect, updateState, sync, notify }: CommonProps & { onSelect: (plan: SharedPlan) => void }) {
  const [filter, setFilter] = useState<'upcoming' | 'history'>('upcoming')
  const [kind, setKind] = useState<'all' | 'plan' | 'availability'>('all')
  const [adding, setAdding] = useState(false)
  const now = new Date()
  const ended = (item: Item) => new Date(`${item.date}T${item.end}:00`) < now
  const finished = (item: Item) => item.kind === 'plan' ? item.plan.status === 'cancelled' || ended(item) : ended(item)
  const items: Item[] = [
    ...state.plans.map((plan): Item => ({ key: `plan-${plan.id}`, kind: 'plan', date: plan.date, start: plan.start, end: plan.end, plan })),
    ...state.availability.map((block): Item => ({ key: `av-${block.id}`, kind: 'availability', date: block.date, start: block.start, end: block.end, block })),
  ]
  const visible = items
    .filter(item => kind === 'all' || item.kind === kind)
    .filter(item => filter === 'history' ? finished(item) : !finished(item))
    .sort((a, b) => {
      const result = `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)
      return filter === 'history' ? -result : result
    })
  const ownerOf = (userId: string) => userId === state.me.id ? state.me : state.partner

  const planCard = (plan: SharedPlan) => <SwipeRow key={plan.id} actionLabel="Huỷ" disabled={plan.status === 'cancelled' || finished({ key: '', kind: 'plan', date: plan.date, start: plan.start, end: plan.end, plan })}
    onAction={() => { cancelPlan(state, updateState, sync, plan); notify('Đã huỷ kế hoạch cho cả hai.') }}><button className="plan-card" onClick={() => onSelect(plan)}>
    <div className={`plan-date tinted ${plan.type}`} style={planTint(plan.id)}><small>{monthOf(plan.date)}</small><strong>{dayOf(plan.date)}</strong></div>
    <div className="plan-main"><div className="plan-title-row"><strong>{plan.title}</strong>
      <span className={`status-chip ${plan.type}`}>{plan.status === 'cancelled' ? 'Đã huỷ' : plan.type === 'soft' ? 'Kế hoạch mềm' : plan.status === 'proposed' ? 'Chờ xác nhận' : 'Đã xác nhận'}</span>
    </div><span><Clock size={14}/> {plan.start} – {plan.end}</span>
      {plan.location && <span><MapPin size={14}/> {plan.location}</span>}
      <div className="mini-people"><Avatar profile={state.me} size="sm"/><Avatar profile={state.partner} size="sm"/><small>Cả hai</small></div>
    </div><ChevronRight size={19}/>
  </button></SwipeRow>

  const availabilityCard = (block: AvailabilityBlock, past: boolean) => {
    const owner = ownerOf(block.userId), mine = block.userId === state.me.id
    const remove = () => { removeAvailability(state, updateState, sync, block); notify('Đã xóa khung giờ.') }
    const card = <div className="plan-card avail">
      <div className={`plan-date av-${block.status}`}><small>{monthOf(block.date)}</small><strong>{dayOf(block.date)}</strong></div>
      <div className="plan-main"><div className="plan-title-row"><strong>{availabilityText[block.status]}</strong>
        <span className="status-chip owner">{mine ? 'Bạn' : owner.displayName}</span>
      </div><span><Clock size={14}/> {block.start} – {block.end}</span>
        {block.note && <span className="plan-note">{block.note}</span>}
      </div>
      {mine && !past ? <button type="button" className="avail-delete" aria-label="Xóa khung giờ" onClick={remove}><Trash2 size={17}/></button> : <Avatar profile={owner} size="sm"/>}
    </div>
    return mine && !past ? <SwipeRow key={block.id} actionLabel="Xoá" onAction={remove}>{card}</SwipeRow> : <div key={block.id}>{card}</div>
  }

  return <Page className="plans-page with-nav">
    <AppHeader state={state}/>
    <div className="page-heading-row"><div>
      <span className="eyebrow">Những điều đã chọn cùng nhau</span>
      <h1>Kế hoạch.</h1><p>Kế hoạch chung cùng lịch rảnh/bận của hai người, gom về một chỗ.</p>
    </div><button className="icon-button" aria-label="Thêm vào kế hoạch" aria-haspopup="dialog" onClick={() => setAdding(true)}><Plus size={22}/></button></div>
    <div className="segmented">
      <button className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')}>Sắp tới</button>
      <button className={filter === 'history' ? 'active' : ''} onClick={() => setFilter('history')}>Đã qua / Đã huỷ</button>
    </div>
    <div className="segmented three" role="group" aria-label="Lọc theo loại">
      <button className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>Tất cả</button>
      <button className={kind === 'plan' ? 'active' : ''} onClick={() => setKind('plan')}>Kế hoạch</button>
      <button className={kind === 'availability' ? 'active' : ''} onClick={() => setKind('availability')}>Rảnh / bận</button>
    </div>
    {visible.length ? <div className="plan-list">{visible.map(item => item.kind === 'plan' ? planCard(item.plan) : availabilityCard(item.block, finished(item)))}</div>
      : <div className="empty-plans">{filter === 'history' ? 'Chưa có gì trong lịch sử.' : 'Chưa có kế hoạch hay lịch rảnh/bận sắp tới.'}
        {filter === 'upcoming' && <div><button className="secondary-button" onClick={() => setAdding(true)}>Thêm vào kế hoạch</button></div>}
      </div>}
    <div className="plans-philosophy"><Heart size={20}/><div><strong>Không biến tình yêu thành KPI.</strong>
      <p>Together chỉ giúp hai người giữ chỗ cho nhau. Không chấm điểm mối quan hệ.</p>
    </div></div>
    {adding && <AddSheet onClose={() => setAdding(false)} onPick={next => { setAdding(false); open(next, 'plans') }}/>}
  </Page>
}

function AddSheet({ onClose, onPick }: { onClose: () => void; onPick: (view: 'plan' | 'availability' | 'work') => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-sheet-title" onClick={event => event.stopPropagation()}>
      <div className="sheet-head"><div><strong id="add-sheet-title">Thêm vào kế hoạch</strong><small>Chọn thứ bạn muốn đặt vào lịch</small></div>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}><X size={18}/></button></div>
      <div className="sheet-list">
        <button type="button" className="sheet-row" onClick={() => onPick('plan')}><CalendarHeart size={20} aria-hidden="true"/>
          <div><strong>Kế hoạch chung</strong><small>Hẹn hò, ăn tối, đi chơi cùng người ấy</small></div><ChevronRight size={18} aria-hidden="true"/></button>
        <button type="button" className="sheet-row" onClick={() => onPick('availability')}><UserRoundCheck size={20} aria-hidden="true"/>
          <div><strong>Lịch rảnh / bận</strong><small>Cho người ấy biết khi nào bạn rảnh, bận hay muốn gặp</small></div><ChevronRight size={18} aria-hidden="true"/></button>
        <button type="button" className="sheet-row" onClick={() => onPick('work')}><Clock size={20} aria-hidden="true"/>
          <div><strong>Lịch làm việc</strong><small>Ca làm, văn phòng, remote, ngày nghỉ</small></div><ChevronRight size={18} aria-hidden="true"/></button>
      </div>
    </div>
  </div>
}
