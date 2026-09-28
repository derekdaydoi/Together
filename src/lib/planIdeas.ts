import type { CoupleState } from '../types'
import { localISODate } from './dates'

export type PlanIdea = { title: string; location: string; note: string }

const quiet: PlanIdea[] = [
  { title: 'Tối nhẹ ở nhà', location: 'Ở nhà', note: 'Ăn món đơn giản, mỗi người có quyền nghỉ sớm.' },
  { title: 'Ăn tối gần nhà', location: 'Gần nhà', note: 'Chọn quán quen, di chuyển ngắn và không ép lịch dài.' },
  { title: 'Trà và trò chuyện', location: 'Quán yên tĩnh gần nhà', note: 'Gặp ngắn, có thể đổi sang mang về nếu mệt.' },
  { title: 'Xem phim cùng nhau', location: 'Ở nhà', note: 'Một buổi tối ít di chuyển và linh hoạt.' },
]

const active: PlanIdea[] = [
  { title: 'Cafe workdate', location: 'Quán cà phê yên tĩnh', note: 'Làm việc riêng cạnh nhau, có thời gian nghỉ giữa giờ.' },
  { title: 'Ăn tối cùng nhau', location: 'Quán cả hai thích', note: 'Mỗi người đề xuất một món rồi cùng chọn.' },
  { title: 'Đi dạo & uống nước', location: 'Gần nhà', note: 'Chọn cung đường và đồ uống phù hợp với cả hai.' },
  { title: 'Một buổi hẹn mới', location: 'Cùng lựa chọn', note: 'Mỗi người đưa một lựa chọn trước khi chốt.' },
]

export function planIdeas(state: CoupleState, date: string): { hint: string; ideas: PlanIdea[] } {
  // Daily signals are intentionally not projected into future days.
  const me = state.dailyStates.find(x => x.userId === state.me.id && x.date === date)
  const partner = state.dailyStates.find(x => x.userId === state.partner.id && x.date === date)
  if (date !== localISODate() || !me || !partner) {
    return { hint: 'Chưa có đủ trạng thái cho ngày này. Đây là các ý tưởng tham khảo.', ideas: active }
  }
  if (Math.min(me.closeness, partner.closeness) <= 2) {
    return {
      hint: 'Ít nhất một người muốn có không gian riêng. Hãy hỏi nhau trước khi đặt lịch.',
      ideas: quiet,
    }
  }
  if (Math.min(me.energy, partner.energy) <= 2) {
    return { hint: 'Ưu tiên năng lượng của người đang mệt: gợi ý ngắn, nhẹ và dễ đổi lịch.', ideas: quiet }
  }
  return { hint: 'Cả hai có thể cùng chọn. Chạm vào một ý tưởng để điền nhanh kế hoạch.', ideas: active }
}
