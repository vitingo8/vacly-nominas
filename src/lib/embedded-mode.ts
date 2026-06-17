'use client'

import { useEffect, useState } from 'react'

export function readSearchParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
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
