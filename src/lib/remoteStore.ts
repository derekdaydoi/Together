import { supabase } from './supabase'
import type { AvailabilityBlock, CoupleState, DailyState, SharedPlan, WeeklyCheckin, WorkSchedule } from '../types'
import { localTimestamp } from './dates'

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
  // A partial snapshot would otherwise silently masquerade as empty schedules or plans.
  for (const result of [dailyRes, workRes, availabilityRes, plansRes, checkinsRes]) {
    if (result.error) throw result.error
  }

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
    return { id: x.id, title: x.title, date: start.date, start: start.time, end: end.time, type: x.plan_type, status: x.status, location: x.location ?? undefined, note: x.note ?? undefined, createdBy: x.created_by, revision: x.revision }
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

export async function saveRemoteWork(coupleId: string, input: WorkSchedule) {
  const sb = client()
  const { data, error } = await sb.from('work_schedules').insert({ couple_id: coupleId, user_id: input.userId, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), work_type: input.type, note: input.note ?? null, repeats_weekly: Boolean(input.repeatsWeekly) }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function saveRemoteAvailability(coupleId: string, input: AvailabilityBlock) {
  const sb = client()
  const { data, error } = await sb.from('availability_blocks').insert({ couple_id: coupleId, user_id: input.userId, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), status: input.status, note: input.note ?? null }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function deleteOwnRow(table: 'work_schedules' | 'availability_blocks', coupleId: string, rowId: string) {
  const sb = client()
  const { data: userData, error: userError } = await sb.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Chưa đăng nhập.')
  const { data, error } = await sb.from(table).delete()
    .eq('id', rowId).eq('couple_id', coupleId).eq('user_id', userData.user.id).select('id').single()
  if (error) throw error
  return data.id as string
}

export const deleteRemoteWork = (coupleId: string, id: string) => deleteOwnRow('work_schedules', coupleId, id)
export const deleteRemoteAvailability = (coupleId: string, id: string) => deleteOwnRow('availability_blocks', coupleId, id)

export async function saveRemotePlan(coupleId: string, input: SharedPlan) {
  const sb = client()
  const { data, error } = await sb.from('plans').insert({ couple_id: coupleId, created_by: input.createdBy, title: input.title, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), plan_type: input.type, status: input.status, location: input.location ?? null, note: input.note ?? null }).select('id,revision').single()
  if (error) throw error
  return { id: data.id as string, revision: data.revision as number }
}

export async function updateRemotePlan(coupleId: string, input: SharedPlan) {
  const sb = client()
  const { data, error } = await sb.from('plans').update({
    title: input.title, starts_at: localTimestamp(input.date, input.start),
    ends_at: localTimestamp(input.date, input.end), plan_type: input.type, status: input.status,
    location: input.location ?? null, note: input.note ?? null, updated_at: new Date().toISOString(),
  }).eq('couple_id', coupleId).eq('id', input.id)
    .eq('revision', input.revision).select('revision').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Kế hoạch đã thay đổi trên thiết bị khác. Hãy mở lại kế hoạch trước khi sửa.')
  return data.revision as number
}

export async function cancelRemotePlan(coupleId: string, planId: string, expectedRevision: number) {
  const sb = client()
  const { data, error } = await sb.from('plans')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('couple_id', coupleId).eq('id', planId)
    .neq('status', 'cancelled').eq('revision', expectedRevision)
    .select('revision').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Kế hoạch đã thay đổi hoặc đã bị huỷ ở thiết bị khác. Hãy mở lại để xem trạng thái mới.')
  return data.revision as number
}

export async function confirmRemotePlan(coupleId: string, planId: string, expectedRevision: number) {
  const sb = client()
  const { data: userData, error: userError } = await sb.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Chưa đăng nhập.')
  // Optimistic concurrency: only the invited partner can accept a pending proposal.
  const { data, error } = await sb.from('plans')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('couple_id', coupleId).eq('id', planId).eq('status', 'proposed')
    .eq('plan_type', 'hard').neq('created_by', userData.user.id)
    .eq('revision', expectedRevision).select('revision').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Kế hoạch đã thay đổi hoặc không còn chờ xác nhận. Hãy mở lại để xem nội dung mới.')
  return data.revision as number
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
  // The first partner joining must update the owner's screen without a reload.
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'couple_members', filter: `couple_id=eq.${coupleId}` }, onChange)
  // A fresh snapshot after subscribing closes the gap between the initial
  // fetch and the websocket becoming active. Repeat it after reconnects.
  channel.subscribe(status => { if (status === 'SUBSCRIBED') onChange() })
  return () => { sb.removeChannel(channel) }
}
