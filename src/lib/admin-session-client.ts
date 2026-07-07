'use client'

import { useCallback, useEffect, useState } from 'react'

type SessionCache = { companyId: string; token: string; expiresAt: number }

let sessionCache: SessionCache | null = null

/** Lee el token firmado que vacly-app pasa en la URL del iframe. */
export function readAdminTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('token')
}

function rememberTokenInUrl(token: string): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get('token') === token) return
  url.searchParams.set('token', token)
  window.history.replaceState({}, '', url.toString())
}

/**
 * Garantiza un token de sesión para las APIs de administración.
 * En producción/iframe usa el de la URL; en localhost sin token acuña uno de desarrollo.
 */
export async function ensureAdminSessionToken(companyId: string): Promise<string | null> {
  const fromUrl = readAdminTokenFromUrl()
  if (fromUrl) return fromUrl

  if (sessionCache && sessionCache.companyId === companyId && sessionCache.expiresAt > Date.now()) {
    return sessionCache.token
  }

  try {
    const res = await fetch(`/api/admin/dev-session-token?company_id=${encodeURIComponent(companyId)}`)
    const data = await res.json()
    if (!res.ok || !data?.token) return null

    sessionCache = {
      companyId,
      token: data.token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    }
    rememberTokenInUrl(data.token)
    return data.token
  } catch {
    return null
  }
}

export function adminHeadersFromToken(token: string | null | undefined): Record<string, string> {
  return token ? { 'x-vacly-company-token': token } : {}
}

/** Cabeceras de sesión admin listas para fetch (token de URL o caché de desarrollo). */
export function useAdminSession(companyId: string | null) {
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!companyId) {
      setToken(null)
      setReady(false)
      return
    }

    let cancelled = false
    const fromUrl = readAdminTokenFromUrl()
    if (fromUrl) {
      setToken(fromUrl)
      setReady(true)
      return
    }

    setReady(false)
    ensureAdminSessionToken(companyId).then((resolved) => {
      if (cancelled) return
      setToken(resolved)
      setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [companyId])

  const adminHeaders = useCallback(
    () => adminHeadersFromToken(token ?? readAdminTokenFromUrl()),
    [token],
  )

  return { adminHeaders, sessionReady: ready, token }
}
