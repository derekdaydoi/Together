import { useState } from 'react'
import { ChevronRight, Clock, Heart, MapPin, Plus } from 'lucide-react'
import type { CommonProps } from './appTypes'
import type { SharedPlan } from './types'
import { AppHeader, Avatar, Page } from './UI'

export function Plans({ state, open, onSelect }: CommonProps & { onSelect: (plan: SharedPlan) => void }) {
  const [filter, setFilter] = useState<'upcoming' | 'history'>('upcoming')
  const now = new Date()
  const history = (plan: SharedPlan) => plan.status === 'cancelled' || new Date(`${plan.date}T${plan.end}:00`) < now
  const visible = state.plans.filter(plan => filter === 'history' ? history(plan) : !history(plan))
    .sort((a, b) => {
      const result = `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)
      return filter === 'history' ? -result : result
    })

  return <Page className="plans-page with-nav">
    <AppHeader state={state}/>
    <div className="page-heading-row"><div>
      <span className="eyebrow">Những điều đã chọn cùng nhau</span>
      <h1>Kế hoạch.</h1><p>Kế hoạch mềm có thể thay đổi. Chốt thời gian khi hai người thống nhất.</p>
    </div><button className="icon-button" aria-label="Tạo kế hoạch" onClick={() => open('plan', 'plans')}><Plus size={22}/></button></div>
    <div className="segmented">
      <button className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')}>Sắp tới</button>
      <button className={filter === 'history' ? 'active' : ''} onClick={() => setFilter('history')}>Đã qua / Đã huỷ</button>
    </div>
    {visible.length ? <div className="plan-list">{visible.map(plan => <button key={plan.id} className="plan-card" onClick={() => onSelect(plan)}>
      <div className={`plan-date ${plan.type}`}><small>{new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(new Date(`${plan.date}T12:00`))}</small><strong>{new Date(`${plan.date}T12:00`).getDate()}</strong></div>
      <div className="plan-main"><div className="plan-title-row"><strong>{plan.title}</strong>
        <span className={`status-chip ${plan.type}`}>{plan.status === 'cancelled' ? 'Đã huỷ' : plan.type === 'soft' ? 'Kế hoạch mềm' : plan.status === 'proposed' ? 'Chờ xác nhận' : 'Đã xác nhận'}</span>
      </div><span><Clock size={14}/> {plan.start} – {plan.end}</span>
        {plan.location && <span><MapPin size={14}/> {plan.location}</span>}
        <div className="mini-people"><Avatar profile={state.me} size="sm"/><Avatar profile={state.partner} size="sm"/><small>Cả hai</small></div>
      </div><ChevronRight size={19}/>
    </button>)}</div> : <div className="empty-plans">{filter === 'history' ? 'Chưa có kế hoạch nào trong lịch sử.' : 'Chưa có kế hoạch sắp tới.'}
      {filter === 'upcoming' && <div><button className="secondary-button" onClick={() => open('plan', 'plans')}>Cùng chọn một hoạt động</button></div>}
    </div>}
    <div className="plans-philosophy"><Heart size={20}/><div><strong>Không biến tình yêu thành KPI.</strong>
      <p>Together chỉ giúp hai người giữ chỗ cho nhau. Không chấm điểm mối quan hệ.</p>
    </div></div>
  </Page>
}
