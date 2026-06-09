'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

export interface NominaViewerData {
  id?: string
  nominaId?: string
  period_start?: string
  period_end?: string
  employee?: {
    name?: string
    dni?: string
    nss?: string
    category?: string
    code?: string
  }
  company?: {
    name?: string
    cif?: string
    address?: string
    center_code?: string
  }
  perceptions?: Array<{ code?: string; concept?: string; amount?: number }>
  deductions?: Array<{ code?: string; concept?: string; amount?: number }>
  contributions?: Array<{
    concept?: string
    base?: number
    rate?: number
    employer_contribution?: number
  }>
  base_ss?: number
  net_pay?: number
  gross_salary?: number
  iban?: string
  swift_bic?: string
  cost_empresa?: number
  signed?: boolean
  employee_avatar?: string
}

export interface NominaViewerDocument {
  pdfUrl: string
  pageNumber?: number
  filename?: string
  claudeProcessed?: boolean
  nominaData?: NominaViewerData
}

function formatCurrency(amount: number | undefined) {
  if (!amount) return '€0.00'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

interface NominaViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: NominaViewerDocument | null
  defaultTab?: 'resumen' | 'percepciones' | 'deducciones' | 'documento'
}

export function NominaViewerDialog({
  open,
  onOpenChange,
  document,
  defaultTab = 'resumen',
}: NominaViewerDialogProps) {
  const nominaData = document?.nominaData
  const hasProcessedData = document?.claudeProcessed && nominaData
  const [activeTab, setActiveTab] = useState(defaultTab)

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
    }
  }, [open, defaultTab, document?.nominaData?.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-slate-50">
          <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <DocumentTextIcon className="w-5 h-5 text-white" />
            </div>
            {nominaData?.employee?.name || `Página ${document?.pageNumber ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            {nominaData?.company?.name} • {document?.filename}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6">
          {hasProcessedData ? (
            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as 'resumen' | 'percepciones' | 'deducciones' | 'documento')
              }
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="percepciones">Percepciones</TabsTrigger>
                <TabsTrigger value="deducciones">Deducciones</TabsTrigger>
                <TabsTrigger value="documento">Documento</TabsTrigger>
              </TabsList>

              <TabsContent value="resumen" className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-[#C6A664]/10 to-[#B8964A]/10">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <CurrencyDollarIcon className="w-5 h-5 text-[#C6A664]" />
                        <span className="text-sm font-medium text-[#1B2A41]">Salario Bruto</span>
                      </div>
                      <p className="text-3xl font-bold text-[#1B2A41]">
                        {formatCurrency(nominaData.gross_salary)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-green-50">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCardIcon className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">Salario Neto</span>
                      </div>
                      <p className="text-3xl font-bold text-emerald-900">
                        {formatCurrency(nominaData.net_pay)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <BuildingOffice2Icon className="w-5 h-5 text-[#C6A664]" />
                        <span className="text-sm font-medium text-[#1B2A41]">Coste Empresa</span>
                      </div>
                      <p className="text-3xl font-bold text-[#1B2A41]">
                        {formatCurrency(nominaData.cost_empresa)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-gray-50">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowTrendingUpIcon className="w-5 h-5 text-slate-600" />
                        <span className="text-sm font-medium text-slate-700">Base SS</span>
                      </div>
                      <p className="text-3xl font-bold text-slate-900">
                        {formatCurrency(nominaData.base_ss)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#C6A664]/10 flex items-center justify-center">
                          <BuildingOffice2Icon className="w-4 h-4 text-[#C6A664]" />
                        </div>
                        Datos del Empleado
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { label: 'Nombre', value: nominaData.employee?.name },
                        { label: 'DNI', value: nominaData.employee?.dni },
                        { label: 'NSS', value: nominaData.employee?.nss },
                        { label: 'Categoría', value: nominaData.employee?.category },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                          <span className="text-sm text-slate-600">{label}</span>
                          <span className="text-sm font-medium text-slate-900">{value || '—'}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <BuildingOffice2Icon className="w-4 h-4 text-emerald-600" />
                        </div>
                        Datos de la Empresa
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { label: 'Empresa', value: nominaData.company?.name },
                        { label: 'CIF', value: nominaData.company?.cif },
                        {
                          label: 'Período',
                          value: `${nominaData.period_start} - ${nominaData.period_end}`,
                        },
                        { label: 'IBAN', value: nominaData.iban },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                          <span className="text-sm text-slate-600">{label}</span>
                          <span className="text-sm font-medium text-slate-900 text-right max-w-[200px] truncate">
                            {value || '—'}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="percepciones">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Percepciones ({nominaData.perceptions?.length || 0})</CardTitle>
                    <CardDescription>Detalle de todos los ingresos y complementos</CardDescription>
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
                              {formatCurrency(
                                nominaData.perceptions.reduce((s, p) => s + (p.amount || 0), 0),
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-slate-500 py-8">No hay percepciones registradas</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="deducciones">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Deducciones ({nominaData.deductions?.length || 0})</CardTitle>
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
                              -{formatCurrency(
                                nominaData.deductions.reduce((s, d) => s + (d.amount || 0), 0),
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-slate-500 py-8">No hay deducciones registradas</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="documento">
                <NominaPdfPanel pdfUrl={document?.pdfUrl ?? ''} />
              </TabsContent>
            </Tabs>
          ) : (
            <NominaPdfPanel pdfUrl={document?.pdfUrl ?? ''} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NominaPdfPanel({ pdfUrl }: { pdfUrl: string }) {
  return (
    <div className="h-[60vh] flex flex-col">
      <div className="flex-1 rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50">
        <iframe
          src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1`}
          className="w-full h-full"
          title="PDF Viewer"
          allowFullScreen
          style={{ border: 'none' }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Si el PDF no se muestra correctamente, puedes abrirlo en una nueva pestaña o descargarlo
        </p>
        <div className="flex items-center gap-2">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            <EyeIcon className="w-4 h-4 inline mr-2" />
            Abrir en nueva pestaña
          </a>
          <a
            href={pdfUrl}
            download
            className="px-4 py-2 bg-[#1B2A41] text-white rounded-lg hover:bg-[#152036] transition-colors text-sm font-medium"
          >
            <ArrowDownTrayIcon className="w-4 h-4 inline mr-2" />
            Descargar PDF
          </a>
        </div>
      </div>
    </div>
  )
}
