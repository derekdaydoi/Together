import type { CoupleState } from './types'
export type View = 'onboarding'|'profile'|'connect'|'today'|'week'|'plans'|'us'|'daily'|'work'|'availability'|'plan'|'plan-detail'|'checkin'
export type Tone = 'normal'|'success'
export type CommonProps = {
  state: CoupleState
  updateState: (fn: (draft: CoupleState) => void) => void
  open: (next: View, from?: View) => void
  notify: (message: string, tone?: Tone) => void
}
