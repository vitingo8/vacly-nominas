'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ArrowDownTrayIcon,
  ArrowTrendingUpIcon,
  BuildingOffice2Icon,
  CreditCardIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import type { NominaViewerData } from '@/components/nomina-viewer-dialog'

function coerceNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(amount: unknown) {
  const n = coerceNumber(amount)
  if (n == null) return '€0.00'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}

function formatRate(rate: unknown) {
  const n = coerceNumber(rate)
  if (n == null) return '—'
  const pct = Math.abs(n) <= 1 ? n * 100 : n
  return `${pct.toFixed(2)}%`
}

export function NominaPdfPanel({
  nominaId,
  filename,
  pdfUrl,
}: {
  nominaId?: string
  filename?: string
  pdfUrl?: string
}) {
  const pdfFetchUrl =
    pdfUrl?.startsWith('http')
      ? pdfUrl
      : pdfUrl || (nominaId ? `/api/nominas/document?id=${encodeURIComponent(nominaId)}` : '')
  const downloadName = filename || (nominaId ? `nomina_${nominaId}.pdf` : 'nomina.pdf')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pdfFetchUrl) {
      setBlobUrl(null)
      return
    }

    let objectUrl: string | null = null
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(pdfFetchUrl, { signal: controller.signal, credentials: 'same-origin' })
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || ''
        if (!res.ok || !contentType.includes('application/pdf')) {
          let message = 'No se pudo cargar el PDF'
          try {
            const data = await res.json()
            message = data.error || data.message || message
          } catch {
            /* respuesta no JSON */
          }
          throw new Error(message)
        }
        return res.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Error al cargar el PDF')
        setBlobUrl(null)
      })
      .finally(() => setLoading(false))

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [pdfFetchUrl])

  if (!pdfFetchUrl) {
    return <p className="text-center text-slate-500 py-8">No hay documento PDF disponible.</p>
  }

  return (
    <div className="h-[min(60vh,520px)] flex flex-col">
      <div className="flex-1 rounded-xl border-2 border-slate-200 overflow-hidden bg-neutral-100 min-h-[320px]">
        {loading && (
          <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-slate-500">
            Cargando PDF…
          </div>
        )}
        {!loading && error && (
          <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center text-sm text-red-600">
            {error}
          </div>
        )}
        {!loading && !error && blobUrl && (
          <iframe
            src={`${blobUrl}#toolbar=1&navpanes=0&scrollbar=1`}
            className="w-full h-full min-h-[320px] border-0"
            title="Visor PDF de nómina"
            allowFullScreen
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Visor integrado (mismo método que Inbox). Si no carga, prueba descargar el PDF.
        </p>
        <div className="flex items-center gap-2">
          {blobUrl && (
            <>
              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <EyeIcon className="w-4 h-4" />
                Abrir en nueva pestaña
              </a>
              <a
                href={blobUrl}
                download={downloadName}
                className="px-4 py-2 bg-[#1B2A41] text-white rounded-lg hover:bg-[#152036] transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Descargar PDF
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export interface NominaAggregateLine {
  code?: string
  concept?: string
  amount: number
}

export interface NominaAggregateContribution {
  concept?: string
  base: number
  rate?: number
  employer_contribution: number
}

export interface NominaAggregate {
  count: number
  gross: number
  net: number
  cost: number
  baseSs: number
  perceptions: NominaAggregateLine[]
  deductions: NominaAggregateLine[]
  contributions: NominaAggregateContribution[]
}

function sumAmounts(items: Array<{ amount?: unknown }>) {
  return items.reduce((sum, item) => sum + (coerceNumber(item.amount) ?? 0), 0)
}

function sumContributions(items: Array<{ employer_contribution?: unknown }>) {
  return items.reduce((sum, item) => sum + (coerceNumber(item.employer_contribution) ?? 0), 0)
}

export function NominaAggregatePanel({ aggregate }: { aggregate: NominaAggregate }) {
  const totalPerceptions = sumAmounts(aggregate.perceptions)
  const totalDeductions = sumAmounts(aggregate.deductions)
  const totalContributions = sumContributions(aggregate.contributions)

  return (
    <div className="p-4 bg-slate-50/80 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Nóminas', value: String(aggregate.count), color: 'text-slate-900' },
          { label: 'Bruto', value: formatCurrency(aggregate.gross), color: 'text-[#1B2A41]' },
          { label: 'Neto', value: formatCurrency(aggregate.net), color: 'text-emerald-700' },
          { label: 'Coste empresa', value: formatCurrency(aggregate.cost), color: 'text-[#C6A664]' },
          { label: 'Base SS', value: formatCurrency(aggregate.baseSs), color: 'text-slate-700' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border shadow-sm">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
              <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Percepciones por concepto ({aggregate.perceptions.length})</CardTitle>
            <CardDescription>Suma de devengos del grupo · base modelo 190</CardDescription>
          </CardHeader>
          <CardContent>
            {aggregate.perceptions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregate.perceptions.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{p.concept || 'N/A'}</TableCell>
                      <TableCell>{p.code || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600">
                        {formatCurrency(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-emerald-50">
                    <TableCell colSpan={2} className="font-bold">Total Percepciones</TableCell>
                    <TableCell className="text-right font-bold font-mono text-emerald-700">
                      {formatCurrency(totalPerceptions)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-slate-500 py-6">Sin percepciones</p>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Deducciones por concepto ({aggregate.deductions.length})</CardTitle>
            <CardDescription>Retención IRPF (modelo 111/190) y SS trabajador</CardDescription>
          </CardHeader>
          <CardContent>
            {aggregate.deductions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregate.deductions.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.concept || 'N/A'}</TableCell>
                      <TableCell>{d.code || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-rose-600">
                        -{formatCurrency(d.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-rose-50">
                    <TableCell colSpan={2} className="font-bold">Total Deducciones</TableCell>
                    <TableCell className="text-right font-bold font-mono text-rose-700">
                      -{formatCurrency(totalDeductions)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-slate-500 py-6">Sin deducciones</p>
            )}
          </CardContent>
        </Card>
      </div>

      {aggregate.contributions.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Contribuciones empresa por concepto ({aggregate.contributions.length})</CardTitle>
            <CardDescription>Coste SS a cargo de la empresa · base modelo RLC</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Tasa efectiva</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregate.contributions.map((c, i) => {
                  const base = coerceNumber(c.base) ?? 0
                  const contribution = coerceNumber(c.employer_contribution) ?? 0
                  const effRate = base > 0 ? (contribution / base) * 100 : null
                  return (
                    <TableRow key={i}>
                      <TableCell>{c.concept || '—'}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(base)}</TableCell>
                      <TableCell className="text-right">
                        {formatRate(effRate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(contribution)}</TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-[#C6A664]/10">
                  <TableCell colSpan={3} className="font-bold">Total Contribuciones</TableCell>
                  <TableCell className="text-right font-bold font-mono text-[#1B2A41]">
                    {formatCurrency(totalContributions)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface NominaDetailPanelProps {
  nominaData: NominaViewerData
  nominaId: string
  filename?: string
  hasDocument?: boolean
  defaultTab?: 'resumen' | 'percepciones' | 'deducciones' | 'documento'
  compact?: boolean
}

export function NominaDetailPanel({
  nominaData,
  nominaId,
  filename,
  hasDocument = true,
  defaultTab = 'resumen',
  compact = false,
}: NominaDetailPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  return (
    <div className={compact ? 'p-4 bg-slate-50/80' : 'p-2'}>
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as 'resumen' | 'percepciones' | 'deducciones' | 'documento')
        }
        className="w-full"
      >
        <TabsList className={`grid w-full ${hasDocument ? 'grid-cols-4' : 'grid-cols-3'} mb-4`}>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="percepciones">Percepciones</TabsTrigger>
          <TabsTrigger value="deducciones">Deducciones</TabsTrigger>
          {hasDocument && <TabsTrigger value="documento">Documento</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-md bg-gradient-to-br from-[#C6A664]/10 to-[#B8964A]/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CurrencyDollarIcon className="w-4 h-4 text-[#C6A664]" />
                  <span className="text-xs font-medium text-[#1B2A41]">Salario Bruto</span>
                </div>
                <p className="text-2xl font-bold text-[#1B2A41]">{formatCurrency(nominaData.gross_salary)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-emerald-50 to-green-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCardIcon className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Salario Neto</span>
                </div>
                <p className="text-2xl font-bold text-emerald-900">{formatCurrency(nominaData.net_pay)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BuildingOffice2Icon className="w-4 h-4 text-[#C6A664]" />
                  <span className="text-xs font-medium text-[#1B2A41]">Coste Empresa</span>
                </div>
                <p className="text-2xl font-bold text-[#1B2A41]">{formatCurrency(nominaData.cost_empresa)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-slate-50 to-gray-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowTrendingUpIcon className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-medium text-slate-700">Base SS</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(nominaData.base_ss)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4 text-[#C6A664]" />
                  Datos del Empleado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: 'Nombre', value: nominaData.employee?.name },
                  { label: 'DNI', value: nominaData.employee?.dni },
                  { label: 'NSS', value: nominaData.employee?.nss },
                  { label: 'Categoría', value: nominaData.employee?.category },
                  { label: 'Código', value: nominaData.employee?.code },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0 text-sm">
                    <span className="shrink-0 text-slate-600">{label}</span>
                    <span className="min-w-0 flex-1 text-right font-medium text-slate-900 break-words">{value || '—'}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BuildingOffice2Icon className="w-4 h-4 text-emerald-600" />
                  Datos de la Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: 'Empresa', value: nominaData.company?.name },
                  { label: 'CIF', value: nominaData.company?.cif },
                  {
                    label: 'Período',
                    value: nominaData.period_start
                      ? `${nominaData.period_start} → ${nominaData.period_end || '—'}`
                      : undefined,
                  },
                  { label: 'IBAN', value: nominaData.iban },
                  { label: 'SWIFT/BIC', value: nominaData.swift_bic },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0 text-sm">
                    <span className="shrink-0 text-slate-600">{label}</span>
                    <span className="min-w-0 flex-1 text-right font-medium text-slate-900 break-all">{value || '—'}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {nominaData.contributions && nominaData.contributions.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Contribuciones empresa ({nominaData.contributions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Tasa</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nominaData.contributions.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>{c.concept || '—'}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(c.base)}</TableCell>
                        <TableCell className="text-right">{formatRate(c.rate)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(c.employer_contribution)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="percepciones">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Percepciones ({nominaData.perceptions?.length || 0})</CardTitle>
              <CardDescription>Detalle de ingresos y complementos</CardDescription>
            </CardHeader>
            <CardContent>
              {nominaData.perceptions && nominaData.perceptions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nominaData.perceptions.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.concept || 'N/A'}</TableCell>
                        <TableCell>{p.code || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600">
                          {formatCurrency(p.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-emerald-50">
                      <TableCell colSpan={2} className="font-bold">Total Percepciones</TableCell>
                      <TableCell className="text-right font-bold font-mono text-emerald-700">
                        {formatCurrency(sumAmounts(nominaData.perceptions))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-slate-500 py-6">No hay percepciones registradas</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deducciones">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Deducciones ({nominaData.deductions?.length || 0})</CardTitle>
              <CardDescription>Retenciones y descuentos aplicados</CardDescription>
            </CardHeader>
            <CardContent>
              {nominaData.deductions && nominaData.deductions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concepto</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nominaData.deductions.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{d.concept || 'N/A'}</TableCell>
                        <TableCell>{d.code || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-rose-600">
                          -{formatCurrency(d.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-rose-50">
                      <TableCell colSpan={2} className="font-bold">Total Deducciones</TableCell>
                      <TableCell className="text-right font-bold font-mono text-rose-700">
                        -{formatCurrency(sumAmounts(nominaData.deductions))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-slate-500 py-6">No hay deducciones registradas</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {hasDocument && (
          <TabsContent value="documento">
            <NominaPdfPanel nominaId={nominaId} filename={filename} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
