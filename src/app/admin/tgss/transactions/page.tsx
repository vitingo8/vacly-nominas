'use client'

import { useEffect, useState } from 'react'
import { AdminShell, useCompanyId } from '@/components/admin/admin-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowPathIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'

interface TransactionRow {
  id: string
  procedure_code: string
  status: string
  created_at: string
  error_message?: string | null
}

interface AffiliationDetail {
  request_type: string
  nss?: string | null
  ipf?: string | null
  ccc?: string | null
  fecha_real?: string | null
  fecha_efecto?: string | null
  employee_id?: string | null
}

interface FileDetail {
  id: string
  file_type: string
  file_name: string
  sha256: string
  created_at: string
}

interface ResponseDetail {
  id: string
  response_type: string
  normalized_status?: string | null
  error_code?: string | null
  error_message?: string | null
  received_at: string
}

interface TransactionDetail {
  id: string
  procedure_code: string
  status: string
  created_at: string
  updated_at: string
  error_code?: string | null
  error_message?: string | null
  subject_id?: string | null
}

const PROCEDURE_LABELS: Record<string, string> = {
  'tgss.afi.alta': 'Alta en Seguridad Social (AFI)',
  'tgss.afi.baja': 'Baja en Seguridad Social (AFI)',
  'tgss.afi.variacion': 'Variación de datos (AFI)',
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Creado',
  validated: 'Validado',
  file_generated: 'Fichero generado',
  queued: 'En cola de envío',
  submitted: 'Enviado a TGSS',
  response_received: 'Respuesta recibida',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  failed: 'Error',
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  alta: 'Alta',
  baja: 'Baja',
  variacion: 'Variación',
}

function labelFor(map: Record<string, string>, key: string) {
  return map[key] || key
}

export default function AdminTransactionsPage() {
  const companyId = useCompanyId()
  const [rows, setRows] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<{
    transaction: TransactionDetail
    affiliation: AffiliationDetail | null
    files: FileDetail[]
    responses: ResponseDetail[]
  } | null>(null)

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/tgss/transactions?company_id=${encodeURIComponent(companyId)}`)
      const data = await res.json()
      if (data.success) setRows(data.data || [])
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (id: string) => {
    if (!companyId) return
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(
        `/api/admin/tgss/transactions/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
      )
      const data = await res.json()
      if (data.success) {
        setDetail(data.data)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [companyId])

  const statusColor = (s: string) => {
    if (s === 'accepted') return 'text-emerald-700 bg-emerald-50'
    if (s === 'rejected' || s === 'failed') return 'text-rose-700 bg-rose-50'
    if (s === 'queued' || s === 'submitted') return 'text-amber-700 bg-amber-50'
    return 'text-slate-600 bg-slate-100'
  }

  const fileDownloadUrl = (fileId: string) =>
    `/api/admin/tgss/files/${encodeURIComponent(fileId)}?company_id=${encodeURIComponent(companyId || '')}`

  return (
    <AdminShell>
      <div className="mb-4 space-y-1">
        <p className="text-sm text-slate-600">
          Registro de trámites TGSS generados desde Alta, Baja o Variación. Cada fila es un envío AFI:
          validación de datos, generación del fichero y seguimiento del estado hasta la respuesta de la TGSS.
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="ml-2">Actualizar</span>
        </Button>
      </div>

      <Card className="border-slate-200 overflow-hidden w-full mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-semibold text-slate-700">Procedimiento</th>
                <th className="text-left p-3 font-semibold text-slate-700">Estado</th>
                <th className="text-left p-3 font-semibold text-slate-700">Fecha</th>
                <th className="text-left p-3 font-semibold text-slate-700">ID</th>
                <th className="text-right p-3 font-semibold text-slate-700" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    {loading ? 'Cargando…' : 'Sin trámites registrados'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="p-3">{labelFor(PROCEDURE_LABELS, row.procedure_code)}</td>
                    <td className="p-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor(row.status)}`}>
                        {labelFor(STATUS_LABELS, row.status)}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(row.created_at).toLocaleString('es-ES')}
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500">{row.id.slice(0, 8)}…</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => loadDetail(row.id)}>
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del trámite</DialogTitle>
            <DialogDescription>
              {selectedId && (
                <span className="font-mono text-xs">{selectedId}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <p className="text-sm text-slate-500 py-4">Cargando detalle…</p>
          )}

          {!detailLoading && detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Procedimiento</p>
                  <p className="font-medium">{labelFor(PROCEDURE_LABELS, detail.transaction.procedure_code)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full ${statusColor(detail.transaction.status)}`}>
                    {labelFor(STATUS_LABELS, detail.transaction.status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Creado</p>
                  <p>{new Date(detail.transaction.created_at).toLocaleString('es-ES')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Última actualización</p>
                  <p>{new Date(detail.transaction.updated_at).toLocaleString('es-ES')}</p>
                </div>
              </div>

              {detail.transaction.status === 'queued' && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  El trámite está en cola. El fichero AFI se enviará a SILTRA cuando el procesador
                  automático lo ejecute (cada ~5 min). Asegúrate de tener SILTRA instalado y las
                  carpetas de entrada/salida configuradas.
                </p>
              )}

              {detail.affiliation && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <p className="font-semibold text-slate-800">Datos del trámite</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-700">
                    <dt className="text-slate-500">Tipo</dt>
                    <dd>{labelFor(REQUEST_TYPE_LABELS, detail.affiliation.request_type)}</dd>
                    {detail.affiliation.ipf && (
                      <>
                        <dt className="text-slate-500">NIF</dt>
                        <dd>{detail.affiliation.ipf}</dd>
                      </>
                    )}
                    {detail.affiliation.nss && (
                      <>
                        <dt className="text-slate-500">NSS</dt>
                        <dd>{detail.affiliation.nss}</dd>
                      </>
                    )}
                    {detail.affiliation.ccc && (
                      <>
                        <dt className="text-slate-500">CCC</dt>
                        <dd>{detail.affiliation.ccc}</dd>
                      </>
                    )}
                    {detail.affiliation.fecha_real && (
                      <>
                        <dt className="text-slate-500">Fecha real</dt>
                        <dd>{detail.affiliation.fecha_real}</dd>
                      </>
                    )}
                    {detail.affiliation.fecha_efecto && (
                      <>
                        <dt className="text-slate-500">Fecha efecto</dt>
                        <dd>{detail.affiliation.fecha_efecto}</dd>
                      </>
                    )}
                  </dl>
                </div>
              )}

              {detail.files.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <p className="font-semibold text-slate-800">Ficheros generados</p>
                  {detail.files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{file.file_name}</p>
                        <p className="text-xs text-slate-500 truncate">SHA256: {file.sha256.slice(0, 16)}…</p>
                      </div>
                      <a
                        href={fileDownloadUrl(file.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#1B2A41] hover:underline shrink-0"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        Descargar AFI
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {detail.responses.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <p className="font-semibold text-slate-800">Respuestas TGSS</p>
                  {detail.responses.map((resp) => (
                    <div key={resp.id} className="text-xs text-slate-600">
                      <p>
                        {new Date(resp.received_at).toLocaleString('es-ES')} —{' '}
                        <strong>{resp.normalized_status || resp.response_type}</strong>
                      </p>
                      {resp.error_message && (
                        <p className="text-rose-600 mt-1">{resp.error_message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(detail.transaction.error_message || detail.transaction.error_code) && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-800">
                  <p className="font-semibold">Error</p>
                  {detail.transaction.error_code && (
                    <p className="text-xs font-mono">{detail.transaction.error_code}</p>
                  )}
                  {detail.transaction.error_message && <p>{detail.transaction.error_message}</p>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
