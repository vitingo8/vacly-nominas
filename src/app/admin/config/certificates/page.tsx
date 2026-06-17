'use client'

import { useEffect, useState } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

type CertStatus = 'valid' | 'expiring_soon' | 'expired' | 'revoked'

interface CertRow {
  id: string
  alias: string
  holderNif: string | null
  holderName?: string | null
  issuer?: string | null
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
  persona_fisica: 'Persona fisica',
  representante: 'Representante',
  sello_empresa: 'Sello de empresa',
}

/** Cabeceras opcionales: reenvia el token de sesion de empresa si vacly-app lo paso por URL. */
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

function StatusBadge({ row }: { row: CertRow }) {
  const extra =
    row.status === 'expiring_soon' && row.daysToExpiry != null
      ? ` (${row.daysToExpiry}d)`
      : ''
  return (
    <Badge variant={STATUS_VARIANT[row.status]}>
      {STATUS_LABEL[row.status]}
      {extra}
    </Badge>
  )
}

export default function AdminCertificatesPage() {
  const companyId = useCompanyId()
  const [certs, setCerts] = useState<CertRow[]>([])
  const [agencyCerts, setAgencyCerts] = useState<CertRow[]>([])
  const [alias, setAlias] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const load = () => {
    if (!companyId) return
    fetch(`/api/admin/config/certificates?company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCerts(d.certificates || [])
      })
      .catch(() => {})
  }

  const loadAgency = () => {
    if (!companyId) return
    fetch(`/api/admin/config/certificates?scope=agency&company_id=${encodeURIComponent(companyId)}`, {
      headers: adminHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAgencyCerts(d.certificates || [])
      })
      .catch(() => {})
  }

  useEffect(() => {
    load()
    loadAgency()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const upload = async () => {
    setMessage('')
    setError('')
    if (!companyId || !file || !alias) {
      setError('Indica un alias y selecciona el fichero del certificado.')
      return
    }
    if (!password) {
      setError('Introduce la contrasena del certificado.')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('company_id', companyId)
      fd.set('alias', alias)
      fd.set('password', password)
      fd.set('pfx', file)

      const res = await fetch('/api/admin/config/certificates', {
        method: 'POST',
        body: fd,
        headers: adminHeaders(),
      })
      const data = await res.json()
      if (data.success) {
        const c = data.certificate as CertRow
        setMessage(
          `Certificado de ${c.holderName || c.holderNif || 'titular'} registrado y cifrado. Caduca el ${fmtDate(c.validTo)}.`,
        )
        setAlias('')
        setPassword('')
        setFile(null)
        load()
        loadAgency()
      } else {
        setError(data.message || 'Error al registrar el certificado')
      }
    } catch {
      setError('Error de conexion al registrar el certificado')
    } finally {
      setUploading(false)
    }
  }

  const revoke = async (id: string) => {
    if (!companyId) return
    if (!confirm('Revocar este certificado eliminara su material cifrado de forma permanente. Continuar?')) return
    const res = await fetch(
      `/api/admin/config/certificates?company_id=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: adminHeaders() },
    )
    const data = await res.json()
    if (data.success) {
      load()
      loadAgency()
    } else {
      setError(data.message || 'Error al revocar el certificado')
    }
  }

  return (
    <AdminShell title="Certificados" subtitle="Almacen cifrado de certificados digitales (sin exposicion por API)">
      <Card className="p-6 border-slate-200 mb-6">
        <h2 className="font-semibold text-slate-800 mb-1">Registrar certificado (.pfx / .p12)</h2>
        <p className="text-xs text-slate-500 mb-4">
          El titular, emisor y fechas se extraen automaticamente del certificado. La contrasena se valida al subirlo.
        </p>
        <div className="space-y-3 max-w-md">
          <Input placeholder="Alias (p. ej. Certificado representante 2026)" value={alias} onChange={(e) => setAlias(e.target.value)} />
          <Input
            type="password"
            placeholder="Contrasena del certificado"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <Button onClick={upload} disabled={uploading} className="bg-[#1B2A41] text-white hover:bg-[#152036]">
            {uploading ? 'Validando y guardando...' : 'Guardar certificado'}
          </Button>
          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Card>

      <Tabs defaultValue="mine">
        <TabsList className="mb-4">
          <TabsTrigger value="mine">Esta empresa</TabsTrigger>
          <TabsTrigger value="agency">Cartera de la gestoria</TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          <CertTable rows={certs} onRevoke={revoke} />
        </TabsContent>

        <TabsContent value="agency">
          <CertTable rows={agencyCerts} onRevoke={revoke} showCompany />
        </TabsContent>
      </Tabs>
    </AdminShell>
  )
}

function CertTable({
  rows,
  onRevoke,
  showCompany = false,
}: {
  rows: CertRow[]
  onRevoke: (id: string) => void
  showCompany?: boolean
}) {
  return (
    <Card className="border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
                <td className="p-3 text-slate-600">{c.holderNif || '—'}</td>
                <td className="p-3 text-slate-500">{c.issuer || '—'}</td>
                <td className="p-3 text-slate-600">{fmtDate(c.validTo)}</td>
                <td className="p-3">
                  <StatusBadge row={c} />
                </td>
                <td className="p-3 text-right">
                  {c.status !== 'revoked' && (
                    <button
                      onClick={() => onRevoke(c.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
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
