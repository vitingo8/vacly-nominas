'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NominaDetailPanel, NominaAggregatePanel, type NominaAggregate } from '@/components/nomina-detail-panel'
import { NominaEstadoBadge } from '@/components/nomina-estado-badge'
import { NominasSelectionBanner, type SelectionTotals } from '@/components/nominas-selection-banner'
import { EmployeeFilterSelect, type EmployeeFilterOption } from '@/components/employee-filter-select'
import { ExcelColumnHeader } from '@/components/excel-column-header'
import type { NominaEstadoFilter, NominaSortColumn, NominaSortDir } from '@/lib/nomina-list-query'
import type { NominaViewerData } from '@/components/nomina-viewer-dialog'
import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  RectangleGroupIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { useEmbeddedMode } from '@/lib/embedded-mode'

const HISTORIAL_LIMIT = 25
const GROUPED_FETCH_LIMIT = 2000
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

type RangePreset = 'all' | 'currentYear' | 'lastYear' | 'currentQuarter' | 'lastQuarter' | 'custom'
type GroupBy = 'none' | 'month' | 'quarter' | 'year'

const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: 'all', label: 'Todo el histórico' },
  { value: 'currentYear', label: 'Año actual' },
  { value: 'lastYear', label: 'Año anterior' },
  { value: 'currentQuarter', label: 'Trimestre actual' },
  { value: 'lastQuarter', label: 'Trimestre anterior' },
  { value: 'custom', label: 'Personalizado' },
]

const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'none', label: 'Sin grupo (cada nómina)' },
  { value: 'month', label: 'Mes' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Año' },
]

const SHORT_RANGE_LABELS: Record<RangePreset, string> = {
  all: 'Todo',
  currentYear: 'Año act.',
  lastYear: 'Año ant.',
  currentQuarter: 'Trim. act.',
  lastQuarter: 'Trim. ant.',
  custom: 'Custom',
}

const SHORT_GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Ninguno',
  month: 'Mes',
  quarter: 'Trim.',
  year: 'Año',
}


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
  base_ss?: number
  created_at?: string
  employee?: { name?: string; dni?: string; nss?: string; category?: string; code?: string }
  company?: { name?: string; cif?: string }
  perceptions?: NominaViewerData['perceptions']
  deductions?: NominaViewerData['deductions']
  contributions?: NominaViewerData['contributions']
  iban?: string
  swift_bic?: string
  signed?: boolean
  employee_avatar?: string | null
}

interface NominaGroup {
  key: string
  label: string
  aggregate: NominaAggregate
}

function formatCurrency(amount: number | undefined) {
  if (!amount) return '€0.00'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatPeriod(periodStart?: string) {
  if (!periodStart) return '—'
  return new Date(periodStart).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
}

function lastDayOfMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate()
}

function quarterRange(year: number, qIndex: number) {
  const startMonth = qIndex * 3 + 1
  const endMonth = startMonth + 2
  return {
    from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    to: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDayOfMonth(year, endMonth)).padStart(2, '0')}`,
  }
}

function computeBaseRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  const now = new Date()
  const year = now.getFullYear()
  const currentQ = Math.floor(now.getMonth() / 3) // 0..3

  switch (preset) {
    case 'currentYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
    case 'currentQuarter':
      return quarterRange(year, currentQ)
    case 'lastQuarter':
      return currentQ === 0 ? quarterRange(year - 1, 3) : quarterRange(year, currentQ - 1)
    case 'custom': {
      const range: { from?: string; to?: string } = {}
      if (customFrom) range.from = `${customFrom}-01`
      if (customTo) {
        const [cy, cm] = customTo.split('-').map((n) => parseInt(n, 10))
        if (cy && cm) range.to = `${customTo}-${String(lastDayOfMonth(cy, cm)).padStart(2, '0')}`
      }
      return range
    }
    case 'all':
    default:
      return {}
  }
}

function groupKeyLabel(periodStart: string, groupBy: GroupBy): { key: string; label: string } {
  const d = new Date(periodStart)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  switch (groupBy) {
    case 'year':
      return { key: `${year}`, label: `${year}` }
    case 'quarter': {
      const q = Math.floor((month - 1) / 3) + 1
      return { key: `${year}-Q${q}`, label: `T${q} ${year}` }
    }
    case 'month':
    default:
      return { key: `${year}-${String(month).padStart(2, '0')}`, label: `${MONTH_LABELS[month - 1]} ${year}` }
  }
}

function buildAggregate(nominas: NominaRow[]): NominaAggregate {
  const perceptionsMap = new Map<string, { code?: string; concept?: string; amount: number }>()
  const deductionsMap = new Map<string, { code?: string; concept?: string; amount: number }>()
  const contributionsMap = new Map<string, { concept?: string; base: number; employer_contribution: number }>()

  let gross = 0
  let net = 0
  let cost = 0
  let baseSs = 0

  for (const n of nominas) {
    gross += n.gross_salary || 0
    net += n.net_pay || 0
    cost += n.cost_empresa || 0
    baseSs += n.base_ss || 0

    for (const p of n.perceptions || []) {
      const key = `${p.code || ''}||${p.concept || ''}`
      const prev = perceptionsMap.get(key)
      if (prev) prev.amount += p.amount || 0
      else perceptionsMap.set(key, { code: p.code, concept: p.concept, amount: p.amount || 0 })
    }
    for (const d of n.deductions || []) {
      const key = `${d.code || ''}||${d.concept || ''}`
      const prev = deductionsMap.get(key)
      if (prev) prev.amount += d.amount || 0
      else deductionsMap.set(key, { code: d.code, concept: d.concept, amount: d.amount || 0 })
    }
    for (const c of n.contributions || []) {
      const key = c.concept || ''
      const prev = contributionsMap.get(key)
      if (prev) {
        prev.base += c.base || 0
        prev.employer_contribution += c.employer_contribution || 0
      } else {
        contributionsMap.set(key, {
          concept: c.concept,
          base: c.base || 0,
          employer_contribution: c.employer_contribution || 0,
        })
      }
    }
  }

  return {
    count: nominas.length,
    gross,
    net,
    cost,
    baseSs,
    perceptions: Array.from(perceptionsMap.values()).sort((a, b) => b.amount - a.amount),
    deductions: Array.from(deductionsMap.values()).sort((a, b) => b.amount - a.amount),
    contributions: Array.from(contributionsMap.values()),
  }
}

function buildGroups(nominas: NominaRow[], groupBy: GroupBy): NominaGroup[] {
  const buckets = new Map<string, { label: string; rows: NominaRow[] }>()
  for (const n of nominas) {
    if (!n.period_start) continue
    const { key, label } = groupKeyLabel(n.period_start, groupBy)
    const bucket = buckets.get(key)
    if (bucket) bucket.rows.push(n)
    else buckets.set(key, { label, rows: [n] })
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, { label, rows }]) => ({ key, label, aggregate: buildAggregate(rows) }))
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
  const [groupedNominas, setGroupedNominas] = useState<NominaRow[]>([])
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [historialPage, setHistorialPage] = useState(0)
  const [historialTotal, setHistorialTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDni, setFilterDni] = useState('')
  const [employees, setEmployees] = useState<EmployeeFilterOption[]>([])

  const [rangePreset, setRangePreset] = useState<RangePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement>(null)

  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const isEmbedded = useEmbeddedMode()
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const groupMenuRef = useRef<HTMLDivElement>(null)

  const [sortColumn, setSortColumn] = useState<NominaSortColumn>('period_start')
  const [sortDir, setSortDir] = useState<NominaSortDir>('desc')
  const [columnFilters, setColumnFilters] = useState<{
    employee_name: string
    company_name: string
    estado: NominaEstadoFilter
  }>({ employee_name: '', company_name: '', estado: '' })
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [columnFilterDraft, setColumnFilterDraft] = useState({ employee_name: '', company_name: '' })
  const columnFiltersRef = useRef<HTMLTableSectionElement>(null)

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === filterEmployee),
    [employees, filterEmployee],
  )

  const effectiveRange = useMemo(() => {
    const range = computeBaseRange(rangePreset, customFrom, customTo)
    // Filtrado jerárquico: un empleado nunca tiene nóminas antes de su alta.
    if (selectedEmployee?.hire_date) {
      const hire = selectedEmployee.hire_date.slice(0, 10)
      if (!range.from || hire > range.from) range.from = hire
    }
    return range
  }, [rangePreset, customFrom, customTo, selectedEmployee])

  const rangeKey = `${effectiveRange.from || ''}_${effectiveRange.to || ''}`

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
      if (effectiveRange.from) params.set('date_from', effectiveRange.from)
      if (effectiveRange.to) params.set('date_to', effectiveRange.to)
      params.set('sort_by', sortColumn)
      params.set('sort_dir', sortDir)
      if (columnFilters.employee_name.trim()) params.set('col_employee', columnFilters.employee_name.trim())
      if (columnFilters.company_name.trim()) params.set('col_company', columnFilters.company_name.trim())
      if (columnFilters.estado) params.set('col_estado', columnFilters.estado)
      return params.toString()
    },
    [companyId, filterEmployee, filterDni, effectiveRange, sortColumn, sortDir, columnFilters],
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

  const loadGrouped = useCallback(async () => {
    if (!companyId) return
    setIsLoadingHistorial(true)
    try {
      const qs = buildQueryString(0, GROUPED_FETCH_LIMIT)
      const response = await fetch(`/api/nominas?${qs}`)
      const data = await response.json()
      if (data.success) {
        setGroupedNominas(data.data || [])
        setHistorialTotal(data.total || 0)
      }
    } catch (error) {
      console.error('[HISTORIAL] Error cargando agrupado:', error)
    } finally {
      setIsLoadingHistorial(false)
    }
  }, [companyId, buildQueryString])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    if (!companyId) return
    setExpandedId(null)
    setExpandedGroup(null)
    if (groupBy === 'none') loadHistorial(0)
    else loadGrouped()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, filterEmployee, filterDni, rangeKey, groupBy, sortColumn, sortDir, columnFilters])

  useEffect(() => {
    if (!showFilterMenu && !showGroupMenu && !openColumnFilter) return
    const handler = (e: MouseEvent) => {
      if (showFilterMenu && filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false)
      }
      if (showGroupMenu && groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) {
        setShowGroupMenu(false)
      }
      if (
        openColumnFilter &&
        columnFiltersRef.current &&
        !columnFiltersRef.current.contains(e.target as Node)
      ) {
        setOpenColumnFilter(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterMenu, showGroupMenu, openColumnFilter])

  const clearFilters = () => {
    setFilterEmployee('')
    setFilterDni('')
    setRangePreset('all')
    setCustomFrom('')
    setCustomTo('')
    setShowFilterMenu(false)
    setColumnFilters({ employee_name: '', company_name: '', estado: '' })
    setColumnFilterDraft({ employee_name: '', company_name: '' })
    setOpenColumnFilter(null)
    setSortColumn('period_start')
    setSortDir('desc')
  }

  const toggleSort = (column: NominaSortColumn) => {
    if (sortColumn === column) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDir(column === 'employee_name' || column === 'company_name' ? 'asc' : 'desc')
    }
  }

  const openColumnFilterMenu = (key: string) => {
    setOpenColumnFilter((current) => (current === key ? null : key))
    if (key === 'employee_name') {
      setColumnFilterDraft((d) => ({ ...d, employee_name: columnFilters.employee_name }))
    }
    if (key === 'company_name') {
      setColumnFilterDraft((d) => ({ ...d, company_name: columnFilters.company_name }))
    }
  }

  const applyTextColumnFilter = (key: 'employee_name' | 'company_name') => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: columnFilterDraft[key].trim(),
    }))
    setOpenColumnFilter(null)
  }

  const applyEstadoColumnFilter = (estado: NominaEstadoFilter) => {
    setColumnFilters((prev) => ({ ...prev, estado }))
    setOpenColumnFilter(null)
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
    const qs = buildQueryString(0, Math.max(historialTotal, GROUPED_FETCH_LIMIT))
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

  const reload = () => {
    if (groupBy === 'none') loadHistorial(historialPage)
    else loadGrouped()
  }

  const deleteNomina = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta nómina del historial?')) return
    try {
      const response = await fetch(`/api/nominas?id=${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        if (expandedId === id) setExpandedId(null)
        reload()
      }
    } catch (error) {
      console.error('Error eliminando nómina:', error)
    }
  }

  const hasActiveFilters =
    Boolean(filterEmployee) ||
    Boolean(filterDni.trim()) ||
    rangePreset !== 'all' ||
    Boolean(columnFilters.employee_name.trim()) ||
    Boolean(columnFilters.company_name.trim()) ||
    Boolean(columnFilters.estado) ||
    sortColumn !== 'period_start' ||
    sortDir !== 'desc'

  const activePresetLabel = RANGE_PRESETS.find((p) => p.value === rangePreset)?.label || 'Todo el histórico'
  const shortPresetLabel = SHORT_RANGE_LABELS[rangePreset] || 'Todo'
  const activeGroupLabel = GROUP_OPTIONS.find((g) => g.value === groupBy)?.label || ''
  const shortGroupLabel = SHORT_GROUP_LABELS[groupBy] || 'Ninguno'

  const groups = useMemo(
    () => (groupBy === 'none' ? [] : buildGroups(groupedNominas, groupBy)),
    [groupedNominas, groupBy],
  )

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

  const showSelectionBanner = groupBy === 'none' && selectedIds.size > 1
  const tableBottomPadding = showSelectionBanner ? 'pb-28' : isEmbedded ? 'pb-12' : 'pb-8'

  return (
    <div
      className={cn(
        'bg-gradient-to-br from-slate-50 via-white to-slate-100',
        isEmbedded ? 'min-h-full w-full' : 'min-h-screen',
      )}
    >
      <div
        className={cn(
          'flex w-full flex-col py-4 sm:py-6',
          isEmbedded ? 'px-3 sm:px-4' : 'px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 sm:py-8',
          isEmbedded ? tableBottomPadding : 'pb-28',
        )}
      >
        <div className="mb-6 w-full min-w-0">
          {!isEmbedded && (
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center shadow-lg">
                <ArrowUturnLeftIcon className="w-8 h-8 text-[#C6A664]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Ver Nóminas</h1>
                <p className="text-sm text-slate-500">
                  {historialTotal} nóminas
                  {groupBy !== 'none' ? ` · ${groups.length} ${activeGroupLabel.toLowerCase()}` : ''}
                  {groupBy === 'none' && selectedIds.size > 0 ? ` · ${selectedIds.size} seleccionadas` : ''}
                </p>
              </div>
            </div>
          )}

          {companyId && (
            <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5">
              <EmployeeFilterSelect
                value={filterEmployee}
                onChange={setFilterEmployee}
                employees={employees}
                className="min-w-[12rem] max-w-[18rem] flex-[1.5_1_14rem] sm:min-w-[14rem] sm:max-w-[20rem]"
              />

              <div className="relative min-w-[4.25rem] max-w-[5.5rem] shrink-0 flex-[0_1_5rem] sm:max-w-[6.5rem]">
                <MagnifyingGlassIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={filterDni}
                  onChange={(e) => setFilterDni(e.target.value)}
                  placeholder="DNI"
                  title="Buscar por DNI o nombre"
                  className="h-8 w-full min-w-0 pl-7 text-xs"
                />
              </div>

              {/* Filtro por rango de fechas (presets) */}
              <div className="relative shrink-0" ref={filterMenuRef}>
                <Button
                  type="button"
                  variant={rangePreset !== 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFilterMenu((v) => !v)}
                  title={activePresetLabel}
                  className={cn(
                    'h-8 min-w-[6.25rem] shrink-0 gap-1 px-2.5 text-xs',
                    rangePreset !== 'all' && 'bg-[#1B2A41] hover:bg-[#152036]',
                  )}
                >
                  <FunnelIcon className="h-4 w-4 shrink-0" />
                  <span className="max-w-[5.5rem] truncate">{shortPresetLabel}</span>
                  <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
                </Button>

                {showFilterMenu && (
                  <div className="absolute left-0 top-full z-[200] mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                    {RANGE_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          setRangePreset(preset.value)
                          if (preset.value !== 'custom') setShowFilterMenu(false)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                          rangePreset === preset.value
                            ? 'bg-[#C6A664]/15 text-[#1B2A41] font-semibold'
                            : 'text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {preset.label}
                        {rangePreset === preset.value && <span className="text-[#C6A664]">✓</span>}
                      </button>
                    ))}

                    {rangePreset === 'custom' && (
                      <div className="mt-1 space-y-2 border-t border-slate-100 px-3 py-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Desde (mm/aaaa)
                          </label>
                          <input
                            type="month"
                            value={customFrom}
                            onChange={(e) => setCustomFrom(e.target.value)}
                            className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Hasta (mm/aaaa)
                          </label>
                          <input
                            type="month"
                            value={customTo}
                            onChange={(e) => setCustomTo(e.target.value)}
                            className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setShowFilterMenu(false)}
                          className="h-8 w-full bg-[#1B2A41] text-xs hover:bg-[#152036]"
                        >
                          Aplicar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Agrupación */}
              <div className="relative shrink-0" ref={groupMenuRef}>
                <Button
                  type="button"
                  variant={groupBy !== 'none' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowGroupMenu((v) => !v)}
                  title={`Agrupar: ${activeGroupLabel.replace(' (cada nómina)', '')}`}
                  className={cn(
                    'h-8 min-w-[6rem] shrink-0 gap-1 px-2.5 text-xs',
                    groupBy !== 'none' && 'bg-[#C6A664] text-[#1B2A41] hover:bg-[#d4b574]',
                  )}
                >
                  <RectangleGroupIcon className="h-4 w-4 shrink-0" />
                  <span className="max-w-[4.5rem] truncate">{shortGroupLabel}</span>
                  <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
                </Button>

                {showGroupMenu && (
                  <div className="absolute left-0 top-full z-[200] mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                    {GROUP_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setGroupBy(opt.value)
                          setShowGroupMenu(false)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                          groupBy === opt.value
                            ? 'bg-[#C6A664]/15 text-[#1B2A41] font-semibold'
                            : 'text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {opt.label}
                        {groupBy === opt.value && <span className="text-[#C6A664]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  title="Limpiar filtros"
                  className="h-8 w-8 shrink-0 p-0 text-slate-500 hover:text-slate-800"
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting || historialTotal === 0}
                  title={isExporting ? 'Exportando…' : selectedIds.size > 0 ? 'Exportar selección' : 'Exportar filtrado'}
                  className="h-8 shrink-0 border-[#C6A664]/30 px-2 text-[#1B2A41] hover:bg-[#C6A664]/10"
                >
                  <ArrowDownTrayIcon className={`h-4 w-4 ${isExporting ? 'animate-pulse' : ''}`} />
                  <span className="ml-1 hidden max-w-[4.5rem] truncate text-xs 2xl:inline">
                    {isExporting ? '…' : 'Exportar'}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reload}
                  disabled={isLoadingHistorial}
                  title="Actualizar"
                  className="h-8 w-8 shrink-0 border-[#C6A664]/30 p-0 text-[#1B2A41] hover:bg-[#C6A664]/10 xl:w-auto xl:px-2"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${isLoadingHistorial ? 'animate-spin' : ''}`} />
                  <span className="ml-1 hidden text-xs xl:inline">Actualizar</span>
                </Button>
              </div>
            </div>
          )}

          {(effectiveRange.from || effectiveRange.to) && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 text-[#C6A664]" />
              Rango aplicado: {effectiveRange.from || '…'} → {effectiveRange.to || '…'}
              {selectedEmployee?.hire_date && (
                <span className="text-slate-400">
                  (acotado al alta de {selectedEmployee.name}: {selectedEmployee.hire_date.slice(0, 10)})
                </span>
              )}
            </p>
          )}
        </div>

        <div className="w-full">
        {!companyId ? (
          <div className="text-center py-16 bg-slate-50 rounded-xl">
            <p className="text-slate-600">Falta el parámetro company_id en la URL.</p>
          </div>
        ) : isLoadingHistorial && historialNominas.length === 0 && groupedNominas.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <ArrowPathIcon className="w-8 h-8 animate-spin text-[#C6A664]" />
          </div>
        ) : groupBy !== 'none' ? (
          groups.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-xl">
              <h3 className="text-lg font-semibold text-slate-600 mb-1">Sin nóminas</h3>
              <p className="text-slate-500 text-sm">No hay resultados con los filtros aplicados</p>
            </div>
          ) : (
            <div className="w-full rounded-xl border border-slate-200 bg-white">
              <Table noScrollContainer>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-700">{activeGroupLabel}</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Nóminas</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Bruto</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Neto</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Coste Emp.</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Base SS</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => {
                    const isExpanded = expandedGroup === group.key
                    return (
                      <Fragment key={group.key}>
                        <TableRow
                          className={cn('cursor-pointer hover:bg-slate-50/50', isExpanded && 'bg-slate-50/80')}
                          onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                        >
                          <TableCell className="font-semibold text-slate-800">{group.label}</TableCell>
                          <TableCell className="text-center text-sm text-slate-600">{group.aggregate.count}</TableCell>
                          <TableCell className="text-center font-mono text-sm font-semibold text-[#1B2A41]">
                            {formatCurrency(group.aggregate.gross)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm font-semibold text-emerald-600">
                            {formatCurrency(group.aggregate.net)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm font-semibold text-[#C6A664]">
                            {formatCurrency(group.aggregate.cost)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm text-slate-600">
                            {formatCurrency(group.aggregate.baseSs)}
                          </TableCell>
                          <TableCell className="text-center">
                            <ChevronDownIcon
                              className={cn('w-4 h-4 text-slate-400 transition-transform', isExpanded && 'rotate-180')}
                            />
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                            <TableCell colSpan={7} className="p-0 border-t border-slate-200">
                              <NominaAggregatePanel aggregate={group.aggregate} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )
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
            <div className="w-full rounded-xl border border-slate-200 bg-white">
              <Table noScrollContainer>
                <TableHeader ref={columnFiltersRef}>
                  <TableRow className="bg-slate-50/90 hover:bg-slate-50/90">
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
                    <ExcelColumnHeader
                      label="Empleado"
                      sortActive={sortColumn === 'employee_name'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('employee_name')}
                      filterable
                      filterActive={Boolean(columnFilters.employee_name.trim())}
                      filterOpen={openColumnFilter === 'employee_name'}
                      onFilterToggle={() => openColumnFilterMenu('employee_name')}
                      filterPanel={
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Filtrar empleado
                          </p>
                          <Input
                            value={columnFilterDraft.employee_name}
                            onChange={(e) =>
                              setColumnFilterDraft((d) => ({ ...d, employee_name: e.target.value }))
                            }
                            placeholder="Contiene…"
                            className="h-8 text-xs"
                            onKeyDown={(e) => e.key === 'Enter' && applyTextColumnFilter('employee_name')}
                          />
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 flex-1 bg-[#1B2A41] text-xs hover:bg-[#152036]"
                              onClick={() => applyTextColumnFilter('employee_name')}
                            >
                              Aplicar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                setColumnFilterDraft((d) => ({ ...d, employee_name: '' }))
                                setColumnFilters((p) => ({ ...p, employee_name: '' }))
                                setOpenColumnFilter(null)
                              }}
                            >
                              Limpiar
                            </Button>
                          </div>
                        </div>
                      }
                    />
                    <ExcelColumnHeader
                      label="Empresa"
                      sortActive={sortColumn === 'company_name'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('company_name')}
                      filterable
                      filterActive={Boolean(columnFilters.company_name.trim())}
                      filterOpen={openColumnFilter === 'company_name'}
                      onFilterToggle={() => openColumnFilterMenu('company_name')}
                      filterPanel={
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Filtrar empresa
                          </p>
                          <Input
                            value={columnFilterDraft.company_name}
                            onChange={(e) =>
                              setColumnFilterDraft((d) => ({ ...d, company_name: e.target.value }))
                            }
                            placeholder="Contiene…"
                            className="h-8 text-xs"
                            onKeyDown={(e) => e.key === 'Enter' && applyTextColumnFilter('company_name')}
                          />
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 flex-1 bg-[#1B2A41] text-xs hover:bg-[#152036]"
                              onClick={() => applyTextColumnFilter('company_name')}
                            >
                              Aplicar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                setColumnFilterDraft((d) => ({ ...d, company_name: '' }))
                                setColumnFilters((p) => ({ ...p, company_name: '' }))
                                setOpenColumnFilter(null)
                              }}
                            >
                              Limpiar
                            </Button>
                          </div>
                        </div>
                      }
                    />
                    <ExcelColumnHeader
                      label="Período"
                      align="center"
                      sortActive={sortColumn === 'period_start'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('period_start')}
                    />
                    <ExcelColumnHeader
                      label="Bruto"
                      align="center"
                      sortActive={sortColumn === 'gross_salary'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('gross_salary')}
                    />
                    <ExcelColumnHeader
                      label="Neto"
                      align="center"
                      sortActive={sortColumn === 'net_pay'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('net_pay')}
                    />
                    <ExcelColumnHeader
                      label="Coste Emp."
                      align="center"
                      sortActive={sortColumn === 'cost_empresa'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('cost_empresa')}
                    />
                    <ExcelColumnHeader
                      label="Estado"
                      align="center"
                      sortActive={sortColumn === 'signed'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('signed')}
                      filterable
                      filterActive={Boolean(columnFilters.estado)}
                      filterOpen={openColumnFilter === 'estado'}
                      onFilterToggle={() => openColumnFilterMenu('estado')}
                      filterPanel={
                        <div className="space-y-1">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Filtrar estado
                          </p>
                          {(
                            [
                              { value: '' as NominaEstadoFilter, label: 'Todos' },
                              { value: 'enviada' as NominaEstadoFilter, label: 'Enviada' },
                              { value: 'firmada' as NominaEstadoFilter, label: 'Firmada' },
                            ] as const
                          ).map(({ value, label }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => applyEstadoColumnFilter(value)}
                              className={cn(
                                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50',
                                columnFilters.estado === value && 'bg-[#C6A664]/12 font-medium text-[#1B2A41]',
                              )}
                            >
                              {label}
                              {columnFilters.estado === value && (
                                <span className="text-[#C6A664]">✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      }
                    />
                    <ExcelColumnHeader
                      label="Fecha"
                      align="center"
                      sortActive={sortColumn === 'created_at'}
                      sortDir={sortDir}
                      onSort={() => toggleSort('created_at')}
                    />
                    <TableHead className="w-16 p-0" />
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
        </div>
      </div>

      <NominasSelectionBanner
        visible={showSelectionBanner}
        totals={selectionTotals}
        isExporting={isExporting}
        onExport={handleExport}
        onClear={clearSelection}
        onDelete={deleteSelected}
      />
    </div>
  )
}
