'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { AEAT_LOGO_URL } from '@/lib/brand-assets'

interface NotifRow {
  id: string
  companyId: string
  companyName?: string | null
  certificateId?: string | null
  provider: string
  externalId: string
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
  companyName?: string | null
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

function deadlineClass(deadline?: string | null, opened?: boolean): string {
  if (!deadline || opened) return 'text-slate-600'
  const days = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (days < 0) return 'text-red-600 font-medium'
  if (days <= 3) return 'text-amber-700 font-medium'
  return 'text-slate-600'
}

const PROVIDER_LABEL: Record<string, string> = { dehu: 'DEHú LEMA', aeat: 'AEAT', tgss: 'TGSS WSCN' }

type StatusFilter = 'pending' | 'all'

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added += 1
  }
  return result
}

function computeCaducidad(n: NotifRow): string | null {
  if (n.accessDeadline) return n.accessDeadline
  const base = new Date(n.receivedAt)
  if (Number.isNaN(base.getTime())) return null
  return addBusinessDays(base, 10).toISOString()
}

function isOpenedNotification(n: NotifRow): boolean {
  return !!n.readAt
}

function isPendingNotification(n: NotifRow): boolean {
  return !n.readAt
}

function needsComparecer(row: NotifRow): boolean {
  return !row.readAt && row.aeatEstado !== 'A'
}

function filterNotifications(rows: NotifRow[], statusFilter: StatusFilter): NotifRow[] {
  if (statusFilter === 'all') return rows
  return rows.filter(isPendingNotification)
}

interface EmailAnalysis {
  summary: string
  emailTo: string
  emailSubject: string
  emailBody: string
  companyName: string
  fileName: string
}

type ConfirmAction = 'open' | 'download' | 'mail'

function sanitizeFileName(value: string): string {
  return value.replace(/[^\w\s.-]/g, '').trim().slice(0, 80) || 'notificacion'
}

function buildMailtoLink(to: string, subject: string, body: string): string {
  const params = new URLSearchParams()
  params.set('subject', subject)
  params.set('body', body)
  const qs = params.toString()
  const recipient = to.trim()
  return recipient ? `mailto:${recipient}?${qs}` : `mailto:?${qs}`
}

export default function AdminNotificationsPage() {
  const companyId = useCompanyId()
  const [agency, setAgency] = useState<NotifRow[]>([])
  const [certs, setCerts] = useState<CertOption[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [viewer, setViewer] = useState<{ title: string; blobUrl: string; fileName: string } | null>(null)
  const [emailPanel, setEmailPanel] = useState<{
    row: NotifRow
    analysis: EmailAnalysis
    mailto: string
    pdfBlob: Blob
    fileName: string
  } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState<{
    row: NotifRow
    needsComparecer: boolean
    action: ConfirmAction
  } | null>(null)

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
    fetch(
      `/api/admin/config/certificates?scope=agency&company_id=${encodeURIComponent(companyId)}`,
      { headers: adminHeaders() },
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const active = (d.certificates || []).filter((c: any) => c.status !== 'revoked' && c.status !== 'expired')
          const options = active.map((c: any) => ({
            id: c.id,
            alias: c.alias,
            status: c.status,
            companyName: c.companyName ?? null,
          }))
          setCerts(options)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadAgency()
    loadCerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  useEffect(() => {
    return () => {
      if (viewer?.blobUrl) URL.revokeObjectURL(viewer.blobUrl)
    }
  }, [viewer?.blobUrl])

  const closeEmailPanel = () => {
    setEmailPanel(null)
  }

  const fetchNotificationPdf = async (
    row: NotifRow,
    options?: { download?: boolean; confirm?: boolean },
  ): Promise<Blob | null> => {
    const targetCompanyId = row.companyId
    if (!targetCompanyId) return null

    const mustComparecer = needsComparecer(row)
    const needsConfirm = options?.confirm ?? (mustComparecer || !row.hasDocument)

    if (needsConfirm && !row.certificateId) {
      setError('Esta notificación no tiene certificado asociado.')
      return null
    }

    const params = new URLSearchParams({ company_id: targetCompanyId })
    if (needsConfirm) params.set('confirm', '1')
    if (options?.download) params.set('download', '1')
    if (row.certificateId) params.set('certificate_id', row.certificateId)

    const res = await fetch(`/api/admin/notifications/${row.id}/document?${params}`, {
      headers: adminHeaders(),
    })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || !contentType.includes('application/pdf')) {
      let message = 'No se pudo obtener el documento'
      try {
        const data = await res.json()
        message = data.message || message
      } catch {
        /* respuesta no JSON */
      }
      setError(message)
      return null
    }
    return res.blob()
  }

  const triggerPdfDownload = (blob: Blob, fileName: string) => {
    const blobUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`
    anchor.click()
    URL.revokeObjectURL(blobUrl)
  }

  const sync = async () => {
    setMessage('')
    setError('')
    const certificateIds = certs.map((c) => c.id)
    if (!companyId || certificateIds.length === 0) {
      setError('No hay certificados disponibles en la cartera.')
      return
    }
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/notifications/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ company_id: companyId, certificate_ids: certificateIds }),
      })
      const data = await res.json()
      if (data.success) {
        const certResults = (data.certificateResults || []) as Array<{ certificateId: string; error?: string }>
        const certErrors = certResults.filter((r) => r.error).length
        setMessage(
          `Sincronización completada: ${data.stored} nuevas de ${data.fetched} recibidas` +
            (certificateIds.length > 1 ? ` (${certificateIds.length} certificados)` : '') +
            (certErrors > 0 ? ` · ${certErrors} certificado(s) con error` : '') +
            '.',
        )
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

  const requestAction = (action: ConfirmAction, row: NotifRow) => {
    if (needsComparecer(row)) {
      setConfirmOpen({ row, needsComparecer: true, action })
      return
    }

    if (action === 'open') {
      void runOpen(row, false)
    } else if (action === 'download') {
      void runDownload(row, false)
    } else {
      void runMailAnalysis(row, false)
    }
  }

  const runOpen = async (row: NotifRow, withConfirm: boolean) => {
    setActingId(row.id)
    setError('')
    try {
      const blob = await fetchNotificationPdf(row, { confirm: withConfirm })
      if (!blob) return
      const blobUrl = URL.createObjectURL(blob)
      setViewer({
        title: row.subject,
        blobUrl,
        fileName: sanitizeFileName(row.subject),
      })
      loadAgency()
    } catch {
      setError('Error de conexion al abrir la notificación')
    } finally {
      setActingId(null)
    }
  }

  const runDownload = async (row: NotifRow, withConfirm: boolean) => {
    setActingId(row.id)
    setError('')
    try {
      const blob = await fetchNotificationPdf(row, { download: true, confirm: withConfirm })
      if (!blob) return
      triggerPdfDownload(blob, sanitizeFileName(row.subject))
      loadAgency()
    } catch {
      setError('Error de conexion al descargar la notificación')
    } finally {
      setActingId(null)
    }
  }

  const runMailAnalysis = async (row: NotifRow, withConfirm: boolean) => {
    if (!row.companyId) return
    if (withConfirm && !row.certificateId) {
      setError('Esta notificación no tiene certificado asociado.')
      return
    }

    setActingId(row.id)
    setError('')
    try {
      const res = await fetch(`/api/admin/notifications/${row.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          company_id: row.companyId,
          confirm: withConfirm ? 1 : 0,
          ...(row.certificateId ? { certificate_id: row.certificateId } : {}),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.message || 'No se pudo analizar la notificación')
        return
      }

      const blob = await fetchNotificationPdf(row, { confirm: false })
      if (!blob) return

      const analysis = data.analysis as EmailAnalysis
      const mailto = buildMailtoLink(analysis.emailTo, analysis.emailSubject, analysis.emailBody)

      setEmailPanel({
        row,
        analysis,
        mailto,
        pdfBlob: blob,
        fileName: analysis.fileName || sanitizeFileName(row.subject),
      })
      loadAgency()
    } catch {
      setError('Error de conexion al preparar el correo')
    } finally {
      setActingId(null)
    }
  }

  const executeConfirm = async () => {
    if (!confirmOpen) return
    const { row, action } = confirmOpen
    setConfirmOpen(null)

    if (action === 'open') {
      await runOpen(row, true)
    } else if (action === 'download') {
      await runDownload(row, true)
    } else {
      await runMailAnalysis(row, true)
    }
  }

  const closeViewer = () => {
    setViewer((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl)
      return null
    })
  }

  return (
    <AdminShell>
      <Card className="p-6 border-slate-200 w-full">
        <h2 className="font-semibold text-slate-800 mb-1">Sincronizar notificaciones</h2>
        <p className="text-xs text-slate-500 mb-4">
          La sincronización consulta el listado en AEAT con todos los certificados de la cartera (sin abrir ni
          comparecer). El contenido se descarga solo cuando pulsas Abrir y confirmas.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={sync}
            disabled={syncing || certs.length === 0}
            className="bg-[#1B2A41] text-white hover:bg-[#152036] shrink-0"
          >
            {syncing
              ? 'Sincronizando...'
              : certs.length > 1
                ? `Sincronizar ${certs.length} certificados`
                : 'Sincronizar ahora'}
          </Button>
          {certs.length > 0 && (
            <span className="text-xs text-slate-500">
              {certs.length} certificado{certs.length > 1 ? 's' : ''} de la cartera
            </span>
          )}
        </div>
        {message && <p className="text-sm text-emerald-700 mt-3">{message}</p>}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 mt-6">
        <h3 className="font-semibold text-slate-800">Cartera de la gestoría</h3>
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

      <NotifTable
        rows={filterNotifications(agency, statusFilter)}
        totalCount={agency.length}
        statusFilter={statusFilter}
        onRequestAction={requestAction}
        actingId={actingId}
      />

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-md w-full p-6 border-slate-200 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-2">
              {confirmOpen.needsComparecer
                ? 'Comparecer en AEAT'
                : confirmOpen.action === 'mail'
                  ? 'Analizar notificación'
                  : confirmOpen.action === 'download'
                    ? 'Descargar notificación'
                    : 'Abrir notificación'}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {confirmOpen.needsComparecer
                ? confirmOpen.action === 'mail'
                  ? `Para redactar el correo al cliente hay que comparecer ante AEAT y descargar «${confirmOpen.row.subject}». Esta acción tiene efectos legales.`
                  : confirmOpen.action === 'download'
                    ? `Al descargar «${confirmOpen.row.subject}» se comparecerá ante AEAT. Esta acción tiene efectos legales.`
                    : `Al abrir «${confirmOpen.row.subject}» se comparecerá ante AEAT y se descargará el contenido. Esta acción tiene efectos legales.`
                : confirmOpen.action === 'mail'
                  ? `Se analizará «${confirmOpen.row.subject}» con IA y se propondrá un correo al cliente.`
                  : confirmOpen.action === 'download'
                    ? `¿Descargar el PDF de «${confirmOpen.row.subject}»?`
                    : `¿Mostrar el contenido de «${confirmOpen.row.subject}» en pantalla?`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(null)}>
                Cancelar
              </Button>
              <Button className="bg-[#1B2A41] text-white hover:bg-[#152036]" onClick={executeConfirm}>
                {confirmOpen.needsComparecer
                  ? confirmOpen.action === 'mail'
                    ? 'Comparecer y analizar'
                    : confirmOpen.action === 'download'
                      ? 'Comparecer y descargar'
                      : 'Comparecer y abrir'
                  : confirmOpen.action === 'mail'
                    ? 'Analizar y redactar'
                    : confirmOpen.action === 'download'
                      ? 'Descargar'
                      : 'Abrir'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {emailPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border-slate-200 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-slate-800">Correo al cliente</h3>
                <p className="text-xs text-slate-500 mt-1">{emailPanel.analysis.companyName}</p>
              </div>
              <Button variant="outline" size="sm" onClick={closeEmailPanel}>
                Cerrar
              </Button>
            </div>

            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 mb-4">
              <p className="text-xs font-medium text-slate-500 mb-1">Resumen (IA)</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{emailPanel.analysis.summary}</p>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Para</label>
                <p className="text-sm text-slate-800">{emailPanel.analysis.emailTo || '— (añade el email del cliente)'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Asunto</label>
                <p className="text-sm text-slate-800">{emailPanel.analysis.emailSubject}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Cuerpo propuesto</label>
                <p className="text-sm text-slate-700 whitespace-pre-wrap border border-slate-200 rounded-md p-3 bg-white">
                  {emailPanel.analysis.emailBody}
                </p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Adjunto: descarga el PDF antes de enviar el correo (mailto no permite adjuntar archivos automáticamente).
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => triggerPdfDownload(emailPanel.pdfBlob, emailPanel.fileName)}
              >
                Descargar PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const blobUrl = URL.createObjectURL(emailPanel.pdfBlob)
                  setViewer({
                    title: emailPanel.row.subject,
                    blobUrl,
                    fileName: emailPanel.fileName,
                  })
                }}
              >
                Ver documento
              </Button>
              <Button
                className="bg-[#1B2A41] text-white hover:bg-[#152036]"
                onClick={() => {
                  window.location.href = emailPanel.mailto
                }}
              >
                Abrir correo
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
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const anchor = document.createElement('a')
                    anchor.href = viewer.blobUrl
                    anchor.download = viewer.fileName.endsWith('.pdf')
                      ? viewer.fileName
                      : `${viewer.fileName}.pdf`
                    anchor.click()
                  }}
                >
                  Descargar
                </Button>
                <Button variant="outline" size="sm" onClick={closeViewer}>
                  Cerrar
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-neutral-100">
              <iframe
                src={`${viewer.blobUrl}#toolbar=1&navpanes=0`}
                title={viewer.title}
                className="h-full w-full min-h-[70vh] border-0"
              />
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  )
}

function AeatLogo() {
  const [imgFailed, setImgFailed] = useState(false)
  if (imgFailed) {
    return (
      <div
        className="h-7 w-7 rounded-sm bg-[#005EB8] flex items-center justify-center shrink-0"
        aria-label="AEAT"
      >
        <span className="text-[7px] font-bold text-white leading-none">AEAT</span>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={AEAT_LOGO_URL}
      alt="AEAT"
      width={28}
      height={28}
      className="rounded-sm shrink-0 h-7 w-7 object-contain bg-white"
      onError={() => setImgFailed(true)}
    />
  )
}

function ProviderBadge({ provider, sender }: { provider: string; sender: string | null }) {
  if (provider === 'aeat') {
    return (
      <div className="flex items-center gap-2">
        <AeatLogo />
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

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#1B2A41] disabled:opacity-40 disabled:pointer-events-none"
    >
      {children}
    </button>
  )
}

function IconOpen() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconDocument() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M12 18v-6M9 15h6" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function NotifTable({
  rows,
  totalCount,
  statusFilter,
  onRequestAction,
  actingId,
}: {
  rows: NotifRow[]
  totalCount: number
  statusFilter: StatusFilter
  onRequestAction: (action: ConfirmAction, row: NotifRow) => void
  actingId: string | null
}) {
  const colCount = 9
  const emptyMessage =
    statusFilter === 'pending'
      ? totalCount === 0
        ? 'Sin notificaciones. Sincroniza con AEAT para importarlas.'
        : 'Sin notificaciones pendientes. Cambia el filtro a "Todas" para ver las abiertas.'
      : 'Sin notificaciones'

  return (
    <Card className="border-slate-200 overflow-hidden w-full">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500">
        {statusFilter === 'pending' ? (
          <>
            <span className="font-medium text-slate-700">{rows.length} pendientes</span>
            {totalCount > rows.length && (
              <span>{` · ${totalCount - rows.length} abiertas (ocultas)`}</span>
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
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3 font-medium text-slate-600 min-w-[120px]">Empresa</th>
              <th className="text-left p-3 font-medium text-slate-600 min-w-[100px]">Organismo</th>
              <th className="text-left p-3 font-medium text-slate-600 whitespace-nowrap">Código</th>
              <th className="text-left p-3 font-medium text-slate-600 min-w-[180px]">Asunto</th>
              <th className="text-left p-3 font-medium text-slate-600 whitespace-nowrap">Emisión</th>
              <th className="text-left p-3 font-medium text-slate-600 whitespace-nowrap">Notificación</th>
              <th className="text-left p-3 font-medium text-slate-600 whitespace-nowrap">Caducidad</th>
              <th className="text-left p-3 font-medium text-slate-600 whitespace-nowrap">Estado</th>
              <th className="text-right p-3 font-medium text-slate-600 whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const opened = isOpenedNotification(n)
              const busy = actingId === n.id
              const caducidad = computeCaducidad(n)
              return (
                <tr key={n.id} className={`border-t border-slate-100 ${!opened ? 'bg-amber-50/40' : ''}`}>
                  <td className="p-3 text-slate-700 font-medium align-top break-words max-w-[160px]">
                    {n.companyName || 'Empresa'}
                  </td>
                  <td className="p-3 align-top break-words max-w-[140px]">
                    <ProviderBadge provider={n.provider} sender={n.sender} />
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-600 align-top whitespace-nowrap">{n.externalId || '—'}</td>
                  <td className="p-3 text-slate-700 align-top break-words">
                    <span className="whitespace-normal">{n.subject}</span>
                    {n.concept && n.concept !== n.subject && (
                      <span className="block text-[11px] text-slate-400 mt-0.5 whitespace-normal break-words">{n.concept}</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-600 align-top whitespace-nowrap">{fmtDate(n.receivedAt)}</td>
                  <td className="p-3 text-slate-600 align-top whitespace-nowrap">{fmtDate(n.readAt)}</td>
                  <td className={`p-3 align-top whitespace-nowrap ${deadlineClass(caducidad, opened)}`}>
                    {fmtDate(caducidad)}
                  </td>
                  <td className="p-3 align-top">
                    {opened ? (
                      <Badge variant="outline">Abierto</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Pendiente</Badge>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <IconButton
                        label="Abrir notificación"
                        disabled={busy}
                        onClick={() => onRequestAction('open', n)}
                      >
                        <IconOpen />
                      </IconButton>
                      <IconButton
                        label="Descargar PDF"
                        disabled={busy}
                        onClick={() => onRequestAction('download', n)}
                      >
                        <IconDocument />
                      </IconButton>
                      <IconButton
                        label="Correo con IA"
                        disabled={busy}
                        onClick={() => onRequestAction('mail', n)}
                      >
                        <IconMail />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="p-6 text-center text-slate-500">
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
