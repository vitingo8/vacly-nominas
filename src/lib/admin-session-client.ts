'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  isEmbeddedAdminContext,
  isTrustedVaclyAppOrigin,
  VACLY_ADMIN_SESSION_MSG,
  VACLY_REQUEST_ADMIN_SESSION_MSG,
  VACLY_SUPABASE_ACCESS_MSG,
  type VaclyAdminSessionMessage,
  type VaclyRequestAdminSessionMessage,
  type VaclySupabaseAccessMessage,
} from '@/lib/admin-session-bridge'

type SessionCache = { companyId: string; token: string; expiresAt: number }

let sessionCache: SessionCache | null = null

const EMBEDDED_TOKEN_TIMEOUT_MS = 8000

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

function cacheToken(companyId: string, token: string, expiresIn = 3600): void {
  sessionCache = {
    companyId,
    token,
    expiresAt: Date.now() + expiresIn * 1000 - 60_000,
  }
}

async function mintTokenFromSupabaseAccess(companyId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/admin/session-token?company_id=${encodeURIComponent(companyId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.token) return null
    cacheToken(companyId, data.token, data.expires_in ?? 3600)
    rememberTokenInUrl(data.token)
    return data.token
  } catch {
    return null
  }
}

/** Pide token al padre (vacly-app) vía postMessage cuando el iframe no lo trae en la URL. */
function requestEmbeddedSessionToken(companyId: string): Promise<string | null> {
  if (typeof window === 'undefined' || window.parent === window) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (token: string | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve(token)
    }

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedVaclyAppOrigin(event.origin)) return
      const data = event.data as VaclyAdminSessionMessage | VaclySupabaseAccessMessage | null
      if (!data?.type) return

      if (data.type === VACLY_ADMIN_SESSION_MSG && typeof data.token === 'string' && data.token) {
        cacheToken(companyId, data.token)
        rememberTokenInUrl(data.token)
        finish(data.token)
        return
      }

      if (data.type === VACLY_SUPABASE_ACCESS_MSG && typeof data.accessToken === 'string') {
        void mintTokenFromSupabaseAccess(companyId, data.accessToken).then(finish)
      }
    }

    window.addEventListener('message', onMessage)
    const payload: VaclyRequestAdminSessionMessage = {
      type: VACLY_REQUEST_ADMIN_SESSION_MSG,
      companyId,
    }
    window.parent.postMessage(payload, '*')

    const timer = window.setTimeout(() => finish(null), EMBEDDED_TOKEN_TIMEOUT_MS)
  })
}

/**
 * Garantiza un token de sesión para las APIs de administración.
 * Orden: URL → caché → postMessage (iframe) → dev-session-token (solo localhost).
 */
export async function ensureAdminSessionToken(companyId: string): Promise<string | null> {
  const fromUrl = readAdminTokenFromUrl()
  if (fromUrl) return fromUrl

  if (sessionCache && sessionCache.companyId === companyId && sessionCache.expiresAt > Date.now()) {
    return sessionCache.token
  }

  if (isEmbeddedAdminContext()) {
    const fromParent = await requestEmbeddedSessionToken(companyId)
    if (fromParent) return fromParent
  }

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  try {
    const res = await fetch(`/api/admin/dev-session-token?company_id=${encodeURIComponent(companyId)}`)
    const data = await res.json()
    if (!res.ok || !data?.token) return null

    cacheToken(companyId, data.token, data.expires_in ?? 3600)
    rememberTokenInUrl(data.token)
    return data.token
  } catch {
    return null
  }
}

export function adminHeadersFromToken(token: string | null | undefined): Record<string, string> {
  return token ? { 'x-vacly-company-token': token } : {}
}

/** Cabeceras de sesión admin listas para fetch (token de URL, padre o caché de desarrollo). */
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
