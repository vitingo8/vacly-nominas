'use client'

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  findVaultMatchForWindows,
  findWindowsMatchForVault,
  matchesCertSearch,
  parseCertSubject,
} from '@/lib/admin-integrations/certificate-vault/cert-subject-parser'
import { formatCertIssuer } from '@/lib/admin-integrations/certificate-vault/cert-text-encoding'
import { deriveCertificateStatus } from '@/lib/admin-integrations/certificate-vault/certificate-vault-service'
import {
  activateWindowsBridge,
} from '@/lib/admin-integrations/certificate-vault/windows-bridge-activate'
import {
  base64ToPfxFile,
  exportWindowsCertificate,
  fileToBase64,
  installWindowsCertificate,
  isWindowsClient,
  listWindowsCertificates,
  probeWindowsCertBridge,
  type WindowsCertificateEntry,
} from '@/lib/admin-integrations/certificate-vault/windows-cert-bridge'
import { WindowsBridgeBanner } from '@/components/admin/windows-bridge-banner'
import { CertDetailDialog, type CertDetailData } from '@/components/admin/cert-detail-dialog'
import {
  CertExpiryFullscreenAlert,
  dismissExpiryAlert,
  isExpiryAlertDismissed,
  milestoneForCertDays,
  type CertExpiryAlertItem,
} from '@/components/admin/cert-expiry-fullscreen-alert'
import { CertExpiryNotificationsDialog } from '@/components/admin/cert-expiry-notifications-dialog'
import { CertRowActions } from '@/components/admin/cert-row-actions'
import { CertActivityLogPanel } from '@/components/admin/cert-activity'
import { CertPermissionsDialog } from '@/components/admin/cert-permissions-dialog'
import { CertScopePickerDialog } from '@/components/admin/cert-scope-picker-dialog'
import { useAdminSession } from '@/lib/admin-session-client'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { DEFAULT_CORPORATE_BRAND, type CorporateBrand } from '@/lib/corporate-brand'
import {
  resolveCertificateOrigin,
  type AccountCompany,
} from '@/lib/admin-integrations/certificate-vault/cert-origin-resolver'

type CertStatus = 'valid' | 'expiring_soon' | 'expired' | 'revoked'
type CertOrigin = 'windows' | 'vacly' | 'agency' | 'unassigned'

interface CertRow {
  id: string
  alias: string
  holderNif: string | null
  holderName?: string | null
  issuer?: string | null
  serialNumber?: string | null
  certificateType?: string | null
  validFrom?: string | null
  validTo?: string | null
  status: CertStatus
  daysToExpiry: number | null
  companyId?: string
  companyName?: string | null
  expiryNotificationsEnabled?: boolean
  expiryNotificationMilestones?: number[]
  portfolioScope?: 'own' | 'portfolio' | null
  linkedCompanyId?: string | null
  accessMode?: 'open' | 'restricted' | null
  createdBy?: string | null
  renewedFromCertificateId?: string | null
}

interface UnifiedRow {
  key: string
  origin: CertOrigin
  originLabel: string
  companyName: string
  titular: string
  nif: string | null
  issuer: string
  expiry: string
  statusLabel: string
  statusVariant: 'default' | 'secondary' | 'destructive' | 'outline'
  vaclyCert?: CertRow
  windowsCert?: WindowsCertificateEntry
  needsScopeChoice?: boolean
}

const STATUS_LABEL: Record<CertStatus, string> = {
  valid: 'Vigente',
  expiring_soon: 'Caduca pronto',
  expired: 'Caducado',
  revoked: 'Revocado',
}

const STATUS_VARIANT: Record<CertStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  valid: 'default',
  expiring_soon: 'secondary',
  expired: 'destructive',
  revoked: 'outline',
}

const ORIGIN_LABEL: Record<CertOrigin, string> = {
  windows: 'Windows',
  vacly: 'Vacly',
  agency: 'Cartera',
  unassigned: 'Sin clasificar',
}

const TYPE_LABEL: Record<string, string> = {
  persona_fisica: 'Persona física',
  representante: 'Representante',
  sello_empresa: 'Sello de empresa',
}

import {
  DASHBOARD_CARD,
  DASHBOARD_CARD_HEADER,
  DASHBOARD_EYEBROW,
  DASHBOARD_ICON_BTN,
  DASHBOARD_INPUT_LG,
  DASHBOARD_INPUT_MD,
  DASHBOARD_OUTLINE_BTN,
  DASHBOARD_PILL_GROUP,
  DASHBOARD_PRIMARY_BTN,
  DASHBOARD_ROW,
  DASHBOARD_SUBTITLE,
  DASHBOARD_TABLE_HEAD,
  DASHBOARD_TD,
  DASHBOARD_TH,
  DASHBOARD_TITLE,
  dashboardPillClass,
} from '@/components/admin/dashboard-styles'

function fmtDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

function certDisplayCompanyName(
  cert: { alias?: string; companyName?: string | null },
  fallback: string,
): string {
  return cert.alias?.trim() || cert.companyName?.trim() || fallback
}

function findPendingExpiryAlerts(source: CertRow[]): CertExpiryAlertItem[] {
  const candidates: CertExpiryAlertItem[] = []
  for (const c of source) {
    if (c.status === 'revoked' || c.expiryNotificationsEnabled === false || !c.validTo) continue
    const milestone = milestoneForCertDays(c.daysToExpiry, c.expiryNotificationMilestones)
    if (!milestone || isExpiryAlertDismissed(c.id, milestone)) continue
    candidates.push({
      certId: c.id,
      alias: c.alias,
      titular: c.holderName || c.alias,
      companyName: certDisplayCompanyName(c, c.companyName || 'Esta empresa'),
      validTo: c.validTo,
      daysToExpiry: c.daysToExpiry ?? milestone,
      milestone,
    })
  }
  candidates.sort((a, b) => a.milestone - b.milestone || a.daysToExpiry - b.daysToExpiry)
  return candidates
}

export default function AdminCertificatesPage() {
  const companyId = useCompanyId()
  const { adminHeaders, sessionReady } = useAdminSession(companyId)
  const [accountCerts, setAccountCerts] = useState<CertRow[]>([])
  const [accountCompanies, setAccountCompanies] = useState<AccountCompany[]>([])
  const [corporateBrand, setCorporateBrand] = useState<CorporateBrand>(DEFAULT_CORPORATE_BRAND)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const [isWindows, setIsWindows] = useState(false)
  const [bridgeReady, setBridgeReady] = useState(false)
  const [bridgeLoading, setBridgeLoading] = useState(false)
  const [windowsCerts, setWindowsCerts] = useState<WindowsCertificateEntry[]>([])
  const [registerThumb, setRegisterThumb] = useState<string | null>(null)
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerAlias, setRegisterAlias] = useState('')

  const [uploadAlias, setUploadAlias] = useState('')
  const [uploadPassword, setUploadPassword] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [installInWindows, setInstallInWindows] = useState(true)
  const [nominasOrigin, setNominasOrigin] = useState('https://vacly-nominas.vercel.app')
  const [detailCert, setDetailCert] = useState<CertDetailData | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [expiryAlert, setExpiryAlert] = useState<CertExpiryAlertItem | null>(null)
  const [scopePickerCert, setScopePickerCert] = useState<CertRow | null>(null)
  const [scopeSaving, setScopeSaving] = useState(false)
  const [notificationCert, setNotificationCert] = useState<CertRow | null>(null)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [permissionsCert, setPermissionsCert] = useState<CertRow | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [vaultLoaded, setVaultLoaded] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | CertStatus | 'windows'>('all')

  useEffect(() => {
    if (typeof window !== 'undefined') setNominasOrigin(window.location.origin)
  }, [])

  const loadAccount = useCallback((): Promise<void> => {
    if (!companyId) return Promise.resolve()
    return fetch(`/api/admin/config/certificates?scope=agency&company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok || !d.success) {
          throw new Error(d.message || 'No se pudo cargar los certificados de la bóveda')
        }
        return d
      })
      .then((d) => {
        setAccountCerts(d.certificates || [])
        setAccountCompanies(d.accountCompanies || [])
        if (d.brand) setCorporateBrand(d.brand)
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Error cargando la bóveda de certificados'
        setError(
          msg.includes('Token') || msg.includes('sesion')
            ? `${msg}. En localhost, asegúrate de tener ADMIN_SESSION_SECRET en .env.local.`
            : msg,
        )
      })
      .finally(() => {
        setVaultLoaded(true)
      })
  }, [companyId])

  const refreshWindowsStore = useCallback(async () => {
    setBridgeLoading(true)
    setError('')
    try {
      let ready = await probeWindowsCertBridge()
      if (!ready && isWindowsClient()) {
        const result = await activateWindowsBridge(probeWindowsCertBridge, nominasOrigin, {
          downloadIfMissing: false,
        })
        ready = result === 'connected' || (await probeWindowsCertBridge())
      }
      setBridgeReady(ready)
      if (!ready) {
        setWindowsCerts([])
        return
      }
      setWindowsCerts(await listWindowsCertificates())
    } catch (e) {
      setBridgeReady(false)
      setWindowsCerts([])
      setError(e instanceof Error ? e.message : 'Error leyendo certificados de Windows')
    } finally {
      setBridgeLoading(false)
    }
  }, [nominasOrigin])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      const tasks: Promise<void>[] = [loadAccount()]
      if (isWindowsClient()) tasks.push(refreshWindowsStore())
      await Promise.all(tasks)
    } finally {
      setRefreshing(false)
    }
  }, [loadAccount, refreshWindowsStore])

  useEffect(() => {
    setVaultLoaded(false)
    const win = isWindowsClient()
    setIsWindows(win)
    if (!companyId || !sessionReady) return
    loadAccount()
    if (win) void refreshWindowsStore()
  }, [companyId, sessionReady, loadAccount, refreshWindowsStore])

  const onBridgeConnected = useCallback(() => {
    setBridgeReady(true)
    void refreshWindowsStore()
  }, [refreshWindowsStore])

  const allVaclyCerts = useMemo(() => accountCerts, [accountCerts])

  useEffect(() => {
    setExpiryAlert(findPendingExpiryAlerts(allVaclyCerts)[0] ?? null)
  }, [allVaclyCerts])

  // Cadena de renovaciones: etiqueta corta para enlazar predecesor/sucesor.
  const renewalChainLabel = (c: CertRow): string => {
    const name = c.holderName?.trim() || c.alias
    return c.validTo ? `${name} (hasta ${fmtDate(c.validTo)})` : name
  }

  const findRenewalLinks = (
    cert: CertRow | undefined,
  ): Pick<CertDetailData, 'renewedFrom' | 'renewedTo'> => {
    if (!cert) return { renewedFrom: null, renewedTo: null }
    const predecessor = cert.renewedFromCertificateId
      ? allVaclyCerts.find((c) => c.id === cert.renewedFromCertificateId)
      : undefined
    const successor = allVaclyCerts.find((c) => c.renewedFromCertificateId === cert.id)
    return {
      renewedFrom: predecessor ? { id: predecessor.id, label: renewalChainLabel(predecessor) } : null,
      renewedTo: successor ? { id: successor.id, label: renewalChainLabel(successor) } : null,
    }
  }

  const buildDetailFromRow = (row: UnifiedRow): CertDetailData => {
    const cert = row.vaclyCert
    const wc = row.windowsCert
    const validToRaw = cert?.validTo ?? wc?.notAfter ?? null
    const { daysToExpiry } = validToRaw
      ? deriveCertificateStatus(validToRaw, cert?.status === 'revoked' ? new Date().toISOString() : null)
      : { daysToExpiry: null as number | null }
    return {
      ...findRenewalLinks(cert),
      originLabel: row.originLabel,
      companyName: row.companyName,
      titular: row.titular,
      alias: cert?.alias ?? wc?.friendlyName ?? null,
      nif: row.nif,
      issuer: formatCertIssuer(cert?.issuer ?? wc?.issuer ?? row.issuer),
      issuerFull: wc?.issuer ?? cert?.issuer ?? null,
      expiry: row.expiry,
      validFrom: cert?.validFrom ? fmtDate(cert.validFrom) : wc?.notBefore ? fmtDate(wc.notBefore) : null,
      validToRaw,
      serialNumber: cert?.serialNumber ?? wc?.serialNumber ?? null,
      certificateType: cert?.certificateType ?? null,
      statusLabel: row.statusLabel,
      statusVariant: row.statusVariant,
      thumbprint: wc?.thumbprint ?? null,
      expiryNotificationsEnabled: cert?.expiryNotificationsEnabled,
      expiryNotificationMilestones: cert?.expiryNotificationMilestones,
      daysToExpiry: cert?.daysToExpiry ?? daysToExpiry,
      organizationalUnit: wc?.organizationalUnit ?? null,
      subjectDn: wc?.subject ?? null,
      certificateId: cert?.id ?? null,
      ownerCompanyId: cert?.companyId ?? companyId ?? null,
    }
  }

  // Detalle construido solo desde la bóveda (para navegar por la cadena de
  // renovaciones, donde el predecesor suele estar revocado y fuera de la tabla).
  const buildDetailFromVaultCert = (cert: CertRow): CertDetailData => ({
    ...findRenewalLinks(cert),
    originLabel: 'Vacly',
    companyName: certDisplayCompanyName(cert, cert.companyName || '—'),
    titular: cert.holderName?.trim() || cert.alias,
    alias: cert.alias,
    nif: cert.holderNif,
    issuer: formatCertIssuer(cert.issuer ?? null),
    issuerFull: cert.issuer ?? null,
    expiry: fmtDate(cert.validTo),
    validFrom: cert.validFrom ? fmtDate(cert.validFrom) : null,
    validToRaw: cert.validTo ?? null,
    serialNumber: cert.serialNumber ?? null,
    certificateType: cert.certificateType ?? null,
    statusLabel: STATUS_LABEL[cert.status],
    statusVariant: STATUS_VARIANT[cert.status],
    expiryNotificationsEnabled: cert.expiryNotificationsEnabled,
    expiryNotificationMilestones: cert.expiryNotificationMilestones,
    daysToExpiry: cert.daysToExpiry,
    certificateId: cert.id,
    ownerCompanyId: cert.companyId ?? companyId ?? null,
  })

  const openDetailForCertId = (certificateId: string) => {
    const cert = allVaclyCerts.find((c) => c.id === certificateId)
    if (!cert) return
    setDetailCert(buildDetailFromVaultCert(cert))
    setDetailOpen(true)
  }

  const openDetail = (row: UnifiedRow) => {
    setDetailCert(buildDetailFromRow(row))
    setDetailOpen(true)
    // Trazabilidad: consulta del detalle de un certificado de Vacly.
    const cert = row.vaclyCert
    if (cert?.id) {
      const targetCompanyId = cert.companyId || companyId
      if (targetCompanyId) {
        void fetch('/api/admin/config/certificates/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...adminHeaders() },
          body: JSON.stringify({ company_id: targetCompanyId, certificate_id: cert.id }),
        }).catch(() => {})
      }
    }
  }

  const saveExpiryNotifications = async (cert: CertRow, enabled: boolean, milestones: number[]) => {
    const targetCompanyId = cert.companyId || companyId
    if (!targetCompanyId) return
    setNotificationSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/config/certificates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          company_id: targetCompanyId,
          id: cert.id,
          expiry_notifications_enabled: enabled,
          expiry_notification_milestones: milestones,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message || 'No se pudo actualizar los avisos')
      }
      const patch = (list: CertRow[]) =>
        list.map((c) =>
          c.id === cert.id
            ? { ...c, expiryNotificationsEnabled: enabled, expiryNotificationMilestones: milestones }
            : c,
        )
      setAccountCerts(patch)
      if (!enabled && expiryAlert?.certId === cert.id) {
        setExpiryAlert(null)
      }
      setNotificationCert(null)
      setMessage(enabled ? 'Avisos de caducidad actualizados.' : 'Avisos de caducidad desactivados.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar avisos')
    } finally {
      setNotificationSaving(false)
    }
  }

  const assignPortfolioScope = async (cert: CertRow, scope: 'own' | 'portfolio') => {
    const ownerCompanyId = cert.companyId || companyId
    if (!ownerCompanyId || !companyId) return
    setScopeSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/config/certificates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          company_id: ownerCompanyId,
          id: cert.id,
          portfolio_scope: scope,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message || 'No se pudo clasificar el certificado')
      }
      setScopePickerCert(null)
      setMessage(scope === 'own' ? 'Certificado clasificado como de tu empresa.' : 'Certificado clasificado en cartera.')
      loadAccount()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al clasificar')
    } finally {
      setScopeSaving(false)
    }
  }

  const dismissExpiryPopup = () => {
    if (!expiryAlert) return
    dismissExpiryAlert(expiryAlert.certId, expiryAlert.milestone)
    const remaining = findPendingExpiryAlerts(allVaclyCerts).filter(
      (a) => !(a.certId === expiryAlert.certId && a.milestone === expiryAlert.milestone),
    )
    setExpiryAlert(remaining[0] ?? null)
  }

  const filteredAccountCerts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return accountCerts
    return accountCerts.filter((c) => {
      const blob = [c.alias, c.holderName, c.holderNif, c.issuer, c.companyName, c.serialNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return q.split(/\s+/).every((t) => blob.includes(t))
    })
  }, [accountCerts, search])

  const filteredWindows = useMemo(() => {
    return windowsCerts.filter((wc) => {
      const parsed = parseCertSubject(wc.subject, wc.friendlyName)
      return matchesCertSearch(parsed, wc.issuer, search)
    })
  }, [windowsCerts, search])

  const unifiedRows = useMemo((): UnifiedRow[] => {
    const rows: UnifiedRow[] = []
    if (!companyId) return rows

    const loggedInName =
      accountCompanies.find((c) => c.companyId === companyId)?.name || 'Esta empresa'

    const matchedWindowsThumbs = new Set<string>()

    // 1. Bóveda Vacly (Supabase) primero — fuente de verdad para estado y acciones.
    for (const c of filteredAccountCerts) {
      const winMatch =
        bridgeReady ? findWindowsMatchForVault(c, filteredWindows) : undefined
      if (winMatch?.thumbprint) matchedWindowsThumbs.add(winMatch.thumbprint)

      const resolved = resolveCertificateOrigin(
        {
          holderNif: c.holderNif,
          holderName: c.holderName,
          portfolioScope: c.portfolioScope,
          linkedCompanyId: c.linkedCompanyId,
        },
        companyId,
        accountCompanies,
      )

      let origin: CertOrigin
      let originLabel: string
      let companyName: string
      let needsScopeChoice = false

      if (resolved.origin === 'own') {
        origin = 'vacly'
        originLabel = ORIGIN_LABEL.vacly
        companyName = certDisplayCompanyName(c, resolved.linkedCompanyName || loggedInName)
      } else if (resolved.origin === 'portfolio') {
        origin = 'agency'
        originLabel = ORIGIN_LABEL.agency
        companyName = certDisplayCompanyName(
          c,
          resolved.linkedCompanyName || c.companyName || resolved.linkedCompanyCif || '—',
        )
      } else {
        origin = 'unassigned'
        originLabel = ORIGIN_LABEL.unassigned
        companyName = c.alias?.trim() || '—'
        needsScopeChoice = true
      }

      rows.push({
        key: `cert-${c.id}`,
        origin,
        originLabel,
        companyName,
        titular: c.holderName || c.alias,
        nif: c.holderNif,
        issuer: formatCertIssuer(c.issuer),
        expiry: fmtDate(c.validTo),
        statusLabel: STATUS_LABEL[c.status],
        statusVariant: STATUS_VARIANT[c.status],
        vaclyCert: c,
        windowsCert: winMatch,
        needsScopeChoice,
      })
    }

    // 2. Windows solo si no hay registro en la bóveda (tras cargar Supabase).
    if (bridgeReady && vaultLoaded) {
      for (const wc of filteredWindows) {
        if (matchedWindowsThumbs.has(wc.thumbprint)) continue
        if (findVaultMatchForWindows(wc, accountCerts)) continue
        const notExportable = wc.exportable === false
        rows.push({
          key: `win-${wc.thumbprint}`,
          origin: 'windows',
          originLabel: ORIGIN_LABEL.windows,
          companyName: wc.organization || '—',
          titular: wc.displayName || '—',
          nif: wc.nif || null,
          issuer: formatCertIssuer(wc.issuer),
          expiry: fmtDate(wc.notAfter),
          statusLabel: notExportable ? 'Solo Windows · no exportable' : 'Solo Windows',
          statusVariant: 'outline',
          windowsCert: wc,
        })
      }
    }

    return rows
  }, [
    bridgeReady,
    filteredWindows,
    filteredAccountCerts,
    accountCerts,
    accountCompanies,
    companyId,
    vaultLoaded,
  ])

  const rowStatusKey = (row: UnifiedRow): CertStatus | 'windows' =>
    row.vaclyCert ? row.vaclyCert.status : 'windows'

  const statusCounts = useMemo(() => {
    const counts = { all: unifiedRows.length, valid: 0, expiring_soon: 0, expired: 0, revoked: 0, windows: 0 }
    for (const row of unifiedRows) counts[rowStatusKey(row)] += 1
    return counts
  }, [unifiedRows])

  const visibleRows = useMemo(
    () => (statusFilter === 'all' ? unifiedRows : unifiedRows.filter((r) => rowStatusKey(r) === statusFilter)),
    [unifiedRows, statusFilter],
  )

  const uploadPfx = async (
    pfxFile: File,
    certAlias: string,
    certPassword: string,
    source: 'manual_upload' | 'windows_import' = 'manual_upload',
  ) => {
    if (!companyId) return null
    const fd = new FormData()
    fd.set('company_id', companyId)
    fd.set('alias', certAlias)
    fd.set('password', certPassword)
    fd.set('pfx', pfxFile)
    fd.set('source', source)

    const res = await fetch('/api/admin/config/certificates', {
      method: 'POST',
      body: fd,
      headers: adminHeaders(),
    })
    const data = await res.json()
    if (!data.success) {
      throw new Error(data.message || 'Error al registrar el certificado')
    }
    const saved = data.certificate as CertRow
    await maybeOfferRenewal(saved, data.renewalCandidate)
    return saved
  }

  /** Si el titular ya tenía un certificado, ofrece sustituirlo heredando su configuración. */
  const maybeOfferRenewal = async (
    saved: CertRow | null,
    candidate: { id: string; alias: string; validTo?: string | null } | null | undefined,
  ) => {
    if (!saved?.id || !candidate?.id || !companyId) return
    const expiry = candidate.validTo ? ` (caduca ${fmtDate(candidate.validTo)})` : ''
    const accepted = confirm(
      `Este titular ya tiene el certificado "${candidate.alias}"${expiry} en Vacly.\n\n` +
        '¿Es una renovación? El nuevo certificado heredará su alias, clasificación, avisos y permisos, ' +
        'y el anterior quedará archivado.',
    )
    if (!accepted) return
    try {
      const res = await fetch('/api/admin/config/certificates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          company_id: companyId,
          id: saved.id,
          replace_certificate_id: candidate.id,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message || 'No se pudo completar la renovación')
      }
      setMessage('Certificado renovado: configuración y permisos heredados, el anterior queda archivado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al renovar el certificado')
    }
  }

  const registerWindowsCert = async (thumbprint: string) => {
    setMessage('')
    setError('')
    const selected = windowsCerts.find((c) => c.thumbprint === thumbprint)
    if (!selected) return
    if (!registerPassword) {
      setError('Introduce la contraseña del certificado.')
      return
    }

    setUploading(true)
    try {
      const { pfxBase64, fileName } = await exportWindowsCertificate(thumbprint, registerPassword)
      const pfxFile = base64ToPfxFile(pfxBase64, fileName)
      const alias = registerAlias.trim() || selected.displayName || 'Certificado Windows'
      const saved = await uploadPfx(pfxFile, alias, registerPassword, 'windows_import')
      setMessage(
        `Certificado de ${saved?.holderName || saved?.holderNif || alias} guardado en Vacly. Sigue disponible en Windows.`,
      )
      setRegisterThumb(null)
      setRegisterPassword('')
      setRegisterAlias('')
      loadAccount()
      await refreshWindowsStore()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar en Vacly')
    } finally {
      setUploading(false)
    }
  }

  const uploadNewCert = async () => {
    setMessage('')
    setError('')
    if (!uploadFile || !uploadAlias) {
      setError('Indica un alias y selecciona el fichero del certificado.')
      return
    }
    if (!uploadPassword) {
      setError('Introduce la contraseña del certificado.')
      return
    }

    setUploading(true)
    try {
      const saved = await uploadPfx(uploadFile, uploadAlias, uploadPassword)
      let winNote = ''
      if (installInWindows && bridgeReady) {
        const b64 = await fileToBase64(uploadFile)
        await installWindowsCertificate(b64, uploadPassword, uploadAlias)
        winNote = ' También instalado en Windows.'
        await refreshWindowsStore()
      } else if (installInWindows && !bridgeReady) {
        winNote = ' No se pudo instalar en Windows: inicia el puente local.'
      }
      setMessage(
        `Certificado de ${saved?.holderName || saved?.holderNif || uploadAlias} guardado en Vacly.${winNote}`,
      )
      setUploadAlias('')
      setUploadPassword('')
      setUploadFile(null)
      setShowAddForm(false)
      loadAccount()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar el certificado')
    } finally {
      setUploading(false)
    }
  }

  const revoke = async (id: string) => {
    if (!companyId) return
    if (!confirm('Revocar elimina el material cifrado de Vacly. El certificado en Windows no se borra. ¿Continuar?')) return
    const res = await fetch(
      `/api/admin/config/certificates?company_id=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: adminHeaders() },
    )
    const data = await res.json()
    if (data.success) {
      loadAccount()
    } else {
      setError(data.message || 'Error al revocar')
    }
  }

  return (
    <AdminShell>
      <CertExpiryFullscreenAlert alert={expiryAlert} onDismiss={dismissExpiryPopup} />
      <CertExpiryNotificationsDialog
        open={Boolean(notificationCert)}
        onOpenChange={(open) => {
          if (!open) setNotificationCert(null)
        }}
        titular={notificationCert?.holderName || notificationCert?.alias || '—'}
        enabled={notificationCert?.expiryNotificationsEnabled !== false}
        milestones={notificationCert?.expiryNotificationMilestones ?? [60, 30]}
        loading={notificationSaving}
        brand={corporateBrand}
        onSave={(enabled, milestones) => {
          if (notificationCert) void saveExpiryNotifications(notificationCert, enabled, milestones)
        }}
      />
      <CertPermissionsDialog
        open={Boolean(permissionsCert)}
        onOpenChange={(open) => {
          if (!open) setPermissionsCert(null)
        }}
        titular={permissionsCert?.holderName || permissionsCert?.alias || '—'}
        companyId={permissionsCert?.companyId || companyId || ''}
        certificateId={permissionsCert?.id || null}
        adminHeaders={adminHeaders}
        onAccessModeChanged={(mode) => {
          setAccountCerts((prev) =>
            prev.map((c) => (c.id === permissionsCert?.id ? { ...c, accessMode: mode } : c)),
          )
        }}
      />
      <CertScopePickerDialog
        open={Boolean(scopePickerCert)}
        onOpenChange={(open) => {
          if (!open) setScopePickerCert(null)
        }}
        titular={scopePickerCert?.holderName || scopePickerCert?.alias || '—'}
        nif={scopePickerCert?.holderNif || null}
        loading={scopeSaving}
        onChooseOwn={() => {
          if (scopePickerCert) void assignPortfolioScope(scopePickerCert, 'own')
        }}
        onChoosePortfolio={() => {
          if (scopePickerCert) void assignPortfolioScope(scopePickerCert, 'portfolio')
        }}
      />
      <CertDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        cert={detailCert}
        typeLabels={TYPE_LABEL}
        adminHeaders={adminHeaders}
        onNavigateToCertificate={openDetailForCertId}
      />

      {isWindows && !bridgeReady && (
        <WindowsBridgeBanner nominasOrigin={nominasOrigin} onConnected={onBridgeConnected} />
      )}

      <div className={cn(DASHBOARD_CARD, 'w-full p-4 sm:p-5')}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            placeholder="Buscar por DNI/NIF, nombre, empresa, emisor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(DASHBOARD_INPUT_LG, 'w-full flex-1')}
          />
          <div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
            <div className={DASHBOARD_PILL_GROUP}>
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing || bridgeLoading}
                title="Actualizar lista"
                aria-label="Actualizar lista"
                className={cn(DASHBOARD_ICON_BTN, refreshing && 'animate-pulse')}
              >
                <ArrowPathIcon
                  className={cn('h-5 w-5', (refreshing || bridgeLoading) && 'animate-spin')}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className={DASHBOARD_PRIMARY_BTN}
            >
              {showAddForm ? 'Cerrar formulario' : 'Añadir certificado'}
            </button>
          </div>
        </div>
      </div>

      {(message || error) && (
        <div className="space-y-1 w-full">
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {showAddForm && (
        <div className={cn(DASHBOARD_CARD, 'w-full')}>
          <div className={DASHBOARD_CARD_HEADER}>
            <p className={DASHBOARD_EYEBROW}>Alta manual</p>
            <h2 className={cn(DASHBOARD_TITLE, 'mt-1')}>Añadir certificado (.pfx / .p12)</h2>
            <p className={cn(DASHBOARD_SUBTITLE, 'mt-1')}>
              Se guarda cifrado en Vacly. Opcionalmente se instala también en el almacén de Windows de
              este equipo.
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4 lg:items-end">
            <Input
              placeholder="Alias"
              value={uploadAlias}
              onChange={(e) => setUploadAlias(e.target.value)}
              className={DASHBOARD_INPUT_MD}
            />
            <Input
              type="password"
              placeholder="Contraseña del certificado"
              value={uploadPassword}
              onChange={(e) => setUploadPassword(e.target.value)}
              className={DASHBOARD_INPUT_MD}
            />
            <Input
              type="file"
              accept=".pfx,.p12"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className={cn(DASHBOARD_INPUT_MD, 'file:mr-2 file:rounded-md file:border-0 file:bg-[#F6F8FA] file:px-2 file:text-xs file:font-medium file:text-[#1B2A41]')}
            />
            <Button
              onClick={() => void uploadNewCert()}
              disabled={uploading}
              className={cn(DASHBOARD_PRIMARY_BTN, 'w-full')}
            >
              {uploading ? 'Guardando…' : 'Guardar en Vacly'}
            </Button>
          </div>
          {isWindows && (
            <label className="flex cursor-pointer items-center gap-2 border-t border-[#1B2A41]/8 px-4 py-3 text-sm text-[#5C6B7F] sm:px-5">
              <input
                type="checkbox"
                checked={installInWindows}
                onChange={(e) => setInstallInWindows(e.target.checked)}
                className="rounded border-[#1B2A41]/20 accent-[#1B2A41]"
              />
              Instalar también en Windows (requiere puente activo)
            </label>
          )}
        </div>
      )}

      <div className={cn(DASHBOARD_CARD, 'w-full')}>
        <div className={DASHBOARD_CARD_HEADER}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={DASHBOARD_EYEBROW}>Inventario</p>
              <p className="mt-1 text-sm font-medium text-[#1B2A41]">
                {unifiedRows.length} certificado{unifiedRows.length === 1 ? '' : 's'}
                {bridgeReady && (
                  <span className="font-normal text-[#5C6B7F]">
                    {' '}
                    · {filteredWindows.length} en Windows
                  </span>
                )}
                {statusCounts.expiring_soon > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {statusCounts.expiring_soon} caduca{statusCounts.expiring_soon === 1 ? '' : 'n'} pronto
                  </span>
                )}
                {statusCounts.expired > 0 && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                    {statusCounts.expired} caducado{statusCounts.expired === 1 ? '' : 's'}
                  </span>
                )}
              </p>
            </div>
            <div className={DASHBOARD_PILL_GROUP}>
              {(
                [
                  { key: 'all' as const, label: 'Todos' },
                  { key: 'valid' as const, label: 'Vigentes' },
                  { key: 'expiring_soon' as const, label: 'Caducan pronto' },
                  { key: 'expired' as const, label: 'Caducados' },
                  { key: 'revoked' as const, label: 'Revocados' },
                  { key: 'windows' as const, label: 'Solo Windows' },
                ]
              )
                .filter((f) => f.key === 'all' || statusCounts[f.key] > 0)
                .map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(f.key)}
                    className={dashboardPillClass(statusFilter === f.key)}
                  >
                    {f.label}
                    {f.key !== 'all' && ` (${statusCounts[f.key]})`}
                  </button>
                ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className={DASHBOARD_TABLE_HEAD}>
              <tr>
                <th className={DASHBOARD_TH}>Origen</th>
                <th className={DASHBOARD_TH}>Empresa</th>
                <th className={DASHBOARD_TH}>Titular</th>
                <th className={DASHBOARD_TH}>DNI/NIF</th>
                <th className={DASHBOARD_TH}>Emisor</th>
                <th className={DASHBOARD_TH}>Caducidad</th>
                <th className={DASHBOARD_TH}>Estado</th>
                <th className={DASHBOARD_TH}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const isRegistering =
                  row.windowsCert && registerThumb === row.windowsCert.thumbprint
                const cert = row.vaclyCert
                const wc = row.windowsCert

                return (
                  <Fragment key={row.key}>
                    <tr className={DASHBOARD_ROW}>
                      <td className={DASHBOARD_TD}>
                        <Badge
                          variant="outline"
                          className={
                            row.origin === 'unassigned'
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : undefined
                          }
                        >
                          {row.originLabel}
                        </Badge>
                      </td>
                      <td className={DASHBOARD_TD}>{row.companyName}</td>
                      <td className={DASHBOARD_TD}>
                        <p className="font-medium text-[#1B2A41]">{row.titular}</p>
                        {cert?.certificateType && (
                          <p className="text-[11px] text-slate-400">
                            {TYPE_LABEL[cert.certificateType] || cert.certificateType}
                          </p>
                        )}
                        {wc?.organizationalUnit && (
                          <p className="text-[11px] text-slate-400">{wc.organizationalUnit}</p>
                        )}
                        {wc?.exportable === false && (
                          <p
                            className="text-[11px] text-amber-600"
                            title="La clave privada no permite exportación (tarjeta/DNIe o política de Windows). Para guardarlo en Vacly, sube el fichero .pfx original."
                          >
                            Clave no exportable — sube el .pfx original
                          </p>
                        )}
                      </td>
                      <td className={`${DASHBOARD_TD} font-mono text-xs`}>{row.nif || '—'}</td>
                      <td className={`${DASHBOARD_TD} text-xs max-w-[180px] truncate`} title={row.issuer}>
                        {row.issuer}
                      </td>
                      <td className={DASHBOARD_TD}>{row.expiry}</td>
                      <td className={DASHBOARD_TD}>
                        <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
                      </td>
                      <td className={DASHBOARD_TD}>
                        <CertRowActions
                          onView={() => openDetail(row)}
                          needsScopeChoice={row.needsScopeChoice}
                          onClassify={
                            cert && row.needsScopeChoice
                              ? () => setScopePickerCert(cert)
                              : undefined
                          }
                          canConfigureNotifications={Boolean(cert?.id)}
                          notificationsEnabled={cert?.expiryNotificationsEnabled !== false}
                          onConfigureNotifications={
                            cert ? () => setNotificationCert(cert) : undefined
                          }
                          showPermissions={Boolean(cert?.id) && cert?.status !== 'revoked'}
                          isRestricted={cert?.accessMode === 'restricted'}
                          onConfigurePermissions={
                            cert ? () => setPermissionsCert(cert) : undefined
                          }
                          showImport={
                            row.origin === 'windows' &&
                            Boolean(wc) &&
                            wc?.exportable !== false &&
                            !isRegistering
                          }
                          onImportToVacly={
                            wc
                              ? () => {
                                  setRegisterThumb(wc.thumbprint)
                                  setRegisterAlias(wc.displayName || '')
                                  setRegisterPassword('')
                                }
                              : undefined
                          }
                          canRevoke={
                            Boolean(cert) &&
                            cert!.status !== 'revoked' &&
                            (row.origin === 'vacly' ||
                              row.origin === 'agency' ||
                              row.origin === 'unassigned')
                          }
                          onRevoke={cert ? () => void revoke(cert.id) : undefined}
                        />
                      </td>
                    </tr>
                    {isRegistering && wc && (
                      <tr className="bg-[#1B2A41]/[0.04]">
                        <td colSpan={8} className="p-4">
                          <p className="mb-3 text-center text-sm font-medium text-[#1B2A41]">
                            Registrar en Vacly: {wc.displayName}
                          </p>
                          <div className="flex flex-wrap items-end justify-center gap-3">
                            <div className="min-w-[160px] max-w-xs flex-1">
                              <Input
                                placeholder="Alias"
                                value={registerAlias}
                                onChange={(e) => setRegisterAlias(e.target.value)}
                                className={DASHBOARD_INPUT_MD}
                              />
                            </div>
                            <div className="min-w-[160px] max-w-xs flex-1">
                              <Input
                                type="password"
                                placeholder="Contraseña del certificado"
                                value={registerPassword}
                                onChange={(e) => setRegisterPassword(e.target.value)}
                                className={DASHBOARD_INPUT_MD}
                              />
                            </div>
                            <Button
                              size="sm"
                              className={DASHBOARD_PRIMARY_BTN}
                              disabled={uploading}
                              onClick={() => void registerWindowsCert(wc.thumbprint)}
                            >
                              {uploading ? 'Guardando…' : 'Confirmar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={DASHBOARD_OUTLINE_BTN}
                              onClick={() => {
                                setRegisterThumb(null)
                                setRegisterPassword('')
                                setRegisterAlias('')
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[#5C6B7F]">
                    No hay certificados que coincidan con la búsqueda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {companyId && sessionReady && (
        <div className={cn(DASHBOARD_CARD, 'w-full')}>
          <CertActivityLogPanel
            companyId={companyId}
            adminHeaders={adminHeaders}
            certificates={accountCerts.map((c) => ({
              id: c.id,
              label: c.alias || c.holderName || c.holderNif || c.id,
            }))}
          />
        </div>
      )}
    </AdminShell>
  )
}
