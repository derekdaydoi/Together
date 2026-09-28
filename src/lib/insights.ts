import type { AvailabilityBlock, CoupleState, WorkSchedule } from '../types'
import { dateAtNoon } from './dates'

type Interval = { start: number; end: number }
const MIN_MEET_MINUTES = 45
const toMin = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m }
const toTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
const usable = (block: AvailabilityBlock) => block.status === 'available' || block.status === 'want_together'

export function workOccursOn(schedule: WorkSchedule, date: string): boolean {
  return schedule.date === date || Boolean(schedule.repeatsWeekly && date >= schedule.date &&
    dateAtNoon(schedule.date).getDay() === dateAtNoon(date).getDay())
}

export function workOnDate(state: CoupleState, userId: string, date: string): WorkSchedule[] {
  return state.workSchedules.filter(schedule => schedule.userId === userId && workOccursOn(schedule, date))
}

function subtract(source: Interval, occupied: Interval[]): Interval[] {
  return occupied.reduce<Interval[]>((remaining, busy) => remaining.flatMap(slot => {
    if (busy.end <= slot.start || busy.start >= slot.end) return [slot]
    const parts: Interval[] = []
    if (busy.start > slot.start) parts.push({ start: slot.start, end: busy.start })
    if (busy.end < slot.end) parts.push({ start: busy.end, end: slot.end })
    return parts
  }), [source])
}

export function overlapSuggestion(state: CoupleState, date: string) {
  // An explicit busy/alone block overrides an overlapping available block.
  const available = (userId: string) => state.availability.filter(x => x.userId === userId && x.date === date && usable(x))
  const mine = available(state.me.id)
  const theirs = available(state.partner.id)
  if (!mine.length || !theirs.length) return null

  const unavailable: Interval[] = [
    ...state.availability.filter(x => x.date === date && !usable(x)).map(x => ({ start: toMin(x.start), end: toMin(x.end) })),
    ...state.workSchedules.filter(x => x.type !== 'off' && workOccursOn(x, date)).map(x => ({ start: toMin(x.start), end: toMin(x.end) })),
    ...state.plans.filter(x => x.date === date && x.status === 'confirmed').map(x => ({ start: toMin(x.start), end: toMin(x.end) })),
  ]

  const overlaps = mine.flatMap(a => theirs.flatMap(b => {
    const slot = { start: Math.max(toMin(a.start), toMin(b.start)), end: Math.min(toMin(a.end), toMin(b.end)) }
    return slot.end > slot.start ? subtract(slot, unavailable) : []
  })).filter(slot => slot.end - slot.start >= MIN_MEET_MINUTES)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)
  if (!overlaps.length) return null

  const best = overlaps[0]
  const mineToday = state.dailyStates.find(x => x.userId === state.me.id && x.date === date)
  const partnerToday = state.dailyStates.find(x => x.userId === state.partner.id && x.date === date)
  // A simple average hides the tired partner. The suggestion respects the lower signal.
  const energy = Math.min(mineToday?.energy ?? 3, partnerToday?.energy ?? 3)
  const closeness = Math.min(mineToday?.closeness ?? 3, partnerToday?.closeness ?? 3)
  let message = 'Hai bạn cùng rảnh. Có thể giữ nhẹ khoảng này cho nhau.'
  if (!mineToday || !partnerToday) message = 'Có lịch trống chung. Cập nhật năng lượng của cả hai trước khi chốt hoạt động.'
  else if (closeness <= 2) message = 'Có thời gian trống chung, nhưng ít nhất một người cần không gian riêng. Chỉ lên kế hoạch nếu cả hai cùng muốn.'
  else if (energy <= 2) message = 'Ít nhất một người đang mệt. Hãy thử một kế hoạch nhẹ, gần nhà hoặc ở nhà.'
  else if (closeness >= 4) message = 'Cả hai đang muốn gần nhau. Đây có thể là một khoảng phù hợp để gặp.'

  return { start: toTime(best.start), end: toTime(best.end), duration: best.end - best.start,
    energy: mineToday && partnerToday ? energy : null,
    closeness: mineToday && partnerToday ? closeness : null, message }
}
