'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
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
  hasDocument: boolean
  aeatEstado?: string | null
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

function deadlineClass(deadline?: string | null, readAt?: string | null): string {
  if (!deadline || readAt) return 'text-slate-600'
  const days = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (days < 0) return 'text-red-600 font-medium'
  if (days <= 3) return 'text-amber-700 font-medium'
  return 'text-slate-600'
}

const PROVIDER_LABEL: Record<string, string> = { dehu: 'DEHú LEMA', aeat: 'AEAT', tgss: 'TGSS WSCN' }

type StatusFilter = 'pending' | 'all'

function isPendingNotification(n: NotifRow): boolean {
  return !n.readAt && n.aeatEstado !== 'A'
}

function filterNotifications(rows: NotifRow[], statusFilter: StatusFilter): NotifRow[] {
  if (statusFilter === 'all') return rows
  return rows.filter(isPendingNotification)
}

interface ProviderRun {
  provider: string
  status: string
  fetched: number
  stored: number
  errorMessage?: string
}

export default function AdminNotificationsPage() {
  const companyId = useCompanyId()
  const [mine, setMine] = useState<NotifRow[]>([])
  const [agency, setAgency] = useState<NotifRow[]>([])
  const [certs, setCerts] = useState<CertOption[]>([])
  const [certId, setCertId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [viewer, setViewer] = useState<{ title: string; url: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState<{
    id: string
    subject: string
    rowCompanyId?: string
    omitCertOverride?: boolean
    needsComparecer: boolean
  } | null>(null)

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
        const runs = (data.runs || []) as ProviderRun[]
        const summary = runs
          .map(
            (r) =>
              `${PROVIDER_LABEL[r.provider] || r.provider}: ${r.status}${r.errorMessage ? ` (${r.errorMessage})` : ''}`,
          )
          .join(' · ')
        setMessage(
          `Sincronización completada: ${data.stored} nuevas de ${data.fetched} recibidas.${summary ? ` ${summary}` : ''}`,
        )
        loadMine()
        loadAgency()
      } else {
        const runs = (data.runs || []) as ProviderRun[]
        const runDetail = runs
          .map(
            (r) =>
              `${PROVIDER_LABEL[r.provider] || r.provider}: ${r.errorMessage || r.status}`,
          )
          .join(' · ')
        setError(runDetail || data.message || 'Error al sincronizar')
      }
    } catch {
      setError('Error de conexion al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const markRead = async (id: string, rowCompanyId?: string, omitCertOverride?: boolean) => {
    const targetCompanyId = rowCompanyId || companyId
    if (!targetCompanyId) return
    if (!omitCertOverride && !certId) {
      setError('Selecciona un certificado para comparecer en AEAT.')
      return
    }
    setActingId(id)
    setError('')
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          company_id: targetCompanyId,
          id,
          ...(omitCertOverride ? {} : { certificate_id: certId }),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.message || 'Error al marcar como leída')
        return
      }
      loadMine()
      loadAgency()
    } catch {
      setError('Error de conexion al marcar como leída')
    } finally {
      setActingId(null)
    }
  }

  const requestOpen = (
    row: NotifRow,
    rowCompanyId?: string,
    omitCertOverride?: boolean,
  ) => {
    const needsComparecer = isPendingNotification(row)
    setConfirmOpen({
      id: row.id,
      subject: row.subject,
      rowCompanyId,
      omitCertOverride,
      needsComparecer,
    })
  }

  const executeOpen = async () => {
    if (!confirmOpen) return
    const { id, rowCompanyId, omitCertOverride, subject } = confirmOpen
    setConfirmOpen(null)

    const targetCompanyId = rowCompanyId || companyId
    if (!targetCompanyId) return
    if (!omitCertOverride && !certId) {
      setError('Selecciona un certificado para abrir la notificación.')
      return
    }
    setActingId(id)
    setError('')
    try {
      const params = new URLSearchParams({ company_id: targetCompanyId, confirm: '1' })
      if (!omitCertOverride && certId) params.set('certificate_id', certId)
      const res = await fetch(`/api/admin/notifications/${id}/document?${params}`, {
        headers: adminHeaders(),
      })
      const data = await res.json()
      if (!data.success || !data.url) {
        setError(data.message || 'No se pudo abrir el documento')
        return
      }
      const row = [...mine, ...agency].find((n) => n.id === id)
      setViewer({ title: row?.subject || subject, url: data.url })
      loadMine()
      loadAgency()
    } catch {
      setError('Error de conexion al abrir la notificación')
    } finally {
      setActingId(null)
    }
  }

  return (
    <AdminShell>
      <Card className="p-6 border-slate-200 w-full">
        <h2 className="font-semibold text-slate-800 mb-1">Sincronizar notificaciones</h2>
        <p className="text-xs text-slate-500 mb-4">
          La sincronización solo consulta el listado en AEAT (sin abrir ni comparecer). El contenido se descarga
          únicamente cuando tú pulsas Abrir y confirmas.
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="mine">Esta empresa</TabsTrigger>
            <TabsTrigger value="agency">Cartera de la gestoria</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <label htmlFor="notif-status-filter" className="text-xs text-slate-500">
              Mostrar
            </label>
            <select
              id="notif-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm bg-white"
            >
              <option value="pending">Pendientes</option>
              <option value="all">Todas</option>
            </select>
          </div>
        </div>
        <TabsContent value="mine">
          <NotifTable
            rows={filterNotifications(mine, statusFilter)}
            totalCount={mine.length}
            statusFilter={statusFilter}
            onRead={markRead}
            onRequestOpen={requestOpen}
            actingId={actingId}
          />
        </TabsContent>
        <TabsContent value="agency">
          <NotifTable
            rows={filterNotifications(agency, statusFilter)}
            totalCount={agency.length}
            statusFilter={statusFilter}
            onRead={markRead}
            onRequestOpen={requestOpen}
            actingId={actingId}
            showCompany
            useRowCompanyId
          />
        </TabsContent>
      </Tabs>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-md w-full p-6 border-slate-200 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-2">
              {confirmOpen.needsComparecer ? 'Comparecer en AEAT' : 'Abrir notificación'}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {confirmOpen.needsComparecer
                ? `Al abrir «${confirmOpen.subject}» se comparecerá ante AEAT y se descargará el contenido. Esta acción tiene efectos legales.`
                : `¿Mostrar el contenido de «${confirmOpen.subject}» en pantalla?`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(null)}>
                Cancelar
              </Button>
              <Button className="bg-[#1B2A41] text-white hover:bg-[#152036]" onClick={executeOpen}>
                {confirmOpen.needsComparecer ? 'Comparecer y abrir' : 'Abrir'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/50 p-4 md:p-8">
          <Card className="flex flex-col flex-1 min-h-0 border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="font-medium text-slate-800 truncate">{viewer.title}</h3>
              <Button variant="outline" size="sm" onClick={() => setViewer(null)}>
                Cerrar
              </Button>
            </div>
            <iframe
              src={viewer.url}
              title={viewer.title}
              className="flex-1 w-full min-h-[70vh] bg-white"
            />
          </Card>
        </div>
      )}
    </AdminShell>
  )
}

function ProviderBadge({ provider, sender }: { provider: string; sender: string | null }) {
  if (provider === 'aeat') {
    return (
      <div className="flex items-center gap-2">
        <Image src="/brands/aeat.png" alt="AEAT" width={28} height={28} className="rounded-sm shrink-0" />
        <div>
          <span className="text-xs font-medium text-slate-700">AEAT</span>
          {sender && <span className="block text-[11px] text-slate-400 leading-tight">{sender}</span>}
        </div>
      </div>
    )
  }
  return (
    <div>
      <Badge variant="secondary">{PROVIDER_LABEL[provider] || provider}</Badge>
      {sender && <span className="block text-[11px] text-slate-400 mt-0.5">{sender}</span>}
    </div>
  )
}

function NotifTable({
  rows,
  totalCount,
  statusFilter,
  onRead,
  onRequestOpen,
  actingId,
  showCompany = false,
  useRowCompanyId = false,
}: {
  rows: NotifRow[]
  totalCount: number
  statusFilter: StatusFilter
  onRead: (id: string, rowCompanyId?: string, omitCertOverride?: boolean) => void
  onRequestOpen: (row: NotifRow, rowCompanyId?: string, omitCertOverride?: boolean) => void
  actingId: string | null
  showCompany?: boolean
  useRowCompanyId?: boolean
}) {
  const pendingCount = rows.length
  const emptyMessage =
    statusFilter === 'pending'
      ? totalCount === 0
        ? 'Sin notificaciones. Sincroniza con AEAT para importarlas.'
        : 'Sin notificaciones pendientes. Cambia el filtro a "Todas" para ver las ya accedidas.'
      : 'Sin notificaciones'

  return (
    <Card className="border-slate-200 overflow-hidden w-full">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500">
        {statusFilter === 'pending' ? (
          <>
            <span className="font-medium text-slate-700">{pendingCount} pendientes</span>
            {totalCount > pendingCount && (
              <span>{` · ${totalCount - pendingCount} ya accedidas (ocultas)`}</span>
            )}
          </>
        ) : (
          <span>
            <span className="font-medium text-slate-700">{totalCount} notificaciones</span>
            {totalCount > 0 && (
              <span>{` · ${rows.filter(isPendingNotification).length} pendientes`}</span>
            )}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-slate-50">
            <tr>
              {showCompany && <th className="text-left p-3">Empresa</th>}
              <th className="text-left p-3">Organismo</th>
              <th className="text-left p-3">Asunto</th>
              <th className="text-left p-3">Recibida</th>
              <th className="text-left p-3">Caducidad</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-right p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const isUnread = isPendingNotification(n)
              const busy = actingId === n.id
              const actionCompanyId = useRowCompanyId ? n.companyId : undefined
              return (
                <tr key={n.id} className={`border-t border-slate-100 ${isUnread ? 'bg-amber-50/40' : ''}`}>
                  {showCompany && (
                    <td className="p-3 text-slate-700 font-medium">{n.companyName || 'Empresa'}</td>
                  )}
                  <td className="p-3">
                    <ProviderBadge provider={n.provider} sender={n.sender} />
                  </td>
                  <td className="p-3 text-slate-700">
                    {n.subject}
                    {n.concept && <span className="block text-[11px] text-slate-400">{n.concept}</span>}
                  </td>
                  <td className="p-3 text-slate-600">{fmtDate(n.receivedAt)}</td>
                  <td className={`p-3 ${deadlineClass(n.accessDeadline, n.readAt)}`}>
                    {fmtDate(n.accessDeadline)}
                  </td>
                  <td className="p-3">
                    {n.readAt ? (
                      <Badge variant="outline">Comparecida</Badge>
                    ) : n.aeatEstado === 'A' ? (
                      <Badge variant="secondary">Accedida en AEAT</Badge>
                    ) : (
                      <Badge>Nueva</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => onRequestOpen(n, actionCompanyId, useRowCompanyId)}
                      disabled={busy}
                      className="text-xs font-medium text-[#1B2A41] hover:underline mr-3 disabled:opacity-50"
                    >
                      {busy ? 'Abriendo...' : 'Abrir'}
                    </button>
                    {isUnread && n.aeatEstado !== 'A' && (
                      <button
                        onClick={() => onRead(n.id, actionCompanyId, useRowCompanyId)}
                        disabled={busy}
                        className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                      >
                        {busy ? 'Compareciendo...' : 'Marcar leida'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showCompany ? 7 : 6} className="p-6 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
