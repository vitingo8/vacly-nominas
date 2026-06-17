'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useCompanyId, useEmbeddedMode } from './admin-shell'

type AffiliationType = 'alta' | 'baja' | 'variacion'

const ENDPOINTS: Record<AffiliationType, string> = {
  alta: '/api/admin/tgss/affiliation/hire',
  baja: '/api/admin/tgss/affiliation/terminate',
  variacion: '/api/admin/tgss/affiliation/change',
}

interface AffiliationFormProps {
  type: AffiliationType
  title: string
  description: string
}

export function AffiliationForm({ type, title, description }: AffiliationFormProps) {
  const companyId = useCompanyId()
  const isEmbedded = useEmbeddedMode()
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; nif?: string }>>([])
  const [employeeId, setEmployeeId] = useState('')
  const [nss, setNss] = useState('')
  const [fechaReal, setFechaReal] = useState('')
  const [fechaEfecto, setFechaEfecto] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ transactionId?: string; status?: string; error?: string } | null>(null)

  useEffect(() => {
    if (!companyId) return
    fetch(`/api/nominas/employees?company_id=${encodeURIComponent(companyId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEmployees(d.data || [])
      })
      .catch(console.error)
  }, [companyId])

  const submit = async () => {
    if (!companyId || !employeeId) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(ENDPOINTS[type], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          employee_id: employeeId,
          nss: nss || undefined,
          fecha_real: fechaReal || undefined,
          fecha_efecto: fechaEfecto || undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setResult({ error: data.message || 'Error al crear trámite' })
      } else {
        setResult({ transactionId: data.transactionId, status: data.status })
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Error de red' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6 border-slate-200 w-full">
      {!isEmbedded && (
        <>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">{title}</h2>
          <p className="text-sm text-slate-500 mb-6">{description}</p>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="md:col-span-2 xl:col-span-2">
          <label className="text-sm font-medium text-slate-700 block mb-1">Empleado</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm"
          >
            <option value="">Seleccionar empleado</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}{emp.nif ? ` (${emp.nif})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 xl:col-span-2">
          <label className="text-sm font-medium text-slate-700 block mb-1">NSS (opcional si está en ficha)</label>
          <Input value={nss} onChange={(e) => setNss(e.target.value)} placeholder="12 dígitos" />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Fecha real</label>
          <Input type="date" value={fechaReal} onChange={(e) => setFechaReal(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Fecha efecto</label>
          <Input type="date" value={fechaEfecto} onChange={(e) => setFechaEfecto(e.target.value)} />
        </div>

        <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3 pt-2">
          <Button
            onClick={submit}
            disabled={loading || !employeeId}
            className="bg-[#1B2A41] hover:bg-[#152036] text-white"
          >
            {loading ? 'Procesando…' : 'Generar trámite AFI'}
          </Button>
        </div>

        {result?.error && (
          <div className="md:col-span-2 xl:col-span-4">
            <p className="text-sm text-rose-600 bg-rose-50 p-3 rounded-lg">{result.error}</p>
          </div>
        )}
        {result?.transactionId && (
          <div className="md:col-span-2 xl:col-span-4 text-sm bg-emerald-50 text-emerald-800 p-3 rounded-lg space-y-1">
            <p>Trámite creado: <span className="font-mono">{result.transactionId}</span></p>
            <p>Estado: <strong>{result.status}</strong></p>
            <a
              href={`/admin/tgss/transactions?company_id=${companyId}`}
              className="text-[#1B2A41] underline"
            >
              Ver historial de trámites
            </a>
          </div>
        )}
      </div>
    </Card>
  )
}
