import type { CoupleState, DailyState, WorkSchedule, AvailabilityBlock, SharedPlan, WeeklyCheckin } from '../types'

const KEY = 'together-demo-state-v1'

const today = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const monday = (() => {
  const d = new Date(today)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return iso(d)
})()

const seed: CoupleState = {
  id: 'demo-couple',
  name: 'Chúng mình',
  inviteCode: 'TOGETHER2',
  me: { id: 'me', displayName: 'Bạn' },
  partner: { id: 'partner', displayName: 'Người ấy' },
  dailyStates: [
    { userId: 'me', date: iso(today), energy: 3, closeness: 4, note: 'Hơi mệt nhưng muốn gặp nhau.' },
    { userId: 'partner', date: iso(today), energy: 4, closeness: 4, note: 'Ngày ổn, tối muốn ở bên nhau.' },
  ],
  workSchedules: [
    { id: 'w1', userId: 'me', date: iso(today), start: '09:00', end: '18:00', type: 'office', note: 'Văn phòng' },
    { id: 'w2', userId: 'partner', date: iso(today), start: '09:00', end: '16:30', type: 'remote', note: 'Remote' },
    { id: 'w3', userId: 'me', date: plusDays(1), start: '09:00', end: '18:00', type: 'office' },
    { id: 'w4', userId: 'partner', date: plusDays(1), start: '10:00', end: '17:00', type: 'office' },
    { id: 'w5', userId: 'me', date: plusDays(2), start: '09:00', end: '17:00', type: 'remote' },
  ],
  availability: [
    { id: 'a1', userId: 'me', date: iso(today), start: '19:00', end: '22:00', status: 'want_together' },
    { id: 'a2', userId: 'partner', date: iso(today), start: '18:30', end: '22:30', status: 'available' },
    { id: 'a3', userId: 'me', date: plusDays(2), start: '19:00', end: '21:00', status: 'available' },
    { id: 'a4', userId: 'partner', date: plusDays(2), start: '18:00', end: '21:30', status: 'want_together' },
    { id: 'a5', userId: 'me', date: plusDays(4), start: '18:00', end: '23:00', status: 'available' },
    { id: 'a6', userId: 'partner', date: plusDays(4), start: '19:00', end: '23:00', status: 'available' },
  ],
  plans: [
    { id: 'p1', title: 'Đi xem phim', date: plusDays(4), start: '19:30', end: '22:00', type: 'hard', status: 'confirmed', location: 'Rạp gần nhà', note: 'Chọn phim trước tối thứ Sáu nhé.', createdBy: 'me' },
  ],
  checkins: [
    { userId: 'partner', weekStart: monday, feeling: 2, note: 'Tuần này vừa đủ.' },
  ],
}

export function loadDemoState(): CoupleState {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    // Ignore malformed demo cache.
  }
  localStorage.setItem(KEY, JSON.stringify(seed))
  return structuredClone(seed)
}

export function saveDemoState(state: CoupleState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function resetDemoState() {
  localStorage.removeItem(KEY)
}

export function upsertDailyState(state: CoupleState, next: DailyState) {
  const i = state.dailyStates.findIndex((x) => x.userId === next.userId && x.date === next.date)
  if (i >= 0) state.dailyStates[i] = next
  else state.dailyStates.push(next)
}

export function addWork(state: CoupleState, next: WorkSchedule) {
  state.workSchedules.push(next)
}

export function addAvailability(state: CoupleState, next: AvailabilityBlock) {
  state.availability.push(next)
}

export function addPlan(state: CoupleState, next: SharedPlan) {
  state.plans.unshift(next)
}

export function upsertCheckin(state: CoupleState, next: WeeklyCheckin) {
  const i = state.checkins.findIndex((x) => x.userId === next.userId && x.weekStart === next.weekStart)
  if (i >= 0) state.checkins[i] = next
  else state.checkins.push(next)
}
