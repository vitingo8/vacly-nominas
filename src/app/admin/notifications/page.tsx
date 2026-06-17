'use client'

import { useEffect, useState, type ReactNode } from 'react'
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
  return !!(n.readAt || n.hasDocument || n.aeatEstado === 'A')
}

function isPendingNotification(n: NotifRow): boolean {
  return !isOpenedNotification(n)
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
  const [mine, setMine] = useState<NotifRow[]>([])
  const [agency, setAgency] = useState<NotifRow[]>([])
  const [certs, setCerts] = useState<CertOption[]>([])
  const [selectedCertIds, setSelectedCertIds] = useState<string[]>([])
  const [certPickerOpen, setCertPickerOpen] = useState(false)
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
    id: string
    subject: string
    rowCompanyId?: string
    omitCertOverride?: boolean
    needsComparecer: boolean
    action: ConfirmAction
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

  const primaryCertId = selectedCertIds[0] || ''

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
          setSelectedCertIds((prev) => {
            const valid = prev.filter((id) => options.some((c: CertOption) => c.id === id))
            if (valid.length > 0) return valid
            return options[0] ? [options[0].id] : []
          })
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

  useEffect(() => {
    return () => {
      if (viewer?.blobUrl) URL.revokeObjectURL(viewer.blobUrl)
    }
  }, [viewer?.blobUrl])

  const closeEmailPanel = () => {
    setEmailPanel(null)
  }

  const fetchNotificationPdf = async (
    id: string,
    subject: string,
    rowCompanyId?: string,
    omitCertOverride?: boolean,
    options?: { download?: boolean; confirm?: boolean },
  ): Promise<Blob | null> => {
    const targetCompanyId = rowCompanyId || companyId
    if (!targetCompanyId) return null
    const needsConfirm = options?.confirm ?? !([...mine, ...agency].find((n) => n.id === id)?.hasDocument)
    if (needsConfirm && !omitCertOverride && !primaryCertId) {
      setError('Selecciona al menos un certificado para acceder al documento.')
      return null
    }

    const params = new URLSearchParams({ company_id: targetCompanyId })
    if (needsConfirm) params.set('confirm', '1')
    if (options?.download) params.set('download', '1')
    if (!omitCertOverride && primaryCertId) params.set('certificate_id', primaryCertId)

    const res = await fetch(`/api/admin/notifications/${id}/document?${params}`, {
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
    if (!companyId || selectedCertIds.length === 0) {
      setError('Selecciona al menos un certificado para sincronizar.')
      return
    }
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/notifications/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ company_id: companyId, certificate_ids: selectedCertIds }),
      })
      const data = await res.json()
      if (data.success) {
        const certResults = (data.certificateResults || []) as Array<{ certificateId: string; error?: string }>
        const certErrors = certResults.filter((r) => r.error).length
        setMessage(
          `Sincronización completada: ${data.stored} nuevas de ${data.fetched} recibidas` +
            (selectedCertIds.length > 1 ? ` (${selectedCertIds.length} certificados)` : '') +
            (certErrors > 0 ? ` · ${certErrors} certificado(s) con error` : '') +
            '.',
        )
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

  const toggleCert = (id: string) => {
    setSelectedCertIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  const requestAction = (
    action: ConfirmAction,
    row: NotifRow,
    rowCompanyId?: string,
    omitCertOverride?: boolean,
  ) => {
    if (!row.hasDocument) {
      setConfirmOpen({
        id: row.id,
        subject: row.subject,
        rowCompanyId,
        omitCertOverride,
        needsComparecer: isPendingNotification(row),
        action,
      })
      return
    }

    if (action === 'open') {
      void runOpen(row.id, row.subject, rowCompanyId, omitCertOverride, false)
    } else if (action === 'download') {
      void runDownload(row, rowCompanyId, omitCertOverride, false)
    } else {
      void runMailAnalysis(row, rowCompanyId, omitCertOverride, false)
    }
  }

  const runOpen = async (
    id: string,
    subject: string,
    rowCompanyId?: string,
    omitCertOverride?: boolean,
    needsConfirm = true,
  ) => {
    setActingId(id)
    setError('')
    try {
      const blob = await fetchNotificationPdf(id, subject, rowCompanyId, omitCertOverride, {
        confirm: needsConfirm,
      })
      if (!blob) return
      const blobUrl = URL.createObjectURL(blob)
      const row = [...mine, ...agency].find((n) => n.id === id)
      setViewer({
        title: row?.subject || subject,
        blobUrl,
        fileName: sanitizeFileName(row?.subject || subject),
      })
      loadMine()
      loadAgency()
    } catch {
      setError('Error de conexion al abrir la notificación')
    } finally {
      setActingId(null)
    }
  }

  const runDownload = async (
    row: NotifRow,
    rowCompanyId?: string,
    omitCertOverride?: boolean,
    needsConfirm = true,
  ) => {
    setActingId(row.id)
    setError('')
    try {
      const blob = await fetchNotificationPdf(row.id, row.subject, rowCompanyId, omitCertOverride, {
        download: true,
        confirm: needsConfirm,
      })
      if (!blob) return
      triggerPdfDownload(blob, sanitizeFileName(row.subject))
      loadMine()
      loadAgency()
    } catch {
      setError('Error de conexion al descargar la notificación')
    } finally {
      setActingId(null)
    }
  }

  const runMailAnalysis = async (
    row: NotifRow,
    rowCompanyId?: string,
    omitCertOverride?: boolean,
    needsConfirm = true,
  ) => {
    const targetCompanyId = rowCompanyId || companyId
    if (!targetCompanyId) return
    if (needsConfirm && !omitCertOverride && !primaryCertId) {
      setError('Selecciona un certificado para analizar la notificación.')
      return
    }

    setActingId(row.id)
    setError('')
    try {
      const res = await fetch(`/api/admin/notifications/${row.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          company_id: targetCompanyId,
          confirm: needsConfirm ? 1 : 0,
          ...(omitCertOverride ? {} : { certificate_id: primaryCertId }),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.message || 'No se pudo analizar la notificación')
        return
      }

      const blob = await fetchNotificationPdf(row.id, row.subject, rowCompanyId, omitCertOverride, {
        confirm: false,
      })
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
      loadMine()
      loadAgency()
    } catch {
      setError('Error de conexion al preparar el correo')
    } finally {
      setActingId(null)
    }
  }

  const executeConfirm = async () => {
    if (!confirmOpen) return
    const { id, subject, rowCompanyId, omitCertOverride, action } = confirmOpen
    setConfirmOpen(null)

    if (action === 'open') {
      await runOpen(id, subject, rowCompanyId, omitCertOverride, true)
    } else if (action === 'download') {
      const row = [...mine, ...agency].find((n) => n.id === id)
      if (row) await runDownload(row, rowCompanyId, omitCertOverride, true)
    } else {
      const row = [...mine, ...agency].find((n) => n.id === id)
      if (row) await runMailAnalysis(row, rowCompanyId, omitCertOverride, true)
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
          La sincronización solo consulta el listado en AEAT (sin abrir ni comparecer). El contenido se descarga
          únicamente cuando tú pulsas Abrir y confirmas.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <div className="relative min-w-[min(100%,420px)] flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => setCertPickerOpen((v) => !v)}
              className="w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-slate-400"
            >
              <span className="truncate text-slate-700">
                {selectedCertIds.length === 0
                  ? 'Selecciona certificados…'
                  : `${selectedCertIds.length} certificado${selectedCertIds.length > 1 ? 's' : ''} seleccionado${selectedCertIds.length > 1 ? 's' : ''}`}
              </span>
              <span className="text-slate-400 text-xs shrink-0">{certPickerOpen ? '▲' : '▼'}</span>
            </button>
            {certPickerOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">Certificados de la cartera</span>
                  <button
                    type="button"
                    className="text-xs text-[#1B2A41] hover:underline"
                    onClick={() =>
                      setSelectedCertIds(
                        selectedCertIds.length === certs.length ? [] : certs.map((c) => c.id),
                      )
                    }
                  >
                    {selectedCertIds.length === certs.length ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
                {certs.length === 0 && (
                  <p className="p-3 text-sm text-slate-500">Sin certificados disponibles</p>
                )}
                {certs.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCertIds.includes(c.id)}
                      onChange={() => toggleCert(c.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{c.alias}</span>
                      {c.companyName && (
                        <span className="block text-xs text-slate-500 truncate">{c.companyName}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button
            onClick={sync}
            disabled={syncing || selectedCertIds.length === 0}
            className="bg-[#1B2A41] text-white hover:bg-[#152036] shrink-0"
          >
            {syncing
              ? 'Sincronizando...'
              : selectedCertIds.length > 1
                ? `Sincronizar ${selectedCertIds.length} certificados`
                : 'Sincronizar ahora'}
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
            onRequestAction={requestAction}
            actingId={actingId}
          />
        </TabsContent>
        <TabsContent value="agency">
          <NotifTable
            rows={filterNotifications(agency, statusFilter)}
            totalCount={agency.length}
            statusFilter={statusFilter}
            onRequestAction={requestAction}
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
                  ? `Para redactar el correo al cliente hay que comparecer ante AEAT y descargar «${confirmOpen.subject}». Esta acción tiene efectos legales.`
                  : confirmOpen.action === 'download'
                    ? `Al descargar «${confirmOpen.subject}» se comparecerá ante AEAT. Esta acción tiene efectos legales.`
                    : `Al abrir «${confirmOpen.subject}» se comparecerá ante AEAT y se descargará el contenido. Esta acción tiene efectos legales.`
                : confirmOpen.action === 'mail'
                  ? `Se analizará «${confirmOpen.subject}» con IA y se propondrá un correo al cliente.`
                  : confirmOpen.action === 'download'
                    ? `¿Descargar el PDF de «${confirmOpen.subject}»?`
                    : `¿Mostrar el contenido de «${confirmOpen.subject}» en pantalla?`}
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
      src="/brands/aeat.png"
      alt="AEAT"
      width={28}
      height={28}
      className="rounded-sm shrink-0 h-7 w-7 object-contain"
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
  showCompany = false,
  useRowCompanyId = false,
}: {
  rows: NotifRow[]
  totalCount: number
  statusFilter: StatusFilter
  onRequestAction: (
    action: ConfirmAction,
    row: NotifRow,
    rowCompanyId?: string,
    omitCertOverride?: boolean,
  ) => void
  actingId: string | null
  showCompany?: boolean
  useRowCompanyId?: boolean
}) {
  const colCount = showCompany ? 9 : 8
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
        <table className="w-full text-sm min-w-[1280px]">
          <thead className="bg-slate-50">
            <tr>
              {showCompany && <th className="text-left p-3 font-medium text-slate-600">Empresa</th>}
              <th className="text-left p-3 font-medium text-slate-600">Organismo</th>
              <th className="text-left p-3 font-medium text-slate-600">Código</th>
              <th className="text-left p-3 font-medium text-slate-600">Asunto</th>
              <th className="text-left p-3 font-medium text-slate-600">Emisión</th>
              <th className="text-left p-3 font-medium text-slate-600">Notificación</th>
              <th className="text-left p-3 font-medium text-slate-600">Caducidad</th>
              <th className="text-left p-3 font-medium text-slate-600">Estado</th>
              <th className="text-right p-3 font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const opened = isOpenedNotification(n)
              const busy = actingId === n.id
              const actionCompanyId = useRowCompanyId ? n.companyId : undefined
              const caducidad = computeCaducidad(n)
              return (
                <tr key={n.id} className={`border-t border-slate-100 ${!opened ? 'bg-amber-50/40' : ''}`}>
                  {showCompany && (
                    <td className="p-3 text-slate-700 font-medium">{n.companyName || 'Empresa'}</td>
                  )}
                  <td className="p-3">
                    <ProviderBadge provider={n.provider} sender={n.sender} />
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-600 whitespace-nowrap">{n.externalId || '—'}</td>
                  <td className="p-3 text-slate-700 max-w-[280px]">
                    <span className="line-clamp-2">{n.subject}</span>
                    {n.concept && n.concept !== n.subject && (
                      <span className="block text-[11px] text-slate-400 line-clamp-1 mt-0.5">{n.concept}</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-600 whitespace-nowrap">{fmtDate(n.receivedAt)}</td>
                  <td className="p-3 text-slate-600 whitespace-nowrap">{fmtDate(n.readAt)}</td>
                  <td className={`p-3 whitespace-nowrap ${deadlineClass(caducidad, opened)}`}>
                    {fmtDate(caducidad)}
                  </td>
                  <td className="p-3">
                    {opened ? (
                      <Badge variant="outline">Abierto</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Pendiente</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <IconButton
                        label="Abrir notificación"
                        disabled={busy}
                        onClick={() => onRequestAction('open', n, actionCompanyId, useRowCompanyId)}
                      >
                        <IconOpen />
                      </IconButton>
                      <IconButton
                        label="Descargar PDF"
                        disabled={busy}
                        onClick={() => onRequestAction('download', n, actionCompanyId, useRowCompanyId)}
                      >
                        <IconDocument />
                      </IconButton>
                      <IconButton
                        label="Correo con IA"
                        disabled={busy}
                        onClick={() => onRequestAction('mail', n, actionCompanyId, useRowCompanyId)}
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
