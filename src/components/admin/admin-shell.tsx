'use client'

import { useEffect, useState } from 'react'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'

interface AdminShellProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function AdminShell({ title, subtitle, children }: AdminShellProps) {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [mockMode, setMockMode] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCompanyId(params.get('company_id'))
    fetch('/api/admin/config/status')
      .then((r) => r.json())
      .then((d) => setMockMode(d.tgssMode === 'mock'))
      .catch(() => {})
  }, [])

  if (!companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <p className="text-slate-600">Falta el parámetro company_id en la URL.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center">
            <ShieldCheckIcon className="w-7 h-7 text-[#C6A664]" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
              {mockMode && (
                <span className="text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                  Entorno simulado
                </span>
              )}
            </div>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function useCompanyId() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  useEffect(() => {
    setCompanyId(new URLSearchParams(window.location.search).get('company_id'))
  }, [])
  return companyId
}
