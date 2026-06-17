'use client'

import { useEffect, useState } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AuthRow {
  id: string
  provider: string
  authorization_type: string
  holder_nif: string
  red_authorization_number?: string | null
  status: string
}

export default function AdminAuthorizationsPage() {
  const companyId = useCompanyId()
  const [rows, setRows] = useState<AuthRow[]>([])
  const [holderNif, setHolderNif] = useState('')
  const [redNumber, setRedNumber] = useState('')
  const [message, setMessage] = useState('')

  const load = () => {
    if (!companyId) return
    fetch(`/api/admin/config/authorizations?company_id=${encodeURIComponent(companyId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRows(d.authorizations || [])
      })
  }

  useEffect(() => {
    load()
  }, [companyId])

  const create = async () => {
    if (!companyId || !holderNif) return
    const res = await fetch('/api/admin/config/authorizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        provider: 'tgss',
        authorization_type: 'red',
        holder_nif: holderNif,
        red_authorization_number: redNumber || undefined,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setMessage('Autorización RED registrada')
      setHolderNif('')
      setRedNumber('')
      load()
    } else {
      setMessage(data.message || 'Error')
    }
  }

  return (
    <AdminShell>
      <Card className="p-6 border-slate-200 w-full">
        <h2 className="font-semibold mb-4">Nueva autorización</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <Input placeholder="NIF titular" value={holderNif} onChange={(e) => setHolderNif(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Input placeholder="Nº autorización RED" value={redNumber} onChange={(e) => setRedNumber(e.target.value)} />
          </div>
          <Button onClick={create} className="bg-[#1B2A41] text-white hover:bg-[#152036] shrink-0">
            Guardar
          </Button>
        </div>
        {message && <p className="text-sm text-slate-600 mt-3">{message}</p>}
      </Card>

      <Card className="border-slate-200 overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Titular</th>
              <th className="text-left p-3">Nº RED</th>
              <th className="text-left p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3">{r.holder_nif}</td>
                <td className="p-3">{r.red_authorization_number || '—'}</td>
                <td className="p-3">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-slate-500">Sin autorizaciones</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </AdminShell>
  )
}
