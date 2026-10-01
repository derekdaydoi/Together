export type AccountInfo = { isAnonymous: boolean; email?: string }
type UserLike = { is_anonymous?: boolean | null; email?: string | null }

// Unknown account type must NOT display as backed-up / protected.
export function accountFromUser(user: UserLike | null | undefined): AccountInfo | null {
  if (!user) return null
  return { isAnonymous: user.is_anonymous !== false, email: user.email || undefined }
}

export function describeAuthError(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string }
  if (e.code === 'identity_already_exists' || /identity.*(already|exists)|already.*linked/i.test(e.message ?? ''))
    return 'Tài khoản Google này đã gắn với một tài khoản khác. Hãy đăng nhập bằng Google trên thiết bị mới để khôi phục.'
  if (e.code === 'manual_linking_disabled' || /manual linking is disabled/i.test(e.message ?? ''))
    return 'Chưa bật Manual Linking trong Supabase Authentication.'
  if (e.code === 'provider_disabled' || /provider is not enabled|unsupported provider/i.test(e.message ?? ''))
    return 'Google Provider chưa được bật trong Supabase Authentication.'
  if (e.code === 'over_request_rate_limit' || /rate limit/i.test(e.message ?? ''))
    return 'Thao tác quá nhanh. Đợi một lát rồi thử lại.'
  if (/network|failed to fetch|offline/i.test(e.message ?? ''))
    return 'Không kết nối được Google. Kiểm tra mạng rồi thử lại.'
  return `Không thể xác thực với Google${e.code ? ` (${e.code})` : ''}. Hãy thử lại.`
}
