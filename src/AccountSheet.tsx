import { useEffect, useState } from 'react'
import { ChevronRight, Link2Off, Trash2, X } from 'lucide-react'
import type { CommonProps } from './appTypes'
import { Avatar } from './UI'
import { isSupabaseConfigured } from './lib/supabase'
import { resetDemoState } from './lib/demoStore'
import { deleteRemoteCoupleData, deleteRemoteMyData } from './lib/remoteStore'

type Action = 'personal' | 'disconnect'

/** Opens from the header avatar: the two destructive account actions live here. */
export function AccountSheet({ state, updateState, notify, onClose }: Pick<CommonProps, 'state' | 'updateState' | 'notify'> & { onClose: () => void }) {
  const [action, setAction] = useState<Action | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const partner = state.partner.displayName
  const hasCouple = Boolean(state.id)
  const paired = state.partner.id !== 'waiting-partner'
  // Accept "XOA" or "XOÁ" so nobody has to type diacritics on a phone keyboard.
  const confirmed = text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase() === 'XOA'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy && !done) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, done, onClose])

  const back = () => { setAction(null); setText(''); setError('') }

  const run = async () => {
    if (!action || !confirmed || busy) return
    setBusy(true); setError('')
    try {
      if (action === 'personal') {
        if (isSupabaseConfigured) await deleteRemoteMyData()
        const me = state.me.id
        updateState(d => {
          d.dailyStates = d.dailyStates.filter(x => x.userId !== me)
          d.workSchedules = d.workSchedules.filter(x => x.userId !== me)
          d.availability = d.availability.filter(x => x.userId !== me)
          d.checkins = d.checkins.filter(x => x.userId !== me)
        })
        notify('Đã xoá dữ liệu cá nhân của bạn.')
        onClose()
        return
      }
      if (isSupabaseConfigured) await deleteRemoteCoupleData()
      else { resetDemoState(); localStorage.removeItem('together-onboarded') }
      setDone(true)
      window.setTimeout(() => location.reload(), 1400)
    } catch {
      setError('Chưa xoá được. Hãy kiểm tra kết nối rồi thử lại.')
      setBusy(false)
    }
  }

  const copy = action === 'personal'
    ? `Xoá lịch làm việc, lịch rảnh, trạng thái hằng ngày và check-in của riêng bạn. Kế hoạch chung${paired ? ` và dữ liệu của ${partner}` : ''} giữ nguyên, hai bạn vẫn kết nối. Không thể hoàn tác.`
    : paired
      ? `Ngắt kết nối với ${partner}. Toàn bộ dữ liệu chung (lịch, kế hoạch, check-in của cả hai) bị xoá vĩnh viễn và ${partner} cũng bị ngắt ngay lập tức. Muốn dùng lại phải kết nối lại. Hồ sơ cá nhân vẫn được giữ.`
      : 'Xoá không gian chung và toàn bộ dữ liệu trong đó. Hồ sơ cá nhân vẫn được giữ.'

  return <div className="sheet-backdrop" onClick={() => { if (!busy && !done) onClose() }}>
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="account-sheet-title" onClick={e => e.stopPropagation()}>
      <div className="sheet-head">
        <Avatar profile={state.me} size="md"/>
        <div><strong id="account-sheet-title">{state.me.displayName}</strong><small>Tài khoản của bạn</small></div>
        <button type="button" className="icon-button" aria-label="Đóng" disabled={busy || done} onClick={onClose}><X size={18}/></button>
      </div>

      {done ? <p role="status" className="sheet-note">Đã xoá kết nối. Đang tải lại…</p>
        : !hasCouple ? <p className="sheet-note">Bạn chưa có không gian chung nào, nên chưa có gì để xoá.</p>
        : !action ? <div className="sheet-list">
          <button type="button" className="sheet-row" onClick={() => setAction('personal')}>
            <Trash2 size={19} aria-hidden="true"/>
            <div><strong>Xoá dữ liệu cá nhân</strong><small>Chỉ xoá lịch, trạng thái và check-in của bạn</small></div>
            <ChevronRight size={18} aria-hidden="true"/>
          </button>
          <button type="button" className="sheet-row danger" onClick={() => setAction('disconnect')}>
            <Link2Off size={19} aria-hidden="true"/>
            <div><strong>Xoá kết nối</strong><small>{paired ? `Ngắt kết nối với ${partner} và xoá dữ liệu chung` : 'Xoá không gian chung'}</small></div>
            <ChevronRight size={18} aria-hidden="true"/>
          </button>
        </div>
        : <div className="sheet-confirm">
          <strong>{action === 'personal' ? 'Xoá dữ liệu cá nhân?' : 'Xoá kết nối?'}</strong>
          <p>{copy}</p>
          <label htmlFor="account-delete-confirm">Gõ XOA để xác nhận</label>
          <input id="account-delete-confirm" value={text} autoComplete="off" autoCapitalize="characters" onChange={e => setText(e.target.value)}/>
          <div className="sheet-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={back}>Quay lại</button>
            <button type="button" className="danger-button" disabled={!confirmed || busy} onClick={() => void run()}>{busy ? 'Đang xoá…' : action === 'personal' ? 'Xoá dữ liệu của tôi' : 'Xoá kết nối'}</button>
          </div>
          {error && <p role="alert" className="sheet-error">{error}</p>}
        </div>}
    </div>
  </div>
}
