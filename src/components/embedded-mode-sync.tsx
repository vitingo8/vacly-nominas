'use client'

import { useEffect } from 'react'
import { isEmbeddedContext, VACLY_EMBED_HEIGHT_MSG } from '@/lib/embedded-mode'

function resolveParentOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_VACLY_APP_URL?.trim().replace(/\/$/, '')
  if (configured) return configured
  try {
    if (document.referrer) return new URL(document.referrer).origin
  } catch {
    /* ignore */
  }
  return '*'
}

/** Aplica estilos embebidos y reporta la altura al iframe padre (vacly-app). */
export function EmbeddedModeSync() {
  useEffect(() => {
    if (!isEmbeddedContext()) return

    const html = document.documentElement
    const body = document.body
    html.classList.add('nominas-embedded')
    body.classList.add('nominas-embedded')

    const parentOrigin = resolveParentOrigin()
    let frame = 0

    const postHeight = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.scrollHeight,
          html.offsetHeight,
        )
        window.parent.postMessage({ type: VACLY_EMBED_HEIGHT_MSG, height }, parentOrigin)
      })
    }

    postHeight()

    const observer = new ResizeObserver(postHeight)
    observer.observe(body)
    observer.observe(html)

    const mutationObserver = new MutationObserver(postHeight)
    mutationObserver.observe(body, { childList: true, subtree: true, attributes: true })

    window.addEventListener('resize', postHeight)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', postHeight)
      html.classList.remove('nominas-embedded')
      body.classList.remove('nominas-embedded')
    }
  }, [])

  return null
}
