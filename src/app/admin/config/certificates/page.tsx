'use client'

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  matchesCertSearch,
  normalizeCertSerial,
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
import { CertScopePickerDialog } from '@/components/admin/cert-scope-picker-dialog'
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

const TH_CLASS = 'text-center p-3 font-medium text-slate-700'
const TD_CLASS = 'text-center p-3 text-slate-600'
/** Misma caja exacta que el Input h-11 — sin depender de variantes del Button. */
const TOOLBAR_BTN_BASE =
  'h-11 box-border inline-flex items-center justify-center rounded-md border px-4 text-sm font-medium leading-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1B2A41] disabled:opacity-50 disabled:pointer-events-none shrink-0'
const TOOLBAR_BTN_OUTLINE =
  'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
const TOOLBAR_BTN_PRIMARY =
  'border-[#1B2A41] bg-[#1B2A41] text-white hover:bg-[#152036] hover:border-[#152036]'

function adminHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = new URLSearchParams(window.location.search).get('token')
  return token ? { 'x-vacly-company-token': token } : {}
}

function fmtDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

function findVaclyMatch(win: WindowsCertificateEntry, vacly: CertRow[]): CertRow | undefined {
  const winSerial = normalizeCertSerial(win.serialNumber)
  if (winSerial) {
    const bySerial = vacly.find((c) => normalizeCertSerial(c.serialNumber) === winSerial)
    if (bySerial) return bySerial
  }
  if (win.nif) {
    return vacly.find(
      (c) =>
        c.holderNif?.toUpperCase() === win.nif?.toUpperCase() &&
        c.status !== 'revoked' &&
        (!c.validTo || !win.notAfter || fmtDate(c.validTo) === fmtDate(win.notAfter)),
    )
  }
  return undefined
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

  useEffect(() => {
    if (typeof window !== 'undefined') setNominasOrigin(window.location.origin)
  }, [])

  const loadAccount = useCallback(() => {
    if (!companyId) return
    fetch(`/api/admin/config/certificates?scope=agency&company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setAccountCerts(d.certificates || [])
          setAccountCompanies(d.accountCompanies || [])
          if (d.brand) setCorporateBrand(d.brand)
        }
      })
      .catch(() => {})
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

  useEffect(() => {
    const win = isWindowsClient()
    setIsWindows(win)
    loadAccount()
    if (win) void refreshWindowsStore()
  }, [companyId, loadAccount, refreshWindowsStore])

  const onBridgeConnected = useCallback(() => {
    setBridgeReady(true)
    void refreshWindowsStore()
  }, [refreshWindowsStore])

  const allVaclyCerts = useMemo(() => accountCerts, [accountCerts])

  useEffect(() => {
    setExpiryAlert(findPendingExpiryAlerts(allVaclyCerts)[0] ?? null)
  }, [allVaclyCerts])

  const buildDetailFromRow = (row: UnifiedRow): CertDetailData => {
    const cert = row.vaclyCert
    const wc = row.windowsCert
    const validToRaw = cert?.validTo ?? wc?.notAfter ?? null
    const { daysToExpiry } = validToRaw
      ? deriveCertificateStatus(validToRaw, cert?.status === 'revoked' ? new Date().toISOString() : null)
      : { daysToExpiry: null as number | null }
    return {
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
    }
  }

  const openDetail = (row: UnifiedRow) => {
    setDetailCert(buildDetailFromRow(row))
    setDetailOpen(true)
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

    if (bridgeReady) {
      for (const wc of filteredWindows) {
        const match = findVaclyMatch(wc, accountCerts)
        if (match) continue
        rows.push({
          key: `win-${wc.thumbprint}`,
          origin: 'windows',
          originLabel: ORIGIN_LABEL.windows,
          companyName: wc.organization || '—',
          titular: wc.displayName || '—',
          nif: wc.nif || null,
          issuer: formatCertIssuer(wc.issuer),
          expiry: fmtDate(wc.notAfter),
          statusLabel: 'Solo Windows',
          statusVariant: 'outline',
          windowsCert: wc,
        })
      }
    }

    for (const c of filteredAccountCerts) {
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
        needsScopeChoice,
      })
    }

    return rows
  }, [
    bridgeReady,
    filteredWindows,
    filteredAccountCerts,
    accountCerts,
    accountCompanies,
    companyId,
  ])

  const uploadPfx = async (pfxFile: File, certAlias: string, certPassword: string) => {
    if (!companyId) return null
    const fd = new FormData()
    fd.set('company_id', companyId)
    fd.set('alias', certAlias)
    fd.set('password', certPassword)
    fd.set('pfx', pfxFile)

    const res = await fetch('/api/admin/config/certificates', {
      method: 'POST',
      body: fd,
      headers: adminHeaders(),
    })
    const data = await res.json()
    if (!data.success) {
      throw new Error(data.message || 'Error al registrar el certificado')
    }
    return data.certificate as CertRow
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
      const saved = await uploadPfx(pfxFile, alias, registerPassword)
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
      />

      {isWindows && !bridgeReady && (
        <WindowsBridgeBanner nominasOrigin={nominasOrigin} onConnected={onBridgeConnected} />
      )}

      <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 w-full">
        <div className="flex-1 min-w-0 flex">
          <Input
            placeholder="Buscar por DNI/NIF, nombre, empresa, emisor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full"
          />
        </div>
        <div className="flex flex-wrap items-stretch gap-2 shrink-0">
          {isWindows && (
            <button
              type="button"
              onClick={() => void refreshWindowsStore()}
              disabled={bridgeLoading}
              className={cn(TOOLBAR_BTN_BASE, TOOLBAR_BTN_OUTLINE)}
            >
              {bridgeLoading ? 'Sincronizando Windows…' : 'Actualizar desde Windows'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className={cn(TOOLBAR_BTN_BASE, TOOLBAR_BTN_PRIMARY)}
          >
            {showAddForm ? 'Cerrar formulario' : 'Añadir certificado'}
          </button>
        </div>
      </div>

      {(message || error) && (
        <div className="space-y-1 w-full">
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {showAddForm && (
        <Card className="p-6 border-slate-200 w-full">
          <h2 className="font-semibold text-slate-800 mb-1">Añadir certificado (.pfx / .p12)</h2>
          <p className="text-xs text-slate-500 mb-4">
            Se guarda cifrado en Vacly. Opcionalmente se instala también en el almacén de Windows de
            este equipo.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <Input placeholder="Alias" value={uploadAlias} onChange={(e) => setUploadAlias(e.target.value)} />
            <Input
              type="password"
              placeholder="Contraseña del certificado"
              value={uploadPassword}
              onChange={(e) => setUploadPassword(e.target.value)}
            />
            <Input type="file" accept=".pfx,.p12" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            <Button
              onClick={() => void uploadNewCert()}
              disabled={uploading}
              className="bg-[#1B2A41] text-white hover:bg-[#152036]"
            >
              {uploading ? 'Guardando…' : 'Guardar en Vacly'}
            </Button>
          </div>
          {isWindows && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-3">
              <input
                type="checkbox"
                checked={installInWindows}
                onChange={(e) => setInstallInWindows(e.target.checked)}
                className="rounded border-slate-300"
              />
              Instalar también en Windows (requiere puente activo)
            </label>
          )}
        </Card>
      )}

      <Card className="border-slate-200 overflow-hidden w-full">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 text-center">
          <p className="text-sm text-slate-600">
            {unifiedRows.length} certificado{unifiedRows.length === 1 ? '' : 's'}
            {bridgeReady && ` · ${filteredWindows.length} en Windows`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH_CLASS}>Origen</th>
                <th className={TH_CLASS}>Empresa</th>
                <th className={TH_CLASS}>Titular</th>
                <th className={TH_CLASS}>DNI/NIF</th>
                <th className={TH_CLASS}>Emisor</th>
                <th className={TH_CLASS}>Caducidad</th>
                <th className={TH_CLASS}>Estado</th>
                <th className={TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {unifiedRows.map((row) => {
                const isRegistering =
                  row.windowsCert && registerThumb === row.windowsCert.thumbprint
                const cert = row.vaclyCert
                const wc = row.windowsCert

                return (
                  <Fragment key={row.key}>
                    <tr className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className={TD_CLASS}>
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
                      <td className={TD_CLASS}>{row.companyName}</td>
                      <td className={TD_CLASS}>
                        <p className="font-medium text-slate-800">{row.titular}</p>
                        {cert?.certificateType && (
                          <p className="text-[11px] text-slate-400">
                            {TYPE_LABEL[cert.certificateType] || cert.certificateType}
                          </p>
                        )}
                        {wc?.organizationalUnit && (
                          <p className="text-[11px] text-slate-400">{wc.organizationalUnit}</p>
                        )}
                      </td>
                      <td className={`${TD_CLASS} font-mono text-xs`}>{row.nif || '—'}</td>
                      <td className={`${TD_CLASS} text-xs max-w-[180px] truncate`} title={row.issuer}>
                        {row.issuer}
                      </td>
                      <td className={TD_CLASS}>{row.expiry}</td>
                      <td className={TD_CLASS}>
                        <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
                      </td>
                      <td className={TD_CLASS}>
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
                          showImport={row.origin === 'windows' && Boolean(wc) && !isRegistering}
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
                      <tr className="bg-[#1B2A41]/5">
                        <td colSpan={8} className="p-4">
                          <p className="text-sm font-medium text-slate-800 mb-3 text-center">
                            Registrar en Vacly: {wc.displayName}
                          </p>
                          <div className="flex flex-wrap gap-3 items-end justify-center">
                            <div className="flex-1 min-w-[160px] max-w-xs">
                              <Input
                                placeholder="Alias"
                                value={registerAlias}
                                onChange={(e) => setRegisterAlias(e.target.value)}
                              />
                            </div>
                            <div className="flex-1 min-w-[160px] max-w-xs">
                              <Input
                                type="password"
                                placeholder="Contraseña del certificado"
                                value={registerPassword}
                                onChange={(e) => setRegisterPassword(e.target.value)}
                              />
                            </div>
                            <Button
                              size="sm"
                              className="bg-[#1B2A41] text-white"
                              disabled={uploading}
                              onClick={() => void registerWindowsCert(wc.thumbprint)}
                            >
                              {uploading ? 'Guardando…' : 'Confirmar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
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
              {unifiedRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    No hay certificados que coincidan con la búsqueda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminShell>
  )
}
