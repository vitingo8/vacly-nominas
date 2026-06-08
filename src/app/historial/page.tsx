'use client'

import { useEffect, useState } from 'react'
import { NominasHistorial } from '@/components/nominas-historial'

export default function HistorialPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCompanyId(params.get('company_id'))
  }, [])

  return <NominasHistorial companyId={companyId} />
}
