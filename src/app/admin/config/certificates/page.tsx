'use client'

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  matchesCertSearch,
  normalizeCertSerial,
  parseCertSubject,
} from '@/lib/admin-integrations/certificate-vault/cert-subject-parser'
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
import { WindowsBridgeSetup } from '@/components/admin/windows-bridge-setup'

type CertStatus = 'valid' | 'expiring_soon' | 'expired' | 'revoked'

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

const TYPE_LABEL: Record<string, string> = {
  persona_fisica: 'Persona física',
  representante: 'Representante',
  sello_empresa: 'Sello de empresa',
}

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

export default function AdminCertificatesPage() {
  const companyId = useCompanyId()
  const [certs, setCerts] = useState<CertRow[]>([])
  const [agencyCerts, setAgencyCerts] = useState<CertRow[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

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

  const load = useCallback(() => {
    if (!companyId) return
    fetch(`/api/admin/config/certificates?company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCerts(d.certificates || [])
      })
      .catch(() => {})
  }, [companyId])

  const loadAgency = useCallback(() => {
    if (!companyId) return
    fetch(`/api/admin/config/certificates?scope=agency&company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAgencyCerts(d.certificates || [])
      })
      .catch(() => {})
  }, [companyId])

  const refreshWindowsStore = useCallback(async () => {
    setBridgeLoading(true)
    setError('')
    try {
      const ready = await probeWindowsCertBridge()
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
  }, [])

  useEffect(() => {
    const win = isWindowsClient()
    setIsWindows(win)
    load()
    loadAgency()
    if (win) void refreshWindowsStore()
  }, [companyId, load, loadAgency, refreshWindowsStore])

  const filteredWindows = useMemo(() => {
    return windowsCerts.filter((wc) => {
      const parsed = parseCertSubject(wc.subject, wc.friendlyName)
      return matchesCertSearch(parsed, wc.issuer, search)
    })
  }, [windowsCerts, search])

  const filteredVacly = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return certs
    return certs.filter((c) => {
      const blob = [c.alias, c.holderName, c.holderNif, c.issuer, c.companyName, c.serialNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return q.split(/\s+/).every((t) => blob.includes(t))
    })
  }, [certs, search])

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
      load()
      loadAgency()
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
      load()
      loadAgency()
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
      load()
      loadAgency()
    } else {
      setError(data.message || 'Error al revocar')
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 w-full">
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Buscar por DNI/NIF, nombre, empresa, emisor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11"
          />
        </div>
        {isWindows && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshWindowsStore()}
            disabled={bridgeLoading}
            className="shrink-0"
          >
            {bridgeLoading ? 'Sincronizando Windows…' : 'Actualizar desde Windows'}
          </Button>
        )}
      </div>

      {(message || error) && (
        <div className="space-y-1 w-full">
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      <Tabs defaultValue={isWindows ? 'windows' : 'vacly'} className="w-full">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          {isWindows && <TabsTrigger value="windows">Este equipo (Windows)</TabsTrigger>}
          <TabsTrigger value="vacly">En Vacly — esta empresa</TabsTrigger>
          <TabsTrigger value="agency">Cartera gestoría</TabsTrigger>
          <TabsTrigger value="add">Añadir certificado</TabsTrigger>
        </TabsList>

        {isWindows && (
          <TabsContent value="windows">
            {!bridgeReady ? (
              <WindowsBridgeSetup onRetry={() => void refreshWindowsStore()} loading={bridgeLoading} />
            ) : (
              <WindowsCertTable
                rows={filteredWindows}
                vaclyCerts={certs}
                registerThumb={registerThumb}
                registerPassword={registerPassword}
                registerAlias={registerAlias}
                uploading={uploading}
                onOpenRegister={(thumb) => {
                  const wc = windowsCerts.find((c) => c.thumbprint === thumb)
                  setRegisterThumb(thumb)
                  setRegisterAlias(wc?.displayName || '')
                  setRegisterPassword('')
                }}
                onCancelRegister={() => {
                  setRegisterThumb(null)
                  setRegisterPassword('')
                  setRegisterAlias('')
                }}
                onRegisterPassword={setRegisterPassword}
                onRegisterAlias={setRegisterAlias}
                onConfirmRegister={() => registerThumb && void registerWindowsCert(registerThumb)}
              />
            )}
          </TabsContent>
        )}

        <TabsContent value="vacly">
          <VaclyCertTable rows={filteredVacly} onRevoke={revoke} />
        </TabsContent>

        <TabsContent value="agency">
          <VaclyCertTable rows={agencyCerts} onRevoke={revoke} showCompany />
        </TabsContent>

        <TabsContent value="add">
          <Card className="p-6 border-slate-200 w-full max-w-2xl">
            <h2 className="font-semibold text-slate-800 mb-1">Añadir certificado (.pfx / .p12)</h2>
            <p className="text-xs text-slate-500 mb-4">
              Se guarda cifrado en Vacly. Opcionalmente se instala también en el almacén de Windows de
              este equipo.
            </p>
            <div className="space-y-3">
              <Input placeholder="Alias" value={uploadAlias} onChange={(e) => setUploadAlias(e.target.value)} />
              <Input
                type="password"
                placeholder="Contraseña del certificado"
                value={uploadPassword}
                onChange={(e) => setUploadPassword(e.target.value)}
              />
              <Input type="file" accept=".pfx,.p12" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              {isWindows && (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={installInWindows}
                    onChange={(e) => setInstallInWindows(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Instalar también en Windows (requiere puente activo)
                </label>
              )}
              <Button
                onClick={() => void uploadNewCert()}
                disabled={uploading}
                className="bg-[#1B2A41] text-white hover:bg-[#152036]"
              >
                {uploading ? 'Guardando…' : 'Guardar en Vacly'}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminShell>
  )
}

function WindowsCertTable({
  rows,
  vaclyCerts,
  registerThumb,
  registerPassword,
  registerAlias,
  uploading,
  onOpenRegister,
  onCancelRegister,
  onRegisterPassword,
  onRegisterAlias,
  onConfirmRegister,
}: {
  rows: WindowsCertificateEntry[]
  vaclyCerts: CertRow[]
  registerThumb: string | null
  registerPassword: string
  registerAlias: string
  uploading: boolean
  onOpenRegister: (thumb: string) => void
  onCancelRegister: () => void
  onRegisterPassword: (v: string) => void
  onRegisterAlias: (v: string) => void
  onConfirmRegister: () => void
}) {
  return (
    <Card className="border-slate-200 overflow-hidden w-full">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <p className="text-sm text-slate-600">
          {rows.length} certificado{rows.length === 1 ? '' : 's'} en Windows con clave privada
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Titular</th>
              <th className="text-left p-3">DNI/NIF</th>
              <th className="text-left p-3">Empresa</th>
              <th className="text-left p-3">Emisor</th>
              <th className="text-left p-3">Caducidad</th>
              <th className="text-left p-3">Vacly</th>
              <th className="text-right p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((wc) => {
              const match = findVaclyMatch(wc, vaclyCerts)
              const isRegistering = registerThumb === wc.thumbprint
              return (
                <Fragment key={wc.thumbprint}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="p-3">
                      <p className="font-medium text-slate-800">{wc.displayName}</p>
                      {wc.organizationalUnit && (
                        <p className="text-[11px] text-slate-400">{wc.organizationalUnit}</p>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 font-mono text-xs">{wc.nif || '—'}</td>
                    <td className="p-3 text-slate-600">{wc.organization || '—'}</td>
                    <td className="p-3 text-slate-500 text-xs max-w-[180px] truncate" title={wc.issuer}>
                      {wc.issuer.replace(/^CN=/i, '')}
                    </td>
                    <td className="p-3 text-slate-600">{fmtDate(wc.notAfter)}</td>
                    <td className="p-3">
                      {match ? (
                        <Badge variant="default">En Vacly</Badge>
                      ) : (
                        <Badge variant="outline">Solo Windows</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {!match && !isRegistering && (
                        <button
                          type="button"
                          onClick={() => onOpenRegister(wc.thumbprint)}
                          className="text-xs font-medium text-[#1B2A41] hover:underline"
                        >
                          Guardar en Vacly
                        </button>
                      )}
                      {match && (
                        <span className="text-xs text-slate-400">{match.alias}</span>
                      )}
                    </td>
                  </tr>
                  {isRegistering && (
                    <tr className="bg-[#1B2A41]/5">
                      <td colSpan={7} className="p-4">
                        <p className="text-sm font-medium text-slate-800 mb-3">
                          Registrar en Vacly: {wc.displayName}
                        </p>
                        <div className="flex flex-wrap gap-3 items-end">
                          <div className="flex-1 min-w-[160px]">
                            <Input
                              placeholder="Alias"
                              value={registerAlias}
                              onChange={(e) => onRegisterAlias(e.target.value)}
                            />
                          </div>
                          <div className="flex-1 min-w-[160px]">
                            <Input
                              type="password"
                              placeholder="Contraseña del certificado"
                              value={registerPassword}
                              onChange={(e) => onRegisterPassword(e.target.value)}
                            />
                          </div>
                          <Button
                            size="sm"
                            className="bg-[#1B2A41] text-white"
                            disabled={uploading}
                            onClick={onConfirmRegister}
                          >
                            {uploading ? 'Guardando…' : 'Confirmar'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={onCancelRegister}>
                            Cancelar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No hay certificados que coincidan con la búsqueda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function VaclyCertTable({
  rows,
  onRevoke,
  showCompany = false,
}: {
  rows: CertRow[]
  onRevoke: (id: string) => void
  showCompany?: boolean
}) {
  return (
    <Card className="border-slate-200 overflow-hidden w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50">
            <tr>
              {showCompany && <th className="text-left p-3">Empresa</th>}
              <th className="text-left p-3">Alias</th>
              <th className="text-left p-3">Titular</th>
              <th className="text-left p-3">NIF</th>
              <th className="text-left p-3">Emisor</th>
              <th className="text-left p-3">Caducidad</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-right p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                {showCompany && <td className="p-3 text-slate-700">{c.companyName || '—'}</td>}
                <td className="p-3 font-medium text-slate-800">{c.alias}</td>
                <td className="p-3 text-slate-600">
                  {c.holderName || '—'}
                  {c.certificateType && (
                    <span className="block text-[11px] text-slate-400">
                      {TYPE_LABEL[c.certificateType] || c.certificateType}
                    </span>
                  )}
                </td>
                <td className="p-3 text-slate-600 font-mono text-xs">{c.holderNif || '—'}</td>
                <td className="p-3 text-slate-500">{c.issuer || '—'}</td>
                <td className="p-3 text-slate-600">{fmtDate(c.validTo)}</td>
                <td className="p-3">
                  <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </td>
                <td className="p-3 text-right">
                  {c.status !== 'revoked' && (
                    <button
                      type="button"
                      onClick={() => onRevoke(c.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showCompany ? 8 : 7} className="p-6 text-center text-slate-500">
                  Sin certificados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
