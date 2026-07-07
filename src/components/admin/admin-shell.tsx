'use client'

import { useEffect, useState } from 'react'
import { useEmbeddedMode, useSearchParam } from '@/lib/embedded-mode'

/** Mismo contenedor de ancho que el gestor de nóminas (`src/app/page.tsx`). */
export const ADMIN_PAGE_SHELL_CLASS =
  'w-full max-w-none px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8'

interface AdminShellProps {
  title?: string
  subtitle?: string
  /** Fuerza modo embebido (sin cabecera). Por defecto se detecta `embedded=1` en la URL. */
  embedded?: boolean
  children: React.ReactNode
}

export function AdminShell({ title, subtitle, embedded, children }: AdminShellProps) {
  const companyId = useSearchParam('company_id')
  const [mounted, setMounted] = useState(false)
  const detectedEmbedded = useEmbeddedMode()
  const isEmbedded = embedded ?? detectedEmbedded

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="min-h-[40vh] bg-[#f6f8fa]" aria-hidden />
  }

  if (!companyId) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center bg-[#f6f8fa] p-6">
        <p className="text-slate-600">Falta el parámetro company_id en la URL.</p>
      </div>
    )
  }

  return (
    <div className="w-full min-h-0 bg-[#f6f8fa]">
      <div className={ADMIN_PAGE_SHELL_CLASS}>
        {!isEmbedded && (title || subtitle) && (
          <div className="mb-6">
            {title && <h1 className="text-2xl font-bold text-[#1B2A41]">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-[#5C6B7F]">{subtitle}</p>}
          </div>
        )}
        <div className="w-full max-w-none space-y-6">{children}</div>
      </div>
    </div>
  )
}

export function useCompanyId() {
  return useSearchParam('company_id')
}

export { useEmbeddedMode } from '@/lib/embedded-mode'
