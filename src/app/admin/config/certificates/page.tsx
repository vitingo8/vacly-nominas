'use client'

import { useEffect, useState } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CertRow {
  id: string
  alias: string
  holderNif: string
  validFrom?: string | null
  validTo?: string | null
  status: string
}

export default function AdminCertificatesPage() {
  const companyId = useCompanyId()
  const [certs, setCerts] = useState<CertRow[]>([])
  const [alias, setAlias] = useState('')
  const [holderNif, setHolderNif] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')

  const load = () => {
    if (!companyId) return
    fetch(`/api/admin/config/certificates?company_id=${encodeURIComponent(companyId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCerts(d.certificates || [])
      })
  }

  useEffect(() => {
    load()
  }, [companyId])

  const upload = async () => {
    if (!companyId || !file || !alias || !holderNif) return
    const fd = new FormData()
    fd.set('company_id', companyId)
    fd.set('alias', alias)
    fd.set('holder_nif', holderNif)
    fd.set('password', password)
    fd.set('pfx', file)

    const res = await fetch('/api/admin/config/certificates', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.success) {
      setMessage('Certificado registrado (cifrado). No se expone por API.')
      setAlias('')
      setHolderNif('')
      setPassword('')
      setFile(null)
      load()
    } else {
      setMessage(data.message || 'Error al registrar certificado')
    }
  }

  return (
    <AdminShell title="Certificados" subtitle="Almacén cifrado de certificados digitales (sin exposición por API)">
      <Card className="p-6 border-slate-200 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Registrar certificado (.pfx)</h2>
        <div className="space-y-3 max-w-md">
          <Input placeholder="Alias" value={alias} onChange={(e) => setAlias(e.target.value)} />
          <Input placeholder="NIF titular" value={holderNif} onChange={(e) => setHolderNif(e.target.value)} />
          <Input type="password" placeholder="Contraseña del certificado" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <Button onClick={upload} className="bg-[#1B2A41] text-white hover:bg-[#152036]">
            Guardar certificado
          </Button>
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </div>
      </Card>

      <Card className="border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Alias</th>
              <th className="text-left p-3">NIF</th>
              <th className="text-left p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {certs.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="p-3">{c.alias}</td>
                <td className="p-3">{c.holderNif}</td>
                <td className="p-3">{c.status}</td>
              </tr>
            ))}
            {certs.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-slate-500">Sin certificados</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </AdminShell>
  )
}
