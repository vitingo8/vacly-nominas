/** Protocolo postMessage entre vacly-app (padre) y vacly-nominas (iframe). */

export const VACLY_ADMIN_SESSION_MSG = 'VACLY_ADMIN_SESSION' as const
export const VACLY_SUPABASE_ACCESS_MSG = 'VACLY_SUPABASE_ACCESS' as const
export const VACLY_REQUEST_ADMIN_SESSION_MSG = 'VACLY_REQUEST_ADMIN_SESSION' as const

export type VaclyAdminSessionMessage = {
  type: typeof VACLY_ADMIN_SESSION_MSG
  token: string
}

export type VaclySupabaseAccessMessage = {
  type: typeof VACLY_SUPABASE_ACCESS_MSG
  accessToken: string
}

export type VaclyRequestAdminSessionMessage = {
  type: typeof VACLY_REQUEST_ADMIN_SESSION_MSG
  companyId: string
}

const DEFAULT_TRUSTED_ORIGINS = [
  'https://www.vacly.es',
  'https://app.vacly.es',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

/** Orígenes de vacly-app autorizados a enviar tokens al iframe de nominas. */
export function isTrustedVaclyAppOrigin(origin: string): boolean {
  if (!origin) return false
  const extra = process.env.NEXT_PUBLIC_VACLY_APP_URL?.trim()
  const allowed = extra ? [...DEFAULT_TRUSTED_ORIGINS, extra.replace(/\/$/, '')] : DEFAULT_TRUSTED_ORIGINS
  return allowed.some((o) => origin === o)
}

export function isEmbeddedAdminContext(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('embedded') === '1' || window.parent !== window
}
