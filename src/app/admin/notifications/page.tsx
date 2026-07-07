'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { readAdminTokenFromUrl, useAdminSession } from '@/lib/admin-session-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { AEAT_LOGO_URL } from '@/lib/brand-assets'
import {
  AdminNewNotificationsBanner,
  acknowledgeNotificationBanner,
  shouldShowNotificationBanner,
  type AdminNewNotificationsAlert,
} from '@/components/admin/admin-new-notifications-banner'
import { NOTIFICATION_AUTO_SYNC_LABEL } from '@/lib/admin-integrations/notifications/notification-service'
import { NotificationAssigneeSelect, type NotificationTeamMember } from '@/components/admin/notification-assignee-select'
import {
  NotificationViewFilterSelect,
  type NotificationViewFilter,
} from '@/components/admin/notification-view-filter'
import {
  NotificationColumnHeader,
  TableToolbarHint,
  useNotificationTableView,
} from '@/components/admin/notification-table-controls'
import {
  NOTIFICATION_CATEGORIES,
  VACLY_NOTIFICATION_STATUSES,
} from '@/lib/admin-integrations/notifications/notification-workflow'

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
  tgssEstado?: number | null
  adminStatus: { code: string; label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }
  vaclyStatus: string
  vaclyStatusLabel: string
  category: string | null
  categoryLabel: string
  assignedUserId: string | null
  assignedUserName: string | null
  assignedUserAvatar: string | null
}

interface CertOption {
  id: string
  alias: string
  status: string
  companyName?: string | null
}

function fmtDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

function fmtDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

interface SyncSummaryState {
  lastUpdatedAt: string | null
  lastStatus: string | null
  lastStored: number | null
  lastFetched: number | null
}

function deadlineClass(deadline?: string | null, opened?: boolean): string {
  if (!deadline || opened) return 'text-slate-600'
  const days = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (days < 0) return 'text-red-600 font-medium'
  if (days <= 3) return 'text-amber-700 font-medium'
  return 'text-slate-600'
}

const PROVIDER_LABEL: Record<string, string> = { dehu: 'DEHú LEMA', aeat: 'AEAT', tgss: 'TGSS WSCN' }

function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] || provider.toUpperCase()
}

type StatusFilter = NotificationViewFilter

function isAdminPendingAccess(n: NotifRow): boolean {
  return n.adminStatus.tone === 'warning'
}

function isPendingNotification(n: NotifRow): boolean {
  return n.vaclyStatus !== 'cerrada'
}

function filterNotifications(rows: NotifRow[], statusFilter: StatusFilter): NotifRow[] {
  if (statusFilter === 'all') return rows
  if (statusFilter === 'vacly_active') return rows.filter(isPendingNotification)
  return rows.filter(isAdminPendingAccess)
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function computeCaducidad(n: NotifRow): string | null {
  if (n.accessDeadline) return n.accessDeadline
  const base = new Date(n.receivedAt)
  if (Number.isNaN(base.getTime())) return null
  return addCalendarDays(base, 10).toISOString()
}

function isOpenedNotification(n: NotifRow): boolean {
  return n.vaclyStatus !== 'pendiente'
}

function adminStatusBadgeClass(tone: NotifRow['adminStatus']['tone']): string {
  switch (tone) {
    case 'warning':
      return 'bg-amber-100 text-amber-900 hover:bg-amber-100'
    case 'success':
      return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
    case 'danger':
      return 'bg-red-100 text-red-800 hover:bg-red-100'
    default:
      return 'bg-slate-100 text-slate-700 hover:bg-slate-100'
  }
}

function countAdminPendingNotifications(rows: NotifRow[]): number {
  return rows.filter((n) => n.adminStatus.tone === 'warning').length
}

const compactSelectClass =
  'h-9 w-full max-w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]/30'

function needsComparecer(row: NotifRow): boolean {
  if (row.readAt) return false
  if (row.provider === 'aeat') return row.aeatEstado !== 'A'
  if (row.provider === 'tgss') return row.tgssEstado === 0 || row.tgssEstado == null
  return !row.hasDocument
}

interface EmailAnalysis {
  summary: string
  emailTo: string
  emailSubject: string
  emailBody: string
  emailBodyHtml: string
  companyName: string
  clientName: string
  language: string
  fileName: string
  cached: boolean
}

type ConfirmAction = 'open' | 'download' | 'mail'

const EMAIL_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'es', label: 'Español' },
  { code: 'ca', label: 'Català' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'gl', label: 'Galego' },
  { code: 'eu', label: 'Euskera' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
]

function languageLabel(code: string): string {
  return EMAIL_LANGUAGES.find((l) => l.code === code)?.label || code
}

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
  const { adminHeaders, sessionReady, token } = useAdminSession(companyId)
  const [agency, setAgency] = useState<NotifRow[]>([])
  const [teamsByCompanyId, setTeamsByCompanyId] = useState<Record<string, NotificationTeamMember[]>>({})
  const [certs, setCerts] = useState<CertOption[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('admin_pending')
  const [viewer, setViewer] = useState<{ title: string; url: string; blob: Blob; fileName: string } | null>(null)
  const [emailPanel, setEmailPanel] = useState<{
    row: NotifRow
    analysis: EmailAnalysis
    mailto: string
    pdfBlob: Blob
    fileName: string
  } | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [regenLanguage, setRegenLanguage] = useState<string>('es')
  const [languagePrompt, setLanguagePrompt] = useState<{ row: NotifRow; language: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState<{
    row: NotifRow
    needsComparecer: boolean
    action: ConfirmAction
  } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState<null | 'download' | 'print'>(null)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: 'download' | 'print'
    rows: NotifRow[]
    needsComparecer: boolean
  } | null>(null)
  const [syncSummary, setSyncSummary] = useState<SyncSummaryState | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [newNotifAlert, setNewNotifAlert] = useState<AdminNewNotificationsAlert | null>(null)

  const loadAgency = () => {
    if (!companyId) return
    fetch(`/api/admin/notifications?scope=agency&company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return
        const rows = (d.notifications || []) as NotifRow[]
        setAgency(rows)
        if (d.syncSummary) {
          setSyncSummary({
            lastUpdatedAt: d.syncSummary.lastUpdatedAt ?? null,
            lastStatus: d.syncSummary.lastStatus ?? null,
            lastStored: d.syncSummary.lastStored ?? null,
            lastFetched: d.syncSummary.lastFetched ?? null,
          })
        }
        const pending =
          typeof d.pendingCount === 'number' ? d.pendingCount : countAdminPendingNotifications(rows)
        setPendingCount(pending)

        const adminPendingRows = rows.filter((n) => n.adminStatus.tone === 'warning')
        const latestReceived = adminPendingRows.reduce<string | null>((max, row) => {
          if (!row.receivedAt) return max
          if (!max || new Date(row.receivedAt) > new Date(max)) return row.receivedAt
          return max
        }, null)

        if (companyId && shouldShowNotificationBanner(companyId, pending, latestReceived)) {
          setNewNotifAlert({
            pendingCount: pending,
            providersLabel: 'AEAT, TGSS y otras administraciones',
          })
        } else {
          setNewNotifAlert(null)
        }
        loadTeamsForRows(rows)
      })
      .catch(() => {})
  }

  const loadTeamsForRows = (rows: NotifRow[]) => {
    if (!companyId) return
    const ids = [...new Set(rows.map((r) => r.companyId).filter(Boolean))]
    if (ids.length === 0) {
      setTeamsByCompanyId({})
      return
    }
    const params = new URLSearchParams({
      company_id: companyId,
      for_companies: ids.join(','),
    })
    fetch(`/api/admin/notifications/team?${params.toString()}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.teams) {
          setTeamsByCompanyId(d.teams as Record<string, NotificationTeamMember[]>)
        }
      })
      .catch(() => {})
  }

  const patchWorkflow = async (
    row: NotifRow,
    patch: { vacly_status?: string; category?: string; assigned_user_id?: string | null },
  ) => {
    if (!companyId) return
    setActingId(row.id)
    setError('')
    try {
      const res = await fetch(`/api/admin/notifications/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          company_id: row.companyId,
          agency_company_id: companyId,
          ...patch,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.message || 'No se pudo actualizar la notificación')
        return
      }
      loadAgency()
    } catch {
      setError('Error de conexión al actualizar la notificación')
    } finally {
      setActingId(null)
    }
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
    if (!companyId || !sessionReady) return
    loadAgency()
    loadCerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, sessionReady])

  // Mantiene la selección coherente con los datos cargados.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set<string>()
      for (const n of agency) if (prev.has(n.id)) valid.add(n.id)
      return valid.size === prev.size ? prev : valid
    })
  }, [agency])

  const closeEmailPanel = () => {
    setEmailPanel(null)
    setCopyState('idle')
  }

  const documentUrl = (row: NotifRow, opts?: { download?: boolean }): string => {
    const params = new URLSearchParams({ company_id: row.companyId })
    if (row.certificateId) params.set('certificate_id', row.certificateId)
    const sessionToken = token ?? readAdminTokenFromUrl()
    if (sessionToken) params.set('token', sessionToken)
    if (opts?.download) params.set('download', '1')
    return `/api/admin/notifications/${row.id}/document?${params.toString()}`
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
    downloadBlob(blob, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
  }

  const downloadBlob = (blob: Blob, fileName: string) => {
    const blobUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = fileName
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (rows: NotifRow[]) => {
    setSelectedIds((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id))
      if (allSelected) {
        const next = new Set(prev)
        for (const r of rows) next.delete(r.id)
        return next
      }
      const next = new Set(prev)
      for (const r of rows) next.add(r.id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const requestBulk = (action: 'download' | 'print') => {
    setError('')
    const rows = agency.filter((n) => selectedIds.has(n.id))
    if (rows.length === 0) return
    // Si alguna no está en bóveda hay que pedirla a AEAT: confirmamos en bloque.
    const anyFetch = rows.some((r) => !r.hasDocument)
    if (anyFetch) {
      const anyComparecer = rows.some((r) => !r.hasDocument && needsComparecer(r))
      setBulkConfirm({ action, rows, needsComparecer: anyComparecer })
      return
    }
    void runBulk(action, rows)
  }

  const runBulk = async (action: 'download' | 'print', rows: NotifRow[]) => {
    setError('')
    setBulkBusy(action)
    setBulkProgress({ done: 0, total: rows.length })

    // El popup de impresión debe abrirse dentro del gesto del usuario (este
    // handler), si no Chrome lo bloquea. Lo abrimos vacío y luego lo poblamos.
    let printWin: Window | null = null
    if (action === 'print') {
      printWin = window.open('', '_blank')
      if (printWin) {
        printWin.document.write(
          '<!doctype html><title>Preparando impresión…</title><body style="font:14px system-ui;padding:24px;color:#334155">Preparando documentos para imprimir…</body>',
        )
      }
    }

    try {
      const collected: Array<{ name: string; blob: Blob }> = []
      const failures: string[] = []
      let done = 0
      for (const row of rows) {
        try {
          const blob = await fetchNotificationPdf(row, { confirm: !row.hasDocument })
          if (blob) {
            const base = sanitizeFileName(`${row.externalId || ''} ${row.subject}`.trim())
            collected.push({ name: `${base}.pdf`, blob })
          } else {
            failures.push(row.subject)
          }
        } catch {
          failures.push(row.subject)
        }
        done += 1
        setBulkProgress({ done, total: rows.length })
      }

      if (collected.length === 0) {
        setError('No se pudo obtener ningún documento de los seleccionados.')
        printWin?.close()
        return
      }

      if (action === 'download') {
        if (collected.length === 1) {
          triggerPdfDownload(collected[0].blob, collected[0].name)
        } else {
          const JSZip = (await import('jszip')).default
          const zip = new JSZip()
          const used = new Set<string>()
          collected.forEach(({ name, blob }, i) => {
            let fileName = name
            if (used.has(fileName)) fileName = `${i + 1}-${name}`
            used.add(fileName)
            zip.file(fileName, blob)
          })
          const content = await zip.generateAsync({ type: 'blob' })
          downloadBlob(content, 'notificaciones.zip')
        }
      } else {
        const { PDFDocument } = await import('pdf-lib')
        const merged = await PDFDocument.create()
        for (const { blob } of collected) {
          try {
            const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true })
            const pages = await merged.copyPages(src, src.getPageIndices())
            pages.forEach((p) => merged.addPage(p))
          } catch {
            /* PDF no combinable, se omite */
          }
        }
        const mergedBytes = await merged.save()
        const url = URL.createObjectURL(new Blob([mergedBytes as BlobPart], { type: 'application/pdf' }))
        if (printWin) {
          printWin.location.href = url
          const tryPrint = () => {
            try {
              printWin?.focus()
              printWin?.print()
            } catch {
              /* el usuario puede imprimir manualmente desde el visor */
            }
          }
          printWin.onload = () => setTimeout(tryPrint, 700)
          setTimeout(tryPrint, 1800)
        } else {
          // Popup bloqueado: descargamos el PDF combinado como alternativa.
          downloadBlob(new Blob([mergedBytes as BlobPart], { type: 'application/pdf' }), 'notificaciones.pdf')
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }

      if (failures.length > 0) {
        setError(`${failures.length} notificación(es) no se pudieron obtener.`)
      } else {
        setMessage(
          action === 'download'
            ? `${collected.length} notificación(es) descargada(s).`
            : `${collected.length} notificación(es) enviada(s) a impresión.`,
        )
      }
      clearSelection()
      loadAgency()
    } catch {
      setError('Error procesando las notificaciones seleccionadas.')
      printWin?.close()
    } finally {
      setBulkBusy(null)
      setBulkProgress(null)
    }
  }

  const executeBulkConfirm = () => {
    if (!bulkConfirm) return
    const { action, rows } = bulkConfirm
    setBulkConfirm(null)
    void runBulk(action, rows)
  }

  const dismissNewNotifBanner = () => {
    if (companyId) acknowledgeNotificationBanner(companyId)
    setNewNotifAlert(null)
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
    // Si no tenemos el PDF en bóveda, hay que pedirlo a AEAT: siempre pedimos
    // confirmación explícita al usuario antes de abrir/comparecer.
    if (!row.hasDocument) {
      setConfirmOpen({ row, needsComparecer: needsComparecer(row), action })
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
      // El fetch comparece (si procede) y guarda el PDF en bóveda. Después
      // mostramos el documento desde la URL directa de la API (no blob): Chrome
      // bloquea los blob: en iframes anidados, pero sí renderiza una URL real.
      const blob = await fetchNotificationPdf(row, { confirm: withConfirm })
      if (!blob) return
      setViewer({
        title: row.subject,
        url: documentUrl(row),
        blob,
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

  const runMailAnalysis = async (
    row: NotifRow,
    withConfirm: boolean,
    language?: string,
    regenerate?: boolean,
  ) => {
    if (!row.companyId) return

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
          ...(language ? { language } : {}),
          ...(regenerate ? { regenerate: 1 } : {}),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        // El cliente no tiene idioma de referencia: pedimos a la gestoría que elija.
        if (data.code === 'LANGUAGE_REQUIRED') {
          const suggested = (data.details?.suggestedLanguage as string) || 'es'
          setRegenLanguage(suggested)
          setLanguagePrompt({ row, language: suggested })
          return
        }
        setError(data.message || 'No se pudo analizar la notificación')
        return
      }

      const blob = await fetchNotificationPdf(row, { confirm: false })
      if (!blob) return

      const analysis = data.analysis as EmailAnalysis
      const mailto = buildMailtoLink(analysis.emailTo, analysis.emailSubject, analysis.emailBody)

      setRegenLanguage(analysis.language || 'es')
      setLanguagePrompt(null)
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

  const copyEmailToClipboard = async () => {
    if (!emailPanel) return
    const { analysis } = emailPanel
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({
          'text/html': new Blob([analysis.emailBodyHtml], { type: 'text/html' }),
          'text/plain': new Blob([analysis.emailBody], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else {
        await navigator.clipboard.writeText(analysis.emailBody)
      }
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setError('No se pudo copiar el correo al portapapeles')
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
    setViewer(null)
  }

  return (
    <AdminShell>
      <AdminNewNotificationsBanner alert={newNotifAlert} onDismiss={dismissNewNotifBanner} />
      <Card className="p-6 border-slate-200 w-full">
        <h2 className="font-semibold text-slate-800 mb-1">Sincronizar notificaciones</h2>
        <p className="text-xs text-slate-500 mb-4">
          La sincronización consulta el listado en AEAT y TGSS WSCN con todos los certificados de la cartera (sin abrir ni
          comparecer). El contenido se descarga solo cuando pulsas Abrir y confirmas.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
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
          <div className="flex min-w-0 flex-col items-end gap-0.5 text-right text-xs text-slate-600">
            <p>
              <span className="font-medium text-slate-700">Última actualización:</span>{' '}
              {syncSummary?.lastUpdatedAt ? fmtDateTime(syncSummary.lastUpdatedAt) : 'Aún no se ha sincronizado'}
              {syncSummary?.lastUpdatedAt && syncSummary.lastStored != null && (
                <span className="text-slate-500">
                  {' '}
                  · {syncSummary.lastStored} nueva{syncSummary.lastStored === 1 ? '' : 's'} de{' '}
                  {syncSummary.lastFetched ?? 0} recibidas
                </span>
              )}
            </p>
            <p className="text-slate-500">
              Sincronización automática programada a las {NOTIFICATION_AUTO_SYNC_LABEL} (hora peninsular).
              {pendingCount > 0 && (
                <span className="text-amber-700 font-medium">
                  {' '}
                  · {pendingCount} pendiente{pendingCount === 1 ? '' : 's'} ante la administración
                </span>
              )}
            </p>
          </div>
        </div>
        {message && <p className="text-sm text-emerald-700 mt-3">{message}</p>}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 mt-6">
        <h3 className="font-semibold text-slate-800">Cartera de la gestoría</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Mostrar</span>
          <NotificationViewFilterSelect value={statusFilter} onChange={setStatusFilter} />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-md border border-[#1B2A41]/20 bg-[#1B2A41]/5 px-4 py-2.5">
          <span className="text-sm font-medium text-slate-700">
            {selectedIds.size} seleccionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          {bulkProgress && (
            <span className="text-xs text-slate-500">
              Procesando {bulkProgress.done}/{bulkProgress.total}…
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={!!bulkBusy}
              onClick={() => requestBulk('download')}
            >
              {bulkBusy === 'download' ? 'Descargando…' : 'Descargar (ZIP)'}
            </Button>
            <Button
              size="sm"
              className="bg-[#1B2A41] text-white hover:bg-[#152036]"
              disabled={!!bulkBusy}
              onClick={() => requestBulk('print')}
            >
              {bulkBusy === 'print' ? 'Preparando…' : 'Imprimir todas'}
            </Button>
            <Button variant="ghost" size="sm" disabled={!!bulkBusy} onClick={clearSelection}>
              Limpiar
            </Button>
          </div>
        </div>
      )}

      <NotifTable
        rows={filterNotifications(agency, statusFilter)}
        totalCount={agency.length}
        statusFilter={statusFilter}
        onRequestAction={requestAction}
        actingId={actingId}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        teamsByCompanyId={teamsByCompanyId}
        onWorkflowChange={patchWorkflow}
      />

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-md w-full p-6 border-slate-200 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-2">
              {confirmOpen.needsComparecer
                ? `Comparecer en ${providerLabel(confirmOpen.row.provider)}`
                : confirmOpen.action === 'mail'
                  ? 'Analizar notificación'
                  : confirmOpen.action === 'download'
                    ? 'Descargar notificación'
                    : 'Abrir notificación'}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {confirmOpen.needsComparecer
                ? confirmOpen.action === 'mail'
                  ? `Para redactar el correo al cliente hay que comparecer ante ${providerLabel(confirmOpen.row.provider)} y descargar «${confirmOpen.row.subject}». Esta acción tiene efectos legales.`
                  : confirmOpen.action === 'download'
                    ? `Al descargar «${confirmOpen.row.subject}» se comparecerá ante ${providerLabel(confirmOpen.row.provider)}. Esta acción tiene efectos legales.`
                    : `Al abrir «${confirmOpen.row.subject}» se comparecerá ante ${providerLabel(confirmOpen.row.provider)} y se descargará el contenido. Esta acción tiene efectos legales.`
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
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-0 border-slate-200 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-white">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800 truncate">Correo al cliente</h3>
                <p className="text-xs text-slate-500 truncate">
                  {emailPanel.analysis.companyName}
                  {' · '}
                  {languageLabel(emailPanel.analysis.language)}
                  {emailPanel.analysis.cached ? ' · guardado' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={copyEmailToClipboard}>
                  {copyState === 'copied' ? 'Copiado ✓' : 'Copiar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerPdfDownload(emailPanel.pdfBlob, emailPanel.fileName)}
                >
                  Descargar PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setViewer({
                      title: emailPanel.row.subject,
                      url: documentUrl(emailPanel.row),
                      blob: emailPanel.pdfBlob,
                      fileName: emailPanel.fileName,
                    })
                  }
                >
                  Ver PDF
                </Button>
                <Button
                  size="sm"
                  className="bg-[#1B2A41] text-white hover:bg-[#152036]"
                  onClick={() => {
                    window.location.href = emailPanel.mailto
                  }}
                >
                  Abrir correo
                </Button>
                <button
                  type="button"
                  aria-label="Cerrar"
                  title="Cerrar"
                  onClick={closeEmailPanel}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-500 mb-1">Resumen (IA)</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{emailPanel.analysis.summary}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-sm">
                <span className="text-xs font-medium text-slate-500 sm:pt-0.5">Para</span>
                <span className="text-slate-800 break-all">
                  {emailPanel.analysis.emailTo || '— (añade el email del cliente)'}
                </span>
                <span className="text-xs font-medium text-slate-500 sm:pt-0.5">Asunto</span>
                <span className="text-slate-800">{emailPanel.analysis.emailSubject}</span>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Vista previa del correo</label>
                <div
                  className="email-html-preview mt-1 text-sm text-slate-800 leading-relaxed border border-slate-200 rounded-md p-4 bg-white"
                  dangerouslySetInnerHTML={{ __html: emailPanel.analysis.emailBodyHtml }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-500">Idioma</span>
                <select
                  value={regenLanguage}
                  onChange={(e) => setRegenLanguage(e.target.value)}
                  className="h-8 rounded-md border border-slate-300 px-2 text-sm bg-white"
                >
                  {EMAIL_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actingId === emailPanel.row.id}
                  onClick={() => runMailAnalysis(emailPanel.row, false, regenLanguage, true)}
                >
                  {actingId === emailPanel.row.id ? 'Regenerando…' : 'Regenerar en este idioma'}
                </Button>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                «Copiar» pega el correo con formato en Gmail/Outlook. Recuerda adjuntar el PDF descargado antes de
                enviar (el cliente de correo no permite adjuntarlo automáticamente).
              </div>
            </div>
          </Card>
        </div>
      )}

      {bulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-md w-full p-6 border-slate-200 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-2">
              {bulkConfirm.action === 'download'
                ? `Descargar ${bulkConfirm.rows.length} notificaciones`
                : `Imprimir ${bulkConfirm.rows.length} notificaciones`}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {bulkConfirm.needsComparecer
                ? `Algunas notificaciones aún no se han abierto: al ${
                    bulkConfirm.action === 'download' ? 'descargarlas' : 'imprimirlas'
                  } se comparecerá ante el organismo emisor (AEAT o TGSS) y se descargará su contenido. Esta acción tiene efectos legales.`
                : `Se ${
                    bulkConfirm.action === 'download' ? 'descargarán' : 'prepararán para imprimir'
                  } las notificaciones seleccionadas.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkConfirm(null)}>
                Cancelar
              </Button>
              <Button className="bg-[#1B2A41] text-white hover:bg-[#152036]" onClick={executeBulkConfirm}>
                {bulkConfirm.needsComparecer
                  ? bulkConfirm.action === 'download'
                    ? 'Comparecer y descargar'
                    : 'Comparecer e imprimir'
                  : bulkConfirm.action === 'download'
                    ? 'Descargar'
                    : 'Imprimir'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {languagePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-w-md w-full p-6 border-slate-200 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-2">Idioma del correo</h3>
            <p className="text-sm text-slate-600 mb-4">
              No hay un correo anterior de referencia para este cliente. Elige el idioma en el que quieres redactar el
              correo. Se guardará para próximas notificaciones.
            </p>
            <select
              value={regenLanguage}
              onChange={(e) => setRegenLanguage(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm bg-white mb-4"
            >
              {EMAIL_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLanguagePrompt(null)}>
                Cancelar
              </Button>
              <Button
                className="bg-[#1B2A41] text-white hover:bg-[#152036]"
                disabled={actingId === languagePrompt.row.id}
                onClick={() => runMailAnalysis(languagePrompt.row, true, regenLanguage)}
              >
                {actingId === languagePrompt.row.id ? 'Generando…' : 'Generar correo'}
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
                  onClick={() => triggerPdfDownload(viewer.blob, viewer.fileName)}
                >
                  Descargar
                </Button>
                <button
                  type="button"
                  aria-label="Cerrar"
                  title="Cerrar"
                  onClick={closeViewer}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <IconClose />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-neutral-100">
              <iframe
                src={`${viewer.url}#toolbar=1&navpanes=0`}
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
      <div className="flex items-center justify-start gap-2 text-left">
        <AeatLogo />
        <div className="min-w-0 text-left">
          <span className="text-xs font-medium text-slate-700">AEAT</span>
          {sender && <span className="block text-[11px] text-slate-400 leading-tight">{sender}</span>}
        </div>
      </div>
    )
  }
  return (
    <div className="text-left">
      <Badge variant="secondary">{PROVIDER_LABEL[provider] || provider}</Badge>
      {sender && <span className="block text-[11px] text-slate-400 mt-0.5 text-left">{sender}</span>}
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

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function NotifTable({
  rows,
  totalCount,
  statusFilter,
  onRequestAction,
  actingId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  teamsByCompanyId,
  onWorkflowChange,
}: {
  rows: NotifRow[]
  totalCount: number
  statusFilter: StatusFilter
  onRequestAction: (action: ConfirmAction, row: NotifRow) => void
  actingId: string | null
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: (rows: NotifRow[]) => void
  teamsByCompanyId: Record<string, NotificationTeamMember[]>
  onWorkflowChange: (
    row: NotifRow,
    patch: { vacly_status?: string; category?: string; assigned_user_id?: string | null },
  ) => void
}) {
  const {
    displayedRows,
    sortColumn,
    sortDirection,
    columnFilters,
    filterOptions,
    handleSort,
    handleFilterChange,
    clearAllFilters,
    activeFilterCount,
  } = useNotificationTableView(rows)

  const colCount = 12
  const allSelected = displayedRows.length > 0 && displayedRows.every((r) => selectedIds.has(r.id))
  const someSelected = displayedRows.some((r) => selectedIds.has(r.id))
  const emptyMessage =
    statusFilter === 'admin_pending'
      ? totalCount === 0
        ? 'Sin notificaciones. Sincroniza con AEAT y TGSS para importarlas.'
        : displayedRows.length === 0
          ? 'Ninguna notificación coincide con los filtros de columna.'
          : 'Sin notificaciones pendientes. Cambia el filtro para ver el resto.'
      : statusFilter === 'vacly_active'
        ? totalCount === 0
          ? 'Sin notificaciones. Sincroniza con AEAT y TGSS para importarlas.'
          : displayedRows.length === 0
            ? 'Ninguna notificación coincide con los filtros de columna.'
            : 'Sin notificaciones activas en Vacly. Cambia el filtro a "Todas" para ver las cerradas.'
        : displayedRows.length === 0
          ? totalCount === 0
            ? 'Sin notificaciones'
            : 'Ninguna notificación coincide con los filtros de columna.'
          : 'Sin notificaciones'

  return (
    <Card className="border-slate-200 w-full max-w-full overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80">
        <TableToolbarHint
          shown={displayedRows.length}
          total={rows.length}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearAllFilters}
        >
          {statusFilter === 'admin_pending' ? (
            <>
              <span className="font-medium text-slate-700">{displayedRows.length} pendientes</span>
              {totalCount > rows.length && (
                <span>{` · ${totalCount - rows.length} ocultas por vista`}</span>
              )}
            </>
          ) : statusFilter === 'vacly_active' ? (
            <>
              <span className="font-medium text-slate-700">{displayedRows.length} activas visibles</span>
              {totalCount > rows.length && (
                <span>{` · ${totalCount - rows.length} cerradas (ocultas por vista)`}</span>
              )}
            </>
          ) : (
            <span>
              <span className="font-medium text-slate-700">{displayedRows.length} visibles</span>
              {totalCount > 0 && (
                <span>{` · ${rows.filter(isPendingNotification).length} activas en cartera`}</span>
              )}
            </span>
          )}
        </TableToolbarHint>
      </div>

      {/* Vista móvil / tablet: tarjetas apiladas, sin scroll horizontal */}
      <div className="lg:hidden divide-y divide-slate-100">
        {displayedRows.map((n) => (
          <NotifMobileCard
            key={n.id}
            row={n}
            busy={actingId === n.id}
            selected={selectedIds.has(n.id)}
            onToggleSelect={onToggleSelect}
            onRequestAction={onRequestAction}
            onWorkflowChange={onWorkflowChange}
            members={teamsByCompanyId[n.companyId] ?? []}
          />
        ))}
        {displayedRows.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">{emptyMessage}</p>
        )}
      </div>

      {/* Vista escritorio: tabla fluida dentro del ancho del iframe */}
      <div className="hidden lg:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-10" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[5.75rem]" />
            <col className="w-[7.5rem]" />
          </colgroup>
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 w-10 text-center align-middle">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas visibles"
                  className="h-4 w-4 rounded border-slate-300 align-middle"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && someSelected
                  }}
                  onChange={() => onToggleSelectAll(displayedRows)}
                />
              </th>
              <NotificationColumnHeader
                label="Empresa"
                sortKey="company"
                filterKey="company"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={filterOptions.company}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Organismo"
                sortKey="provider"
                filterKey="provider"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={filterOptions.provider}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Asunto"
                sortKey="subject"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={[]}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Tipo"
                sortKey="category"
                filterKey="category"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={filterOptions.category}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Emisión"
                sortKey="receivedAt"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={[]}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Caducidad"
                sortKey="deadline"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={[]}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Estado administración"
                sortKey="adminStatus"
                filterKey="adminStatus"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={filterOptions.adminStatus}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Estado Vacly"
                sortKey="vaclyStatus"
                filterKey="vaclyStatus"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={filterOptions.vaclyStatus}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <NotificationColumnHeader
                label="Responsable"
                sortKey="assignee"
                filterKey="assignee"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filterOptions={filterOptions.assignee}
                columnFilters={columnFilters}
                onFilterChange={handleFilterChange}
              />
              <th className="p-2 text-center font-medium text-slate-600 text-xs align-middle whitespace-normal leading-tight">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((n) => (
              <NotifDesktopRow
                key={n.id}
                row={n}
                busy={actingId === n.id}
                selected={selectedIds.has(n.id)}
                onToggleSelect={onToggleSelect}
                onRequestAction={onRequestAction}
                onWorkflowChange={onWorkflowChange}
                members={teamsByCompanyId[n.companyId] ?? []}
              />
            ))}
            {displayedRows.length === 0 && (
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

type NotifRowHandlers = {
  row: NotifRow
  busy: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onRequestAction: (action: ConfirmAction, row: NotifRow) => void
  onWorkflowChange: (
    row: NotifRow,
    patch: { vacly_status?: string; category?: string; assigned_user_id?: string | null },
  ) => void
  members: NotificationTeamMember[]
}

function NotifActionButtons({
  row,
  busy,
  onRequestAction,
}: Pick<NotifRowHandlers, 'row' | 'busy' | 'onRequestAction'>) {
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      <IconButton label="Abrir notificación" disabled={busy} onClick={() => onRequestAction('open', row)}>
        <IconOpen />
      </IconButton>
      <IconButton label="Descargar PDF" disabled={busy} onClick={() => onRequestAction('download', row)}>
        <IconDocument />
      </IconButton>
      <IconButton label="Correo con IA" disabled={busy} onClick={() => onRequestAction('mail', row)}>
        <IconMail />
      </IconButton>
    </div>
  )
}

function NotifDesktopRow({
  row: n,
  busy,
  selected,
  onToggleSelect,
  onRequestAction,
  onWorkflowChange,
  members,
}: NotifRowHandlers) {
  const pendingVacly = n.vaclyStatus === 'pendiente'
  const caducidad = computeCaducidad(n)

  return (
    <tr
      className={`border-t border-slate-100 ${
        selected ? 'bg-[#1B2A41]/5' : pendingVacly ? 'bg-amber-50/40' : ''
      }`}
    >
      <td className="p-2 w-10 text-center align-middle">
        <input
          type="checkbox"
          aria-label="Seleccionar notificación"
          className="h-4 w-4 rounded border-slate-300 align-middle"
          checked={selected}
          onChange={() => onToggleSelect(n.id)}
        />
      </td>
      <td className="p-2 text-slate-700 font-medium align-middle text-center text-xs">
        <span className="block break-words whitespace-normal">{n.companyName || '—'}</span>
      </td>
      <td className="p-2 align-middle text-left">
        <ProviderBadge provider={n.provider} sender={n.sender} />
      </td>
      <td className="p-2 text-slate-700 align-middle break-words text-xs">
        {n.externalId && (
          <span className="block font-mono text-[11px] text-slate-500 mb-0.5">{n.externalId}</span>
        )}
        <span className="whitespace-normal">{n.subject}</span>
        {n.concept && n.concept !== n.subject && (
          <span className="block text-[11px] text-slate-400 mt-0.5 whitespace-normal break-words">{n.concept}</span>
        )}
      </td>
      <td className="p-2 align-middle text-center">
        <select
          className={compactSelectClass}
          value={n.category || 'otro'}
          disabled={busy}
          onChange={(e) => onWorkflowChange(n, { category: e.target.value })}
        >
          {NOTIFICATION_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 text-slate-600 align-middle whitespace-normal text-center text-xs">{fmtDate(n.receivedAt)}</td>
      <td className={`p-2 align-middle whitespace-normal text-center text-xs ${deadlineClass(caducidad, !pendingVacly)}`}>
        {fmtDate(caducidad)}
      </td>
      <td className="p-2 align-middle text-center">
        <Badge className={adminStatusBadgeClass(n.adminStatus.tone)} title={`Código: ${n.adminStatus.code}`}>
          {n.adminStatus.label}
        </Badge>
      </td>
      <td className="p-2 align-middle text-center">
        <select
          className={compactSelectClass}
          value={n.vaclyStatus}
          disabled={busy}
          onChange={(e) => onWorkflowChange(n, { vacly_status: e.target.value })}
        >
          {VACLY_NOTIFICATION_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 align-middle text-center">
        <div className="flex justify-center">
          <NotificationAssigneeSelect
            value={n.assignedUserId}
            members={members}
            disabled={busy}
            onChange={(userId) => onWorkflowChange(n, { assigned_user_id: userId })}
          />
        </div>
      </td>
      <td className="p-2 align-middle">
        <NotifActionButtons row={n} busy={busy} onRequestAction={onRequestAction} />
      </td>
    </tr>
  )
}

function NotifMobileCard({
  row: n,
  busy,
  selected,
  onToggleSelect,
  onRequestAction,
  onWorkflowChange,
  members,
}: NotifRowHandlers) {
  const pendingVacly = n.vaclyStatus === 'pendiente'
  const caducidad = computeCaducidad(n)

  return (
    <article
      className={`p-4 space-y-3 ${selected ? 'bg-[#1B2A41]/5' : pendingVacly ? 'bg-amber-50/40' : 'bg-white'}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label="Seleccionar notificación"
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
          checked={selected}
          onChange={() => onToggleSelect(n.id)}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-800">{n.companyName || '—'}</span>
            <ProviderBadge provider={n.provider} sender={null} />
          </div>
          {n.externalId && <p className="font-mono text-[11px] text-slate-500 break-all">{n.externalId}</p>}
          <p className="text-sm text-slate-800 break-words">{n.subject}</p>
          {n.concept && n.concept !== n.subject && (
            <p className="text-xs text-slate-500 break-words">{n.concept}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>Emisión: {fmtDate(n.receivedAt)}</span>
            <span className={deadlineClass(caducidad, !pendingVacly)}>Caducidad: {fmtDate(caducidad)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-slate-500">Tipo</span>
          <select
            className={compactSelectClass}
            value={n.category || 'otro'}
            disabled={busy}
            onChange={(e) => onWorkflowChange(n, { category: e.target.value })}
          >
            {NOTIFICATION_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-slate-500">Estado Vacly</span>
          <select
            className={compactSelectClass}
            value={n.vaclyStatus}
            disabled={busy}
            onChange={(e) => onWorkflowChange(n, { vacly_status: e.target.value })}
          >
            {VACLY_NOTIFICATION_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-slate-500">Responsable</span>
          <NotificationAssigneeSelect
            value={n.assignedUserId}
            members={members}
            disabled={busy}
            onChange={(userId) => onWorkflowChange(n, { assigned_user_id: userId })}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={adminStatusBadgeClass(n.adminStatus.tone)} title={`Código: ${n.adminStatus.code}`}>
          {n.adminStatus.label}
        </Badge>
      </div>

      <NotifActionButtons row={n} busy={busy} onRequestAction={onRequestAction} />
    </article>
  )
}
