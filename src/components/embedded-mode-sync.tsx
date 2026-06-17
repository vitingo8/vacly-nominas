'use client'

import { useEffect } from 'react'
import { isEmbeddedContext } from '@/lib/embedded-mode'

/** Aplica la clase global `nominas-embedded` cuando la app va embebida en vacly-app. */
export function EmbeddedModeSync() {
  useEffect(() => {
    if (!isEmbeddedContext()) return

    const html = document.documentElement
    const body = document.body
    html.classList.add('nominas-embedded')
    body.classList.add('nominas-embedded')

    return () => {
      html.classList.remove('nominas-embedded')
      body.classList.remove('nominas-embedded')
    }
  }, [])

  return null
}
