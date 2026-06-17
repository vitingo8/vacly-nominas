'use client'

import { useEffect, useState } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface NotifRow {
  id: string
  companyId: string
  companyName?: string | null
  provider: string
  subject: string
  sender: string | null
  concept: string | null
  receivedAt: string
  accessDeadline: string | null
  readAt: string | null
}

interface CertOption {
  id: string
  alias: string
  status: string
}

function adminHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = new URLSearchParams(window.location.search).get('token')
  return token ? { 'x-vacly-company-token': token } : {}
}

function fmtDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

const PROVIDER_LABEL: Record<string, string> = { dehu: 'DEHu', aeat: 'AEAT', tgss: 'TGSS' }

export default function AdminNotificationsPage() {
  const companyId = useCompanyId()
  const [mine, setMine] = useState<NotifRow[]>([])
  const [agency, setAgency] = useState<NotifRow[]>([])
  const [certs, setCerts] = useState<CertOption[]>([])
  const [certId, setCertId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  const loadMine = () => {
    if (!companyId) return
    fetch(`/api/admin/notifications?company_id=${encodeURIComponent(companyId)}`, { headers: adminHeaders() })
      .then((r) => r.json())
      .then((d) => d.success && setMine(d.notifications || []))
      .catch(() => {})
  }

  const loadAgency = () => {
    if (!companyId) return
    fetch(`/api/admin/notifications?scope=agency&company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => d.success && setAgency(d.notifications || []))
      .catch(() => {})
  }

  const loadCerts = () => {
    if (!companyId) return
    fetch(`/api/admin/config/certificates?company_id=${encodeURIComponent(companyId)}`, { headers: adminHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const active = (d.certificates || []).filter((c: any) => c.status !== 'revoked' && c.status !== 'expired')
          setCerts(active.map((c: any) => ({ id: c.id, alias: c.alias, status: c.status })))
          if (active[0]) setCertId(active[0].id)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadMine()
    loadAgency()
    loadCerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const sync = async () => {
    setMessage('')
    setError('')
    if (!companyId || !certId) {
      setError('Selecciona un certificado para sincronizar las notificaciones.')
      return
    }
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/notifications/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ company_id: companyId, certificate_id: certId }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`Sincronizacion completada: ${data.stored} nuevas de ${data.fetched} recibidas.`)
        loadMine()
        loadAgency()
      } else {
        setError(data.message || 'Error al sincronizar')
      }
    } catch {
      setError('Error de conexion al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const markRead = async (id: string) => {
    if (!companyId) return
    await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ company_id: companyId, id }),
    })
    loadMine()
    loadAgency()
  }

  return (
    <AdminShell>
      <Card className="p-6 border-slate-200 w-full">
        <h2 className="font-semibold text-slate-800 mb-1">Sincronizar notificaciones</h2>
        <p className="text-xs text-slate-500 mb-4">
          Descarga las notificaciones del organismo usando un certificado de esta empresa.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
          >
            {certs.length === 0 && <option value="">Sin certificados disponibles</option>}
            {certs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.alias}
              </option>
            ))}
          </select>
          <Button onClick={sync} disabled={syncing || !certId} className="bg-[#1B2A41] text-white hover:bg-[#152036]">
            {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
          </Button>
        </div>
        {message && <p className="text-sm text-emerald-700 mt-3">{message}</p>}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </Card>

      <Tabs defaultValue="mine" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="mine">Esta empresa</TabsTrigger>
          <TabsTrigger value="agency">Cartera de la gestoria</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <NotifTable rows={mine} onRead={markRead} />
        </TabsContent>
        <TabsContent value="agency">
          <NotifTable rows={agency} onRead={markRead} showCompany />
        </TabsContent>
      </Tabs>
    </AdminShell>
  )
}

function NotifTable({
  rows,
  onRead,
  showCompany = false,
}: {
  rows: NotifRow[]
  onRead: (id: string) => void
  showCompany?: boolean
}) {
  return (
    <Card className="border-slate-200 overflow-hidden w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50">
            <tr>
              {showCompany && <th className="text-left p-3">Empresa</th>}
              <th className="text-left p-3">Organismo</th>
              <th className="text-left p-3">Asunto</th>
              <th className="text-left p-3">Recibida</th>
              <th className="text-left p-3">Plazo acceso</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-right p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} className={`border-t border-slate-100 ${n.readAt ? '' : 'bg-amber-50/40'}`}>
                {showCompany && <td className="p-3 text-slate-700">{n.companyName || '—'}</td>}
                <td className="p-3">
                  <Badge variant="secondary">{PROVIDER_LABEL[n.provider] || n.provider}</Badge>
                  {n.sender && <span className="block text-[11px] text-slate-400">{n.sender}</span>}
                </td>
                <td className="p-3 text-slate-700">
                  {n.subject}
                  {n.concept && <span className="block text-[11px] text-slate-400">{n.concept}</span>}
                </td>
                <td className="p-3 text-slate-600">{fmtDate(n.receivedAt)}</td>
                <td className="p-3 text-slate-600">{fmtDate(n.accessDeadline)}</td>
                <td className="p-3">
                  {n.readAt ? (
                    <Badge variant="outline">Leida</Badge>
                  ) : (
                    <Badge>Nueva</Badge>
                  )}
                </td>
                <td className="p-3 text-right">
                  {!n.readAt && (
                    <button onClick={() => onRead(n.id)} className="text-xs font-medium text-[#1B2A41] hover:underline">
                      Marcar leida
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showCompany ? 7 : 6} className="p-6 text-center text-slate-500">
                  Sin notificaciones
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
