'use client'

import { useEffect, useState } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface TransactionRow {
  id: string
  procedure_code: string
  status: string
  created_at: string
  error_message?: string | null
}

export default function AdminTransactionsPage() {
  const companyId = useCompanyId()
  const [rows, setRows] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/tgss/transactions?company_id=${encodeURIComponent(companyId)}`)
      const data = await res.json()
      if (data.success) setRows(data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [companyId])

  const statusColor = (s: string) => {
    if (s === 'accepted') return 'text-emerald-700 bg-emerald-50'
    if (s === 'rejected' || s === 'failed') return 'text-rose-700 bg-rose-50'
    if (s === 'queued' || s === 'submitted') return 'text-amber-700 bg-amber-50'
    return 'text-slate-600 bg-slate-100'
  }

  return (
    <AdminShell title="Historial de trámites" subtitle="Transacciones administrativas TGSS/AEAT">
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="ml-2">Actualizar</span>
        </Button>
      </div>

      <Card className="border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-700">Procedimiento</th>
                <th className="text-left p-3 font-semibold text-slate-700">Estado</th>
                <th className="text-left p-3 font-semibold text-slate-700">Fecha</th>
                <th className="text-left p-3 font-semibold text-slate-700">ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    {loading ? 'Cargando…' : 'Sin trámites registrados'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="p-3">{row.procedure_code}</td>
                    <td className="p-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(row.created_at).toLocaleString('es-ES')}
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500">{row.id.slice(0, 8)}…</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminShell>
  )
}
