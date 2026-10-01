import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { accountFromUser, describeAuthError } from './lib/account'
import { linkGoogleAccount } from './lib/remoteStore'

export function AccountRecoveryCard() {
  const [anonymous, setAnonymous] = useState<boolean | null>(null)
  const [email, setEmail] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.auth.getUser().then(({ data, error: readError }) => {
      if (!alive) return
      if (readError || !data.user) { setError('Không kiểm tra được tài khoản. Hãy thử tải lại.'); return }
      const account = accountFromUser(data.user)
      setAnonymous(account?.isAnonymous ?? null)
      setEmail(account?.email)
    }).catch(() => { if (alive) setError('Không kiểm tra được tài khoản. Hãy thử tải lại.') })
    return () => { alive = false }
  }, [])
  if (!supabase) return null
  const link = async () => {
    if (busy || !anonymous) return
    setBusy(true); setError(null)
    try { await linkGoogleAccount() }
    catch (err) { setError(describeAuthError(err)); setBusy(false) }
  }
  return <section className="settings-card" aria-label="Bảo vệ tài khoản">
    <div style={{ padding: '16px' }}>
      <strong>Bảo vệ tài khoản Together</strong>
      <p className="form-hint">{anonymous === false
        ? `Đã có tài khoản đăng nhập${email ? `: ${email}` : '.'}`
        : 'Liên kết Google để khôi phục lịch và kế hoạch khi đổi hoặc mất điện thoại.'}</p>
      {anonymous && <button type="button" className="secondary-button" disabled={busy} onClick={() => void link()}>
        {busy ? 'Đang kết nối Google…' : 'Liên kết với Google'}
      </button>}
      {error && <p role="alert" className="form-hint">{error}</p>}
    </div>
  </section>
}
