'use client'

import { useEffect, useState } from 'react'
import { GastosVerView } from '@/components/gastos-ver-view'

export default function VerGastosPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCompanyId(params.get('company_id'))
  }, [])

  return <GastosVerView companyId={companyId} />
}
