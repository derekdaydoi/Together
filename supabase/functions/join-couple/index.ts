import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, message: 'Bạn cần đăng nhập trước.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ ok: false, message: 'Phiên đăng nhập không hợp lệ.' }, 401)

    const { code } = await req.json()
    const normalized = String(code ?? '').trim().toUpperCase()
    if (normalized.length < 4 || normalized.length > 20) return json({ ok: false, message: 'Mã mời không hợp lệ.' }, 400)

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: couple, error: coupleError } = await admin.from('couples').select('id').eq('invite_code', normalized).maybeSingle()
    if (coupleError) throw coupleError
    if (!couple) return json({ ok: false, message: 'Không tìm thấy couple với mã này.' }, 404)

    const { count, error: countError } = await admin.from('couple_members').select('*', { count: 'exact', head: true }).eq('couple_id', couple.id)
    if (countError) throw countError
    if ((count ?? 0) >= 2) return json({ ok: false, message: 'Couple này đã đủ hai người.' }, 409)

    const { data: existing } = await admin.from('couple_members').select('couple_id').eq('user_id', userData.user.id).maybeSingle()
    if (existing) return json({ ok: false, message: 'Bạn đã thuộc một couple khác.' }, 409)

    const { error: insertError } = await admin.from('couple_members').insert({ couple_id: couple.id, user_id: userData.user.id, role: 'member' })
    if (insertError) throw insertError

    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ ok: false, message: 'Không thể tham gia couple lúc này.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
