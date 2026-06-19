'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

export function readSearchParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

/** Lee un query param sin provocar hydration mismatch (snapshot servidor = null). */
export function useSearchParam(key: string): string | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener('popstate', onStoreChange)
      return () => window.removeEventListener('popstate', onStoreChange)
    },
    () => readSearchParam(key),
    () => null,
  )
}

/** true cuando vacly-nominas se muestra dentro de un iframe de vacly-app (o `embedded=1`). */
export function isEmbeddedContext(): boolean {
  if (typeof window === 'undefined') return false
  if (readSearchParam('embedded') === '1') return true
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function useEmbeddedMode(): boolean {
  const [embedded, setEmbedded] = useState(false)

  useEffect(() => {
    setEmbedded(isEmbeddedContext())
  }, [])

  return embedded
}
