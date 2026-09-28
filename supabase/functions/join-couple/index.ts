import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

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

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ ok: false, message: 'Phiên đăng nhập không hợp lệ.' }, 401)

    const { code } = await req.json()
    const normalized = String(code ?? '').trim().toUpperCase()
    if (!/^[A-F0-9]{10,32}$/.test(normalized)) return json({ ok: false, message: 'Mã mời không hợp lệ.' }, 400)

    // PostgreSQL performs all checks, insertion and one-time consumption in
    // a single transaction with a row lock. No service role in this function.
    const { error: redeemError } = await userClient.rpc('redeem_couple_invite', { p_code: normalized })
    if (redeemError) {
      if (['22023', '23505', '28000'].includes(redeemError.code ?? '')) {
        return json({ ok: false, message: 'Mã đã hết hạn, đã được dùng hoặc tài khoản đã kết nối.' }, 409)
      }
      throw redeemError
    }

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
