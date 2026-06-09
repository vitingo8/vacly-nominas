'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  NominaViewerDialog,
  type NominaViewerDocument,
} from '@/components/nomina-viewer-dialog'
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CalendarIcon,
  DocumentTextIcon,
  TableCellsIcon,
  TrashIcon,
  UserIcon,
} from '@heroicons/react/24/outline'

const HISTORIAL_LIMIT = 10

function formatCurrency(amount: number | undefined) {
  if (!amount) return '€0.00'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

interface NominasHistorialProps {
  companyId: string | null
}

export function NominasHistorial({ companyId }: NominasHistorialProps) {
  const [historialNominas, setHistorialNominas] = useState<any[]>([])
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false)
  const [historialPage, setHistorialPage] = useState(0)
  const [historialTotal, setHistorialTotal] = useState(0)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [viewerDocument, setViewerDocument] = useState<NominaViewerDocument | null>(null)
  const [viewerDefaultTab, setViewerDefaultTab] = useState<'resumen' | 'documento'>('resumen')
  const [loadingPdfId, setLoadingPdfId] = useState<string | null>(null)

  const loadHistorial = async (page = 0) => {
    if (!companyId) return
    setIsLoadingHistorial(true)
    try {
      const response = await fetch(
        `/api/nominas?limit=${HISTORIAL_LIMIT}&offset=${page * HISTORIAL_LIMIT}&company_id=${companyId}`,
      )
      const data = await response.json()
      if (data.success) {
        setHistorialNominas(data.data || [])
        setHistorialTotal(data.total || 0)
        setHistorialPage(page)
      }
    } catch (error) {
      console.error('[HISTORIAL] Error cargando nóminas:', error)
    } finally {
      setIsLoadingHistorial(false)
    }
  }

  useEffect(() => {
    if (companyId) {
      loadHistorial(0)
    }
  }, [companyId])

  const deleteNomina = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta nómina del historial?')) return
    try {
      const response = await fetch(`/api/nominas?id=${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        loadHistorial(historialPage)
      }
    } catch (error) {
      console.error('Error eliminando nómina:', error)
    }
  }

  const buildViewerDocument = (nomina: any, pdfUrl = ''): NominaViewerDocument => ({
    pdfUrl,
    pageNumber: 1,
    filename: nomina.document_name || `nomina_${nomina.id}.pdf`,
    claudeProcessed: true,
    nominaData: {
      id: nomina.id,
      nominaId: nomina.id,
      period_start: nomina.period_start,
      period_end: nomina.period_end,
      employee: nomina.employee,
      company: nomina.company,
      perceptions: nomina.perceptions,
      deductions: nomina.deductions,
      contributions: nomina.contributions,
      base_ss: nomina.base_ss,
      net_pay: nomina.net_pay,
      gross_salary: nomina.gross_salary,
      iban: nomina.iban,
      swift_bic: nomina.swift_bic,
      cost_empresa: nomina.cost_empresa,
      signed: nomina.signed,
      employee_avatar: nomina.employee_avatar,
    },
  })

  const fetchDocumentUrl = async (nominaId: string): Promise<string> => {
    const response = await fetch(`/api/nominas/document-url?id=${nominaId}`)
    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No se pudo obtener el documento')
    }
    return data.url as string
  }

  const openDigitalViewer = async (nomina: any) => {
    try {
      let pdfUrl = ''
      if (nomina.document_name) {
        try {
          pdfUrl = await fetchDocumentUrl(nomina.id)
        } catch (pdfError) {
          console.warn('[HISTORIAL] PDF no disponible para vista digital:', pdfError)
        }
      }

      setViewerDefaultTab('resumen')
      setViewerDocument(buildViewerDocument(nomina, pdfUrl))
      setIsViewerOpen(true)
    } catch (error) {
      console.error('[HISTORIAL] Error abriendo vista digital:', error)
      alert('Error al abrir la nómina digital. Por favor, intenta de nuevo.')
    }
  }

  const openPdfDocument = async (nomina: any) => {
    setLoadingPdfId(nomina.id)
    try {
      const pdfUrl = await fetchDocumentUrl(nomina.id)
      setViewerDefaultTab('documento')
      setViewerDocument(buildViewerDocument(nomina, pdfUrl))
      setIsViewerOpen(true)
    } catch (error) {
      console.error('[HISTORIAL] Error abriendo documento PDF:', error)
      alert(
        error instanceof Error
          ? error.message
          : 'Error al abrir el documento. Por favor, intenta de nuevo.',
      )
    } finally {
      setLoadingPdfId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center shadow-lg">
              <ArrowUturnLeftIcon className="w-8 h-8 text-[#C6A664]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Ver Nóminas</h1>
              <p className="text-sm text-slate-500">{historialTotal} páginas de nómina en total</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadHistorial(historialPage)}
            disabled={isLoadingHistorial || !companyId}
            className="border-[#C6A664]/30 text-[#1B2A41] hover:bg-[#C6A664]/10"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isLoadingHistorial ? 'animate-spin' : ''}`} />
            <span className="ml-2">Actualizar</span>
          </Button>
        </div>

        {!companyId ? (
          <div className="text-center py-16 bg-slate-50 rounded-xl">
            <p className="text-slate-600">Falta el parámetro company_id en la URL.</p>
          </div>
        ) : isLoadingHistorial && historialNominas.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <ArrowPathIcon className="w-8 h-8 animate-spin text-[#C6A664]" />
          </div>
        ) : historialNominas.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-xl">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5 flex items-center justify-center mx-auto mb-4">
              <ArrowUturnLeftIcon className="w-10 h-10 text-[#C6A664]/50" />
            </div>
            <h3 className="text-lg font-semibold text-slate-600 mb-1">Sin nóminas</h3>
            <p className="text-slate-500 text-sm">Aún no hay nóminas procesadas para esta empresa</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-700">Empleado</TableHead>
                    <TableHead className="font-semibold text-slate-700">Empresa</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Período</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Bruto</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Neto</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Coste Emp.</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Fecha</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center w-28">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historialNominas.map((nomina) => (
                    <TableRow key={nomina.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {nomina.employee_avatar ? (
                            <img
                              src={nomina.employee_avatar}
                              alt={nomina.employee?.name || 'Avatar'}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                              <UserIcon className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-800 text-sm">
                              {nomina.employee?.name || 'Sin nombre'}
                            </p>
                            <p className="text-xs text-slate-500">{nomina.dni || nomina.employee?.dni || '—'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-700">{nomina.company?.name || '—'}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5 text-sm text-slate-600">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {nomina.period_start
                            ? new Date(nomina.period_start).toLocaleDateString('es-ES', {
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm font-semibold text-[#1B2A41]">
                          {formatCurrency(nomina.gross_salary)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm font-semibold text-emerald-600">
                          {formatCurrency(nomina.net_pay)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm font-semibold text-[#C6A664]">
                          {formatCurrency(nomina.cost_empresa)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs text-slate-500">
                          {nomina.created_at
                            ? new Date(nomina.created_at).toLocaleDateString('es-ES')
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDigitalViewer(nomina)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                            title="Ver nómina digital"
                          >
                            <TableCellsIcon className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPdfDocument(nomina)}
                            disabled={!nomina.document_name || loadingPdfId === nomina.id}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-primary hover:bg-primary/10 disabled:opacity-40"
                            title="Ver documento PDF"
                          >
                            <DocumentTextIcon
                              className={`w-3.5 h-3.5 ${loadingPdfId === nomina.id ? 'animate-pulse' : ''}`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteNomina(nomina.id)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Eliminar"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {historialTotal > HISTORIAL_LIMIT && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-slate-500">
                  Mostrando {historialPage * HISTORIAL_LIMIT + 1}-
                  {Math.min((historialPage + 1) * HISTORIAL_LIMIT, historialTotal)} de {historialTotal}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadHistorial(historialPage - 1)}
                    disabled={historialPage === 0 || isLoadingHistorial}
                    className="border-slate-200"
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadHistorial(historialPage + 1)}
                    disabled={(historialPage + 1) * HISTORIAL_LIMIT >= historialTotal || isLoadingHistorial}
                    className="border-slate-200"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <NominaViewerDialog
        open={isViewerOpen}
        onOpenChange={setIsViewerOpen}
        document={viewerDocument}
        defaultTab={viewerDefaultTab}
      />
    </div>
  )
}
