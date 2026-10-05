import { supabase } from './supabase'
import type { AvailabilityBlock, CoupleState, DailyState, SharedPlan, WeeklyCheckin, WorkSchedule, ZodiacKey } from '../types'
import { localTimestamp } from './dates'

const client = () => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.')
  return supabase
}

export async function ensureRemoteProfile(displayName = 'Bạn', expectedUserId?: string) {
  const sb = client()
  const { data: userData, error: userError } = await sb.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Chưa đăng nhập.')
  const user = userData.user
  // Verify identity before the bootstrap INSERT, which could otherwise save
  // the previous account's display name in the newly signed-in user's profile.
  if (expectedUserId && user.id !== expectedUserId) throw new Error('Tài khoản đã thay đổi. Hãy tải lại hồ sơ.')
  const { data } = await sb.from('profiles').select('id,display_name,avatar_path,avatar_key').eq('id', user.id).maybeSingle()
  if (!data) {
    const { error } = await sb.from('profiles').insert({ id: user.id, display_name: displayName })
    if (error) throw error
  }
  return user
}

export async function saveRemoteProfile(displayName: string, avatarPath?: string | null, expectedUserId?: string, zodiacKey?: ZodiacKey) {
  const sb = client()
  const user = await ensureRemoteProfile(displayName, expectedUserId)
  const payload: Record<string, unknown> = { id: user.id, display_name: displayName, updated_at: new Date().toISOString() }
  if (avatarPath !== undefined) payload.avatar_path = avatarPath
  if (zodiacKey !== undefined) payload.avatar_key = zodiacKey
  const { error } = await sb.from('profiles').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

// Signed URLs are valid for a day; reuse them instead of a storage round trip
// on every refresh.
const avatarCache = new Map<string, { url: string; expires: number }>()
async function signedAvatar(path?: string | null) {
  if (!path) return undefined
  const cached = avatarCache.get(path)
  if (cached && cached.expires > Date.now()) return cached.url
  const sb = client()
  const { data } = await sb.storage.from('avatars').createSignedUrl(path, 86400)
  if (data?.signedUrl) avatarCache.set(path, { url: data.signedUrl, expires: Date.now() + 82800_000 })
  return data?.signedUrl
}

/** Local session read: no network. RLS still authorizes every query server-side. */
export async function currentUserId() {
  const { data, error } = await client().auth.getSession()
  const id = data.session?.user.id
  if (error || !id) throw error ?? new Error('Chưa đăng nhập.')
  return id
}

/** UUID generated on the device so inserts never wait for the server to assign an id. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function localParts(value: string) {
  const d = new Date(value)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

const daysAgoISO = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString() }

// One network round trip: RLS already limits every table to the caller's own
// couple (a user can belong to exactly one), so all reads run in parallel
// instead of profile -> membership -> data -> profiles -> avatars in sequence.
export async function loadRemoteState(): Promise<CoupleState | null> {
  const sb = client()
  const userId = await currentUserId()
  const recentDay = daysAgoISO(45).slice(0, 10)
  const [membershipRes, profilesRes, coupleRes, membersRes, dailyRes, workRes, availabilityRes, plansRes, checkinsRes] = await Promise.all([
    sb.from('couple_members').select('couple_id').eq('user_id', userId).maybeSingle(),
    sb.from('profiles').select('id,display_name,avatar_path,avatar_key'),
    sb.from('couples').select('id,name,invite_code,invite_expires_at'),
    sb.from('couple_members').select('couple_id,user_id'),
    sb.from('daily_states').select('*').gte('state_date', recentDay),
    sb.from('work_schedules').select('*'),
    sb.from('availability_blocks').select('*').gte('starts_at', daysAgoISO(45)),
    sb.from('plans').select('*').order('starts_at', { ascending: true }),
    sb.from('weekly_checkins').select('*').gte('week_start', recentDay),
  ])
  // A partial snapshot would otherwise silently masquerade as empty schedules or plans.
  for (const result of [membershipRes, profilesRes, coupleRes, membersRes, dailyRes, workRes, availabilityRes, plansRes, checkinsRes]) {
    if (result.error) throw result.error
  }
  let profileRows = (profilesRes.data ?? []) as any[]
  if (!profileRows.some(p => p.id === userId)) {
    await ensureRemoteProfile()
    profileRows = [...profileRows, { id: userId, display_name: 'Bạn', avatar_path: null, avatar_key: null }]
  }
  if (!membershipRes.data) return null

  const coupleId = membershipRes.data.couple_id as string
  const inCouple = (rows: any[] | null) => (rows ?? []).filter(row => row.couple_id === coupleId)
  const couple = (coupleRes.data ?? []).find((c: any) => c.id === coupleId)
  if (!couple) throw new Error('Không đọc được không gian chung.')
  const memberIds = inCouple(membersRes.data).map((m: any) => m.user_id as string)
  const meRow = profileRows.find(p => p.id === userId)
  const partnerRow = profileRows.find(p => p.id !== userId && memberIds.includes(p.id)) ?? { id: 'waiting-partner', display_name: 'Người ấy', avatar_path: null, avatar_key: null }
  const [meAvatar, partnerAvatar] = await Promise.all([signedAvatar(meRow.avatar_path), signedAvatar(partnerRow.avatar_path)])
  const dailyRows = inCouple(dailyRes.data), workRows = inCouple(workRes.data)
  const availabilityRows = inCouple(availabilityRes.data), planRows = inCouple(plansRes.data)
  const checkinRows = inCouple(checkinsRes.data)

  const dailyStates: DailyState[] = dailyRows.map((x: any) => ({
    userId: x.user_id,
    date: x.state_date,
    energy: x.energy_level,
    closeness: x.closeness_need,
    note: x.note ?? undefined,
  }))
  const workSchedules: WorkSchedule[] = workRows.map((x: any) => {
    const start = localParts(x.starts_at); const end = localParts(x.ends_at)
    return { id: x.id, userId: x.user_id, date: start.date, start: start.time, end: end.time, type: x.work_type, note: x.note ?? undefined, repeatsWeekly: x.repeats_weekly }
  })
  const availability: AvailabilityBlock[] = availabilityRows.map((x: any) => {
    const start = localParts(x.starts_at); const end = localParts(x.ends_at)
    return { id: x.id, userId: x.user_id, date: start.date, start: start.time, end: end.time, status: x.status, note: x.note ?? undefined }
  })
  const plans: SharedPlan[] = planRows.map((x: any) => {
    const start = localParts(x.starts_at); const end = localParts(x.ends_at)
    return { id: x.id, title: x.title, date: start.date, start: start.time, end: end.time, type: x.plan_type, status: x.status, location: x.location ?? undefined, note: x.note ?? undefined, createdBy: x.created_by, revision: x.revision }
  })
  const checkins: WeeklyCheckin[] = checkinRows.map((x: any) => ({
    userId: x.user_id,
    weekStart: x.week_start,
    feeling: x.feeling,
    note: x.note ?? undefined,
  }))

  return {
    id: couple.id,
    name: couple.name,
    inviteCode: couple.invite_code,
    inviteExpiresAt: couple.invite_expires_at,
    me: { id: meRow.id, displayName: meRow.display_name, avatarPath: meRow.avatar_path ?? undefined, avatarUrl: meAvatar, zodiacKey: (meRow.avatar_key as ZodiacKey | null) ?? undefined },
    partner: { id: partnerRow.id, displayName: partnerRow.display_name, avatarPath: partnerRow.avatar_path ?? undefined, avatarUrl: partnerAvatar, zodiacKey: (partnerRow.avatar_key as ZodiacKey | null) ?? undefined },
    dailyStates,
    workSchedules,
    availability,
    plans,
    checkins,
  }
}

export async function createRemoteCouple(expectedUserId?: string) {
  const sb = client()
  const user = await ensureRemoteProfile('Bạn', expectedUserId)
  const { data, error } = await sb.from('couples').insert({ name: 'Chúng mình', created_by: user.id })
    .select('id,invite_code,invite_expires_at').single()
  if (error) throw error
  return {
    id: data.id as string,
    code: data.invite_code as string,
    expiresAt: data.invite_expires_at as string,
  }
}

export async function joinRemoteCouple(code: string, expectedUserId?: string) {
  const sb = client()
  if (expectedUserId) {
    const { data, error } = await sb.auth.getUser()
    if (error || data.user?.id !== expectedUserId) throw new Error('Tài khoản đã thay đổi. Hãy tải lại trước khi tham gia couple.')
  }
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
  const { data, error } = await sb.from('work_schedules').insert({ id: input.id, couple_id: coupleId, user_id: input.userId, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), work_type: input.type, note: input.note || null, repeats_weekly: Boolean(input.repeatsWeekly) }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function rotateRemoteInvite() {
  const sb = client()
  const { data, error } = await sb.rpc('rotate_couple_invite')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.invite_code) throw new Error('Không lấy được mã mời mới.')
  return { code: row.invite_code as string, expiresAt: row.invite_expires_at as string }
}

// Erases only the caller's own schedule, status and check-in entries. Shared
// plans, the partner's data and the connection stay.
export async function deleteRemoteMyData() {
  const sb = client()
  const { error } = await sb.rpc('delete_my_couple_data')
  if (error) throw error
}

// Disconnects the couple: erases the whole shared space for both people (server
// cascades from the couple row). Profiles stay so either person can start over.
export async function deleteRemoteCoupleData() {
  const sb = client()
  const { error } = await sb.rpc('delete_couple_data')
  if (error) throw error
}

// A signed-in user without a couple still needs their own remote profile on
// the setup screen. Never reuse another user's state or the demo seed.
export async function loadRemoteProfileState(): Promise<CoupleState> {
  const sb = client()
  const user = await ensureRemoteProfile()
  const { data: profile, error } = await sb.from('profiles')
    .select('id,display_name,avatar_path,avatar_key').eq('id', user.id).single()
  if (error) throw error
  return {
    id: '', name: 'Chúng mình', inviteCode: '',
    me: { id: user.id, displayName: profile.display_name, avatarPath: profile.avatar_path ?? undefined,
      avatarUrl: await signedAvatar(profile.avatar_path), zodiacKey: (profile.avatar_key as ZodiacKey | null) ?? undefined },
    partner: { id: 'waiting-partner', displayName: 'Người ấy' },
    dailyStates: [], workSchedules: [], availability: [], plans: [], checkins: [],
  }
}

export async function saveRemoteAvailability(coupleId: string, input: AvailabilityBlock) {
  const sb = client()
  const { data, error } = await sb.from('availability_blocks').insert({ id: input.id, couple_id: coupleId, user_id: input.userId, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), status: input.status, note: input.note ?? null }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function deleteOwnRow(table: 'work_schedules' | 'availability_blocks', coupleId: string, rowId: string) {
  const sb = client()
  const userId = await currentUserId()
  const { data, error } = await sb.from(table).delete()
    .eq('id', rowId).eq('couple_id', coupleId).eq('user_id', userId).select('id').single()
  if (error) throw error
  return data.id as string
}

export const deleteRemoteWork = (coupleId: string, id: string) => deleteOwnRow('work_schedules', coupleId, id)
export const deleteRemoteAvailability = (coupleId: string, id: string) => deleteOwnRow('availability_blocks', coupleId, id)

export async function saveRemotePlan(coupleId: string, input: SharedPlan) {
  const sb = client()
  const { data, error } = await sb.from('plans').insert({ id: input.id, couple_id: coupleId, created_by: input.createdBy, title: input.title, starts_at: localTimestamp(input.date, input.start), ends_at: localTimestamp(input.date, input.end), plan_type: input.type, status: input.status, location: input.location ?? null, note: input.note ?? null }).select('id,revision').single()
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
  const userId = await currentUserId()
  // Optimistic concurrency: only the invited partner can accept a pending proposal.
  const { data, error } = await sb.from('plans')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('couple_id', coupleId).eq('id', planId).eq('status', 'proposed')
    .eq('plan_type', 'hard').neq('created_by', userId)
    .eq('revision', expectedRevision).select('revision').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Kế hoạch đã thay đổi hoặc không còn chờ xác nhận. Hãy mở lại để xem nội dung mới.')
  return data.revision as number
}

export async function saveRemoteCheckin(coupleId: string, input: WeeklyCheckin) {
  const sb = client()
  const { error } = await sb.from('weekly_checkins').upsert({ couple_id: coupleId, user_id: input.userId, week_start: input.weekStart, feeling: input.feeling, note: input.note ?? null, updated_at: new Date().toISOString() }, { onConflict: 'couple_id,user_id,week_start' })
  if (error?.code === '42501') throw new Error('Check-in đã khóa sau khi cả hai cùng trả lời.')
  if (error) throw error
}

/** Redirect back to the GitHub Pages subpath (not site root). */
const oauthReturnUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString()

export async function signInWithGoogle() {
  const { data, error } = await client().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: oauthReturnUrl() } })
  if (error) throw error
  if (!data.url) throw new Error('Google không trả về địa chỉ đăng nhập.')
}

export async function linkGoogleAccount() {
  const sb = client()
  const { data: { user }, error: userError } = await sb.auth.getUser()
  if (userError || !user || user.is_anonymous !== true)
    throw new Error('Chỉ tài khoản ẩn danh đang đăng nhập mới có thể liên kết Google.')
  const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: oauthReturnUrl() } })
  if (error) throw error
}

export function subscribeRemote(coupleId: string, onRefresh: () => void) {
  const sb = client()
  // One user action can emit several row events; coalesce them into one read.
  let timer: ReturnType<typeof setTimeout> | undefined
  const onChange = () => { clearTimeout(timer); timer = setTimeout(onRefresh, 120) }
  const channel = sb.channel(`together-${coupleId}`)
  ;['daily_states', 'work_schedules', 'availability_blocks', 'plans', 'weekly_checkins'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` }, onChange)
  })
  // The first partner joining must update the owner's screen without a reload.
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'couple_members', filter: `couple_id=eq.${coupleId}` }, onChange)
  // A fresh snapshot after subscribing closes the gap between the initial
  // fetch and the websocket becoming active. Repeat it after reconnects.
  channel.subscribe(status => { if (status === 'SUBSCRIBED') onChange() })
  return () => { clearTimeout(timer); sb.removeChannel(channel) }
}
