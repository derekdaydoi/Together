import { supabase } from './supabase'
import type { AvailabilityBlock, CoupleState, DailyState, SharedPlan, WeeklyCheckin, WorkSchedule } from '../types'

const client = () => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.')
  return supabase
}

export async function ensureRemoteProfile(displayName = 'Bạn') {
  const sb = client()
  const { data: userData, error: userError } = await sb.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Chưa đăng nhập.')
  const user = userData.user
  const { data } = await sb.from('profiles').select('id,display_name,avatar_path').eq('id', user.id).maybeSingle()
  if (!data) {
    const { error } = await sb.from('profiles').insert({ id: user.id, display_name: displayName })
    if (error) throw error
  }
  return user
}

export async function saveRemoteProfile(displayName: string, avatarPath?: string) {
  const sb = client()
  const user = await ensureRemoteProfile(displayName)
  const payload: Record<string, unknown> = { id: user.id, display_name: displayName, updated_at: new Date().toISOString() }
  if (avatarPath !== undefined) payload.avatar_path = avatarPath
  const { error } = await sb.from('profiles').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

async function signedAvatar(path?: string | null) {
  if (!path) return undefined
  const sb = client()
  const { data } = await sb.storage.from('avatars').createSignedUrl(path, 3600)
  return data?.signedUrl
}

function localParts(value: string) {
  const d = new Date(value)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

export async function loadRemoteState(): Promise<CoupleState | null> {
  const sb = client()
  const user = await ensureRemoteProfile()
  const { data: profile, error: profileError } = await sb.from('profiles').select('id,display_name,avatar_path').eq('id', user.id).single()
  if (profileError) throw profileError

  const { data: membership, error: membershipError } = await sb.from('couple_members').select('couple_id').eq('user_id', user.id).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) return null

  const coupleId = membership.couple_id as string
  const [coupleRes, membersRes, dailyRes, workRes, availabilityRes, plansRes, checkinsRes] = await Promise.all([
    sb.from('couples').select('id,name,invite_code').eq('id', coupleId).single(),
    sb.from('couple_members').select('user_id').eq('couple_id', coupleId),
    sb.from('daily_states').select('*').eq('couple_id', coupleId),
    sb.from('work_schedules').select('*').eq('couple_id', coupleId),
    sb.from('availability_blocks').select('*').eq('couple_id', coupleId),
    sb.from('plans').select('*').eq('couple_id', coupleId).order('starts_at', { ascending: true }),
    sb.from('weekly_checkins').select('*').eq('couple_id', coupleId),
  ])
  if (coupleRes.error) throw coupleRes.error
  if (membersRes.error) throw membersRes.error

  const memberIds = (membersRes.data ?? []).map((m: any) => m.user_id as string)
  const { data: profiles, error: profilesError } = await sb.from('profiles').select('id,display_name,avatar_path').in('id', memberIds)
  if (profilesError) throw profilesError
  const meRow = profiles?.find((p: any) => p.id === user.id) ?? profile
  const partnerRow = profiles?.find((p: any) => p.id !== user.id) ?? { id: 'waiting-partner', display_name: 'Người ấy', avatar_path: null }
  const [meAvatar, partnerAvatar] = await Promise.all([signedAvatar(meRow.avatar_path), signedAvatar(partnerRow.avatar_path)])

  const dailyStates: DailyState[] = (dailyRes.data ?? []).map((x: any) => ({
    userId: x.user_id,
    date: x.state_date,
    energy: x.energy_level,
    closeness: x.closeness_need,
    note: x.note ?? undefined,
  }))
  const workSchedules: WorkSchedule[] = (workRes.data ?? []).map((x: any) => {
    const start = localParts(x.starts_at); const end = localParts(x.ends_at)
    return { id: x.id, userId: x.user_id, date: start.date, start: start.time, end: end.time, type: x.work_type, note: x.note ?? undefined, repeatsWeekly: x.repeats_weekly }
  })
  const availability: AvailabilityBlock[] = (availabilityRes.data ?? []).map((x: any) => {
    const start = localParts(x.starts_at); const end = localParts(x.ends_at)
    return { id: x.id, userId: x.user_id, date: start.date, start: start.time, end: end.time, status: x.status, note: x.note ?? undefined }
  })
  const plans: SharedPlan[] = (plansRes.data ?? []).map((x: any) => {
    const start = localParts(x.starts_at); const end = localParts(x.ends_at)
    return { id: x.id, title: x.title, date: start.date, start: start.time, end: end.time, type: x.plan_type, status: x.status, location: x.location ?? undefined, note: x.note ?? undefined, createdBy: x.created_by }
  })
  const checkins: WeeklyCheckin[] = (checkinsRes.data ?? []).map((x: any) => ({
    userId: x.user_id,
    weekStart: x.week_start,
    feeling: x.feeling,
    note: x.note ?? undefined,
  }))

  return {
    id: coupleRes.data.id,
    name: coupleRes.data.name,
    inviteCode: coupleRes.data.invite_code,
    me: { id: meRow.id, displayName: meRow.display_name, avatarPath: meRow.avatar_path ?? undefined, avatarUrl: meAvatar },
    partner: { id: partnerRow.id, displayName: partnerRow.display_name, avatarPath: partnerRow.avatar_path ?? undefined, avatarUrl: partnerAvatar },
    dailyStates,
    workSchedules,
    availability,
    plans,
    checkins,
  }
}

export async function createRemoteCouple() {
  const sb = client()
  const user = await ensureRemoteProfile()
  const { data, error } = await sb.from('couples').insert({ name: 'Chúng mình', created_by: user.id }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function joinRemoteCouple(code: string) {
  const sb = client()
  const { data, error } = await sb.functions.invoke('join-couple', { body: { code } })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.message ?? 'Không thể tham gia couple.')
}

export async function saveRemoteDaily(coupleId: string, input: DailyState) {
  const sb = client()
  const { error } = await sb.from('daily_states').upsert({ couple_id: coupleId, user_id: input.userId, state_date: input.date, energy_level: input.energy, closeness_need: input.closeness, note: input.note ?? null, updated_at: new Date().toISOString() }, { onConflict: 'couple_id,user_id,state_date' })
  if (error) throw error
}

const localTimestamp = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString()

export async function saveRemoteWork(coupleId: string, input: WorkSchedule) {
  const sb = client()
  const { error } = await sb.from('work_schedules').insert({ couple_id: coupleId, user_id: input.userId, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), work_type: input.type, note: input.note ?? null, repeats_weekly: Boolean(input.repeatsWeekly) })
  if (error) throw error
}

export async function saveRemoteAvailability(coupleId: string, input: AvailabilityBlock) {
  const sb = client()
  const { error } = await sb.from('availability_blocks').insert({ couple_id: coupleId, user_id: input.userId, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), status: input.status, note: input.note ?? null })
  if (error) throw error
}

export async function saveRemotePlan(coupleId: string, input: SharedPlan) {
  const sb = client()
  const { error } = await sb.from('plans').insert({ couple_id: coupleId, created_by: input.createdBy, title: input.title, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), plan_type: input.type, status: input.status, location: input.location ?? null, note: input.note ?? null })
  if (error) throw error
}

export async function saveRemoteCheckin(coupleId: string, input: WeeklyCheckin) {
  const sb = client()
  const { error } = await sb.from('weekly_checkins').upsert({ couple_id: coupleId, user_id: input.userId, week_start: input.weekStart, feeling: input.feeling, note: input.note ?? null, updated_at: new Date().toISOString() }, { onConflict: 'couple_id,user_id,week_start' })
  if (error) throw error
}

export function subscribeRemote(coupleId: string, onChange: () => void) {
  const sb = client()
  const channel = sb.channel(`together-${coupleId}`)
  ;['daily_states', 'work_schedules', 'availability_blocks', 'plans', 'weekly_checkins'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` }, onChange)
  })
  channel.subscribe()
  return () => { sb.removeChannel(channel) }
}
