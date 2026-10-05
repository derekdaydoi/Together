import { useEffect, useState } from 'react'
import { ChevronRight, Repeat } from 'lucide-react'

// Monday-first, same order as the week grid.
export const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const WEEKDAY_LONG = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật']

export function describeWeekdays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  return sorted.length === 7 ? 'hàng ngày' : `mỗi tuần vào ${sorted.map(day => WEEKDAY_SHORT[day]).join(', ')}`
}

/** A "Tần suất" row. Picking days in the popup closes it and hands the days to the form to save. */
export function FrequencyButton({ onPick, hint, initialDay, disabled }: {
  onPick: (days: number[]) => void
  hint?: string
  initialDay?: number
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="frequency-row" disabled={disabled} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Repeat size={19} aria-hidden="true"/>
      <div><strong>Tần suất</strong><small>Lặp lại hàng ngày hoặc vài ngày mỗi tuần</small></div>
      <ChevronRight size={18} aria-hidden="true"/>
    </button>
    {open && <FrequencyDialog hint={hint} initialDay={initialDay} onClose={() => setOpen(false)} onConfirm={days => { setOpen(false); onPick(days) }}/>}
  </>
}

function FrequencyDialog({ hint, initialDay, onClose, onConfirm }: {
  hint?: string
  initialDay?: number
  onClose: () => void
  onConfirm: (days: number[]) => void
}) {
  const [days, setDays] = useState<number[]>(initialDay === undefined ? [] : [initialDay])
  const toggle = (day: number) => setDays(current => current.includes(day) ? current.filter(x => x !== day) : [...current, day])
  const everyDay = days.length === 7

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return <div className="sheet-backdrop center" onClick={onClose}>
    <div className="sheet freq-dialog" role="dialog" aria-modal="true" aria-labelledby="freq-title" onClick={event => event.stopPropagation()}>
      <strong id="freq-title">Tần suất lặp lại</strong>
      <p className="freq-sub">Chọn các ngày trong tuần.</p>
      <div className="freq-days" role="group" aria-label="Các ngày trong tuần">
        {WEEKDAY_SHORT.map((label, day) => <button key={label} type="button" aria-pressed={days.includes(day)} aria-label={WEEKDAY_LONG[day]}
          className={days.includes(day) ? 'on' : ''} onClick={() => toggle(day)}>{label}</button>)}
      </div>
      <button type="button" className="text-button freq-all" onClick={() => setDays(everyDay ? [] : [0, 1, 2, 3, 4, 5, 6])}>{everyDay ? 'Bỏ chọn tất cả' : 'Hàng ngày (chọn cả 7 ngày)'}</button>
      <p className="freq-summary" role="status">{days.length ? `Lặp ${describeWeekdays(days)}.` : 'Chưa chọn ngày nào.'}</p>
      {hint && <p className="freq-hint">{hint}</p>}
      <div className="sheet-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Huỷ</button>
        <button type="button" className="primary-button" disabled={!days.length} onClick={() => onConfirm(days)}>Lưu vào lịch</button>
      </div>
    </div>
  </div>
}
