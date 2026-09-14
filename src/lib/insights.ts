import type { AvailabilityBlock, CoupleState } from '../types'

const toMin = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m }
const toTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

function usable(block: AvailabilityBlock) { return block.status === 'available' || block.status === 'want_together' }

export function overlapSuggestion(state: CoupleState, date: string) {
  const mine = state.availability.filter((x) => x.userId === state.me.id && x.date === date && usable(x))
  const theirs = state.availability.filter((x) => x.userId === state.partner.id && x.date === date && usable(x))
  const overlaps = mine.flatMap((a) => theirs.map((b) => ({ start: Math.max(toMin(a.start), toMin(b.start)), end: Math.min(toMin(a.end), toMin(b.end)) }))).filter((x) => x.end - x.start >= 45).sort((a, b) => (b.end - b.start) - (a.end - a.start))
  if (!overlaps.length) return null
  const best = overlaps[0]
  const myDaily = state.dailyStates.find((x) => x.userId === state.me.id && x.date === date)
  const theirDaily = state.dailyStates.find((x) => x.userId === state.partner.id && x.date === date)
  const energy = Math.round(((myDaily?.energy ?? 3) + (theirDaily?.energy ?? 3)) / 2)
  const closeness = Math.round(((myDaily?.closeness ?? 3) + (theirDaily?.closeness ?? 3)) / 2)
  let message = 'Hai bạn cùng rảnh. Có thể giữ nhẹ khoảng này cho nhau.'
  if (closeness >= 4 && energy <= 2) message = 'Cả hai đều muốn gần nhau nhưng năng lượng thấp — hợp với một plan nhẹ, ở nhà hoặc ăn tối gần.'
  else if (closeness >= 4) message = 'Closeness của cả hai đang cao — đây là một khoảng đẹp để dành thời gian thật sự cho nhau.'
  else if (energy <= 2) message = 'Hai bạn cùng rảnh nhưng năng lượng thấp. Soft plan sẽ hợp hơn một lịch cố định dài.'
  return { start: toTime(best.start), end: toTime(best.end), duration: best.end - best.start, energy, closeness, message }
}
