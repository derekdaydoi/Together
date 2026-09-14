export type WorkType = 'office' | 'remote' | 'shift' | 'off' | 'other'
export type AvailabilityStatus = 'available' | 'busy' | 'prefer_alone' | 'want_together'
export type PlanType = 'soft' | 'hard'
export type PlanStatus = 'proposed' | 'confirmed' | 'cancelled'

export type Profile = { id: string; displayName: string; avatarUrl?: string; avatarPath?: string }
export type DailyState = { userId: string; date: string; energy: number; closeness: number; note?: string }
export type WorkSchedule = { id: string; userId: string; date: string; start: string; end: string; type: WorkType; note?: string; repeatsWeekly?: boolean }
export type AvailabilityBlock = { id: string; userId: string; date: string; start: string; end: string; status: AvailabilityStatus; note?: string }
export type SharedPlan = { id: string; title: string; date: string; start: string; end: string; type: PlanType; status: PlanStatus; location?: string; note?: string; createdBy: string }
export type WeeklyCheckin = { userId: string; weekStart: string; feeling: 1 | 2 | 3; note?: string }

export type CoupleState = {
  id: string
  name: string
  inviteCode: string
  me: Profile
  partner: Profile
  dailyStates: DailyState[]
  workSchedules: WorkSchedule[]
  availability: AvailabilityBlock[]
  plans: SharedPlan[]
  checkins: WeeklyCheckin[]
}
