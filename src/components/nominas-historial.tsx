'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NominaDetailPanel } from '@/components/nomina-detail-panel'
import { NominaEstadoBadge } from '@/components/nomina-estado-badge'
import { NominasSelectionBanner, type SelectionTotals } from '@/components/nominas-selection-banner'
import type { NominaViewerData } from '@/components/nomina-viewer-dialog'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

const HISTORIAL_LIMIT = 25
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface NominaRow {
  id: string
  company_id: string
  employee_id?: string | null
  dni?: string | null
  document_name?: string | null
  period_start?: string
  period_end?: string
  gross_salary?: number
  net_pay?: number
  cost_empresa?: number
  created_at?: string
  employee?: { name?: string; dni?: string; nss?: string; category?: string; code?: string }
  company?: { name?: string; cif?: string }
  perceptions?: NominaViewerData['perceptions']
  deductions?: NominaViewerData['deductions']
  contributions?: NominaViewerData['contributions']
  base_ss?: number
  iban?: string
  swift_bic?: string
  signed?: boolean
  employee_avatar?: string | null
}

function formatCurrency(amount: number | undefined) {
  if (!amount) return '€0.00'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatPeriod(periodStart?: string) {
  if (!periodStart) return '—'
  return new Date(periodStart).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
}

function buildNominaViewerData(nomina: NominaRow): NominaViewerData {
  return {
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
    employee_avatar: nomina.employee_avatar || undefined,
  }
}

interface NominasHistorialProps {
  companyId: string | null
}

export function NominasHistorial({ companyId }: NominasHistorialProps) {
  const [historialNominas, setHistorialNominas] = useState<NominaRow[]>([])
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [historialPage, setHistorialPage] = useState(0)
  const [historialTotal, setHistorialTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDni, setFilterDni] = useState('')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set())
  const [showPeriodPicker, setShowPeriodPicker] = useState(false)
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; nif?: string }>>([])

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    return Array.from({ length: 6 }, (_, i) => current - i)
  }, [])

  const buildQueryString = useCallback(
    (page: number, limit = HISTORIAL_LIMIT) => {
      if (!companyId) return ''
      const params = new URLSearchParams({
        company_id: companyId,
        limit: String(limit),
        offset: String(page * limit),
      })
      if (filterEmployee) params.set('employee_id', filterEmployee)
      if (filterDni.trim()) params.set('dni', filterDni.trim())
      if (selectedPeriods.size > 0) {
        params.set('periods', Array.from(selectedPeriods).sort().join(','))
      }
      return params.toString()
    },
    [companyId, filterEmployee, filterDni, selectedPeriods],
  )

  const loadEmployees = useCallback(async () => {
    if (!companyId) return
    try {
      const response = await fetch(`/api/nominas/employees?company_id=${encodeURIComponent(companyId)}`)
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setEmployees(data.data)
      }
    } catch (error) {
      console.error('[HISTORIAL] Error cargando empleados:', error)
    }
  }, [companyId])

  const loadHistorial = useCallback(
    async (page = 0) => {
      if (!companyId) return
      setIsLoadingHistorial(true)
      try {
        const qs = buildQueryString(page)
        const response = await fetch(`/api/nominas?${qs}`)
        const data = await response.json()
        if (data.success) {
          setHistorialNominas(data.data || [])
          setHistorialTotal(data.total || 0)
          setHistorialPage(page)
          setSelectedIds(new Set())
        }
      } catch (error) {
        console.error('[HISTORIAL] Error cargando nóminas:', error)
      } finally {
        setIsLoadingHistorial(false)
      }
    },
    [companyId, buildQueryString],
  )

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    if (companyId) loadHistorial(0)
  }, [companyId, filterEmployee, filterDni, selectedPeriods])

  const togglePeriod = (monthIndex: number) => {
    const value = `${filterYear}-${String(monthIndex + 1).padStart(2, '0')}`
    setSelectedPeriods((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const selectAllMonthsInYear = () => {
    setSelectedPeriods((prev) => {
      const next = new Set(prev)
      for (let i = 0; i < 12; i++) {
        next.add(`${filterYear}-${String(i + 1).padStart(2, '0')}`)
      }
      return next
    })
  }

  const clearFilters = () => {
    setFilterEmployee('')
    setFilterDni('')
    setSelectedPeriods(new Set())
    setShowPeriodPicker(false)
  }

  const pageIds = historialNominas.map((n) => n.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageIds.some((id) => selectedIds.has(id))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected && !allPageSelected
    }
  }, [somePageSelected, allPageSelected])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id))
      } else {
        pageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const fetchAllFilteredIds = async (): Promise<string[]> => {
    const qs = buildQueryString(0, Math.max(historialTotal, 1))
    const response = await fetch(`/api/nominas?${qs}`)
    const data = await response.json()
    if (!data.success) return []
    return (data.data || []).map((n: NominaRow) => n.id)
  }

  const handleExport = async () => {
    if (!companyId) return
    setIsExporting(true)
    try {
      let ids: string[]
      if (selectedIds.size > 0) {
        ids = Array.from(selectedIds)
      } else {
        ids = await fetchAllFilteredIds()
      }

      if (ids.length === 0) {
        alert('No hay nóminas para exportar con los filtros actuales.')
        return
      }

      const response = await fetch('/api/nominas/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, nominaIds: ids }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Error al exportar')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Nominas_export_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[HISTORIAL] Error exportando:', error)
      alert(error instanceof Error ? error.message : 'Error al exportar')
    } finally {
      setIsExporting(false)
    }
  }

  const deleteNomina = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta nómina del historial?')) return
    try {
      const response = await fetch(`/api/nominas?id=${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        if (expandedId === id) setExpandedId(null)
        loadHistorial(historialPage)
      }
    } catch (error) {
      console.error('Error eliminando nómina:', error)
    }
  }

  const hasActiveFilters = filterEmployee || filterDni.trim() || selectedPeriods.size > 0

  const selectionTotals = useMemo((): SelectionTotals => {
    const selected = historialNominas.filter((n) => selectedIds.has(n.id))
    return {
      count: selected.length,
      gross: selected.reduce((sum, n) => sum + (n.gross_salary || 0), 0),
      net: selected.reduce((sum, n) => sum + (n.net_pay || 0), 0),
      cost: selected.reduce((sum, n) => sum + (n.cost_empresa || 0), 0),
      signed: selected.filter((n) => n.signed).length,
      sent: selected.filter((n) => !n.signed).length,
    }
  }, [historialNominas, selectedIds])

  const clearSelection = () => setSelectedIds(new Set())

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`¿Eliminar ${selectedIds.size} nómina(s) del historial?`)) return

    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/nominas?id=${id}`, { method: 'DELETE' }).then((r) => r.json()),
        ),
      )
      setExpandedId(null)
      clearSelection()
      loadHistorial(historialPage)
    } catch (error) {
      console.error('[HISTORIAL] Error eliminando selección:', error)
      alert('No se pudieron eliminar todas las nóminas seleccionadas.')
    }
  }

  const showSelectionBanner = selectedIds.size > 1

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center shadow-lg">
              <ArrowUturnLeftIcon className="w-8 h-8 text-[#C6A664]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Ver Nóminas</h1>
              <p className="text-sm text-slate-500">
                {historialTotal} nóminas
                {selectedIds.size > 0 ? ` · ${selectedIds.size} seleccionadas` : ''}
              </p>
            </div>
          </div>

          {companyId && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664] min-w-[180px] max-w-[240px]"
              >
                <option value="">Todos los empleados</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{emp.nif ? ` (${emp.nif})` : ''}
                  </option>
                ))}
              </select>

              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={filterDni}
                  onChange={(e) => setFilterDni(e.target.value)}
                  placeholder="Buscar por DNI o nombre"
                  className="h-9 pl-8 w-[200px] sm:w-[220px] text-sm"
                />
              </div>

              <Button
                variant={showPeriodPicker ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowPeriodPicker((v) => !v)}
                className={cn(
                  'gap-1.5 text-xs h-9',
                  showPeriodPicker && 'bg-[#1B2A41] hover:bg-[#152036]',
                )}
              >
                <CalendarDaysIcon className="w-4 h-4" />
                Período
                {selectedPeriods.size > 0 && (
                  <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">
                    {selectedPeriods.size}
                  </span>
                )}
              </Button>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs h-9">
                  <XMarkIcon className="w-3.5 h-3.5" />
                  Limpiar filtros
                </Button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting || historialTotal === 0}
                  className="border-[#C6A664]/30 text-[#1B2A41] hover:bg-[#C6A664]/10 h-9"
                >
                  <ArrowDownTrayIcon className={`w-4 h-4 ${isExporting ? 'animate-pulse' : ''}`} />
                  <span className="ml-2">
                    {isExporting ? 'Exportando…' : selectedIds.size > 0 ? 'Exportar selección' : 'Exportar filtrado'}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadHistorial(historialPage)}
                  disabled={isLoadingHistorial}
                  className="border-[#C6A664]/30 text-[#1B2A41] hover:bg-[#C6A664]/10 h-9"
                >
                  <ArrowPathIcon className={`w-4 h-4 ${isLoadingHistorial ? 'animate-spin' : ''}`} />
                  <span className="ml-2">Actualizar</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {!companyId ? (
          <div className="text-center py-16 bg-slate-50 rounded-xl">
            <p className="text-slate-600">Falta el parámetro company_id en la URL.</p>
          </div>
        ) : (
          <>
            {showPeriodPicker && (
              <Card className="p-4 border-slate-200 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <CalendarDaysIcon className="w-5 h-5 text-[#C6A664]" />
                      <span className="text-sm font-medium text-slate-700">Seleccionar meses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(parseInt(e.target.value, 10))}
                        className="h-8 px-2 rounded-md border border-slate-300 bg-white text-sm"
                      >
                        {yearOptions.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <Button variant="outline" size="sm" onClick={selectAllMonthsInYear} className="text-xs h-8">
                        Todo {filterYear}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPeriods(new Set())}
                        className="text-xs h-8"
                      >
                        Desmarcar
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                    {MONTH_LABELS.map((label, index) => {
                      const value = `${filterYear}-${String(index + 1).padStart(2, '0')}`
                      const checked = selectedPeriods.has(value)
                      return (
                        <label
                          key={value}
                          className={cn(
                            'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs cursor-pointer transition-colors',
                            checked
                              ? 'border-[#C6A664] bg-[#C6A664]/10 text-[#1B2A41] font-semibold'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => togglePeriod(index)}
                          />
                          {label}
                        </label>
                      )
                    })}
                  </div>
                  {selectedPeriods.size > 0 && (
                    <p className="mt-3 text-xs text-slate-500">
                      {selectedPeriods.size} mes(es) seleccionado(s):{' '}
                      {Array.from(selectedPeriods).sort().join(', ')}
                    </p>
                  )}
                </Card>
            )}

            {isLoadingHistorial && historialNominas.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-[#C6A664]" />
              </div>
            ) : historialNominas.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-xl">
                <h3 className="text-lg font-semibold text-slate-600 mb-1">Sin nóminas</h3>
                <p className="text-slate-500 text-sm">
                  {hasActiveFilters
                    ? 'No hay resultados con los filtros aplicados'
                    : 'Aún no hay nóminas procesadas para esta empresa'}
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-[44px] px-3 text-center">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={allPageSelected}
                            onChange={toggleSelectAllPage}
                            className="rounded border-slate-300"
                            aria-label="Seleccionar todas las nóminas de la página"
                          />
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">Empleado</TableHead>
                        <TableHead className="font-semibold text-slate-700">Empresa</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center">Período</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center">Bruto</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center">Neto</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center">Coste Emp.</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center">Estado</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center">Fecha</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historialNominas.map((nomina) => {
                        const isExpanded = expandedId === nomina.id
                        const isSelected = selectedIds.has(nomina.id)
                        return (
                          <Fragment key={nomina.id}>
                            <TableRow
                              className={cn(
                                'hover:bg-slate-50/50',
                                isExpanded && 'bg-slate-50/80',
                                isSelected && 'bg-[#C6A664]/5',
                              )}
                            >
                              <TableCell className="px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(nomina.id)}
                                  className="rounded border-slate-300"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </TableCell>
                              <TableCell>
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(isExpanded ? null : nomina.id)}
                                  className="flex items-center gap-2 text-left w-full group"
                                >
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
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-800 text-sm group-hover:text-[#1B2A41]">
                                      {nomina.employee?.name || 'Sin nombre'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {nomina.dni || nomina.employee?.dni || '—'}
                                    </p>
                                  </div>
                                  <ChevronDownIcon
                                    className={cn(
                                      'w-4 h-4 text-slate-400 transition-transform flex-shrink-0',
                                      isExpanded && 'rotate-180',
                                    )}
                                  />
                                </button>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-slate-700">{nomina.company?.name || '—'}</p>
                              </TableCell>
                              <TableCell className="text-center text-sm text-slate-600">
                                {formatPeriod(nomina.period_start)}
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
                                <NominaEstadoBadge signed={nomina.signed} />
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="text-xs text-slate-500">
                                  {nomina.created_at
                                    ? new Date(nomina.created_at).toLocaleDateString('es-ES')
                                    : '—'}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteNomina(nomina.id)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                  title="Eliminar"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                <TableCell colSpan={10} className="p-0 border-t border-slate-200">
                                  <NominaDetailPanel
                                    nominaData={buildNominaViewerData(nomina)}
                                    nominaId={nomina.id}
                                    filename={nomina.document_name || undefined}
                                    hasDocument={!!nomina.document_name}
                                    compact
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <NominasSelectionBanner
                  visible={showSelectionBanner}
                  totals={selectionTotals}
                  isExporting={isExporting}
                  onExport={handleExport}
                  onClear={clearSelection}
                  onDelete={deleteSelected}
                />

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
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadHistorial(historialPage + 1)}
                        disabled={(historialPage + 1) * HISTORIAL_LIMIT >= historialTotal || isLoadingHistorial}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
