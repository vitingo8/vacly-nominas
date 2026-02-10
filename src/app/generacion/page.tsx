'use client'

import { useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Calculator, Users, Download, CheckCircle2, AlertCircle,
  Search, Eye, Calendar, Loader2, RefreshCw,
  FileText, TrendingUp, ChevronDown, ListChecks, History,
  FileArchive, FileCode, Database
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  calculatePayslip, DEFAULT_CONFIG_2025, TipoContrato, TipoJornada
} from '@/lib/calculadora'
import type {
  EmployeePayrollInput, MonthlyVariablesInput, PayslipResult, GrupoCotizacion
} from '@/lib/calculadora'

// ─── Types ──────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string
  name: string
  nif: string
  ssNumber: string
  iban: string
  baseSalary: number
  cotizationGroup: number
  irpfPercentage: number
  fixedComplements: number
  proratedBonuses: number
  numberOfBonuses: number
  contractType: string
  fullTime: boolean
  workdayPercentage: number
  // Editable variables
  workedDays: number
  overtimeHours: number
  vacationDays: number
  itDays: number
  commissions: number
  advances: number
  // Calculated
  grossSalary: number | null
  netSalary: number | null
  calcError: string | null
  payslipResult: PayslipResult | null
  // Selection
  selected: boolean
  // Generation status
  generated: boolean
}

interface NominaHistorico {
  id: string
  employee_id: string
  employee: { name?: string; dni?: string; social_security_number?: string }
  company: Record<string, unknown>
  period_start: string
  period_end: string
  perceptions: Array<{ concept: string; amount: number }>
  deductions: Array<{ concept: string; rate?: number; amount: number }>
  contributions: Array<{ concept: string; base?: number; rate?: number; amount: number }>
  gross_salary: number
  net_pay: number
  base_ss: number
  cost_empresa: number
  total_contributions: number
  status: string
  calculation_details: Record<string, unknown>
  dni: string
  document_name: string
  created_at: string
}

interface GenerationResult {
  employeeId: string
  employeeName: string
  success: boolean
  error?: string
}

// ─── Constants ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  generated: { label: 'Generada', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  sent: { label: 'Enviada', className: 'bg-green-100 text-green-800 border-green-200' },
  paid: { label: 'Pagada', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
}

const CONTRACT_TYPE_MAP: Record<string, TipoContrato> = {
  permanent: TipoContrato.INDEFINIDO,
  indefinido: TipoContrato.INDEFINIDO,
  INDEFINIDO: TipoContrato.INDEFINIDO,
  temporary: TipoContrato.TEMPORAL,
  temporal: TipoContrato.TEMPORAL,
  TEMPORAL: TipoContrato.TEMPORAL,
  training: TipoContrato.FORMACION,
  formacion: TipoContrato.FORMACION,
  FORMACION: TipoContrato.FORMACION,
  internship: TipoContrato.PRACTICAS,
  practicas: TipoContrato.PRACTICAS,
  PRACTICAS: TipoContrato.PRACTICAS,
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

function mapContractType(type: string): TipoContrato {
  return CONTRACT_TYPE_MAP[type] || TipoContrato.INDEFINIDO
}

// ─── Main Page Content ──────────────────────────────────────────────────

function GeneracionContent() {
  const searchParams = useSearchParams()
  const companyId = searchParams.get('company_id') || ''

  // ── Period selection ──
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // ── Tab 1: Generation state ──
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [generationResults, setGenerationResults] = useState<GenerationResult[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Tab 2: History state ──
  const [historico, setHistorico] = useState<NominaHistorico[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMonth, setHistoryMonth] = useState('')
  const [historyYear, setHistoryYear] = useState(String(now.getFullYear()))
  const [historyEmployee, setHistoryEmployee] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')
  
  // ── Export actions state ──
  const [downloadingPDFs, setDownloadingPDFs] = useState(false)
  const [generatingSEPA, setGeneratingSEPA] = useState(false)
  const [generatingRED, setGeneratingRED] = useState(false)
  const [historyTotal, setHistoryTotal] = useState(0)

  // ── Detail dialog ──
  const [detailNomina, setDetailNomina] = useState<NominaHistorico | null>(null)

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState('generar')

  // ── Calculated summaries ──
  const summary = useMemo(() => {
    const loaded = employees.length
    const selected = employees.filter(e => e.selected).length
    const totalGross = employees.reduce((sum, e) => sum + (e.grossSalary ?? 0), 0)
    const totalNet = employees.reduce((sum, e) => sum + (e.netSalary ?? 0), 0)
    const errors = employees.filter(e => e.calcError).length
    return { loaded, selected, totalGross, totalNet, errors }
  }, [employees])

  // ── Calculate a single row ──
  const calculateRow = useCallback((row: EmployeeRow, month: number, year: number): EmployeeRow => {
    try {
      const calendarDays = getDaysInMonth(month, year)

      const employeeInput: EmployeePayrollInput = {
        baseSalaryMonthly: row.baseSalary,
        cotizationGroup: (row.cotizationGroup || 7) as GrupoCotizacion,
        irpfPercentage: row.irpfPercentage || 0,
        fixedComplements: row.fixedComplements || 0,
        proratedBonuses: row.proratedBonuses || (row.baseSalary * 2) / 12,
        numberOfBonuses: row.numberOfBonuses || 2,
        contractType: mapContractType(row.contractType),
        workdayType: row.fullTime ? TipoJornada.COMPLETA : TipoJornada.PARCIAL,
        partTimeCoefficient: row.fullTime ? 1 : (row.workdayPercentage || 100) / 100,
      }

      const monthlyVars: MonthlyVariablesInput = {
        calendarDaysInMonth: calendarDays,
        workedDays: row.workedDays,
        overtimeHours: row.overtimeHours,
        overtimeAmount: row.overtimeHours * (row.baseSalary / 30 / 8) * 1.25,
        overtimeForceMajeureHours: 0,
        overtimeForceMajeureAmount: 0,
        accumulatedOvertimeHoursYear: 0,
        vacationDays: row.vacationDays,
        commissions: row.commissions,
        incentives: 0,
        bonusPayment: 0,
        advances: row.advances,
        otherSalaryAccruals: 0,
        otherNonSalaryAccruals: 0,
        otherDeductions: 0,
      }

      if (row.itDays > 0) {
        monthlyVars.temporaryDisability = {
          active: true,
          contingencyType: 'ENFERMEDAD_COMUN' as any,
          startDay: 1,
          endDay: row.itDays,
          absoluteDaysSinceStart: row.itDays,
        }
      }

      const result = calculatePayslip(employeeInput, monthlyVars, DEFAULT_CONFIG_2025, month)

      return {
        ...row,
        grossSalary: result.accruals.totalAccruals,
        netSalary: result.netSalary,
        calcError: null,
        payslipResult: result,
      }
    } catch (err) {
      return {
        ...row,
        grossSalary: null,
        netSalary: null,
        calcError: err instanceof Error ? err.message : 'Error de cálculo',
        payslipResult: null,
      }
    }
  }, [])

  // ── Load employees ──
  const loadEmployees = useCallback(async () => {
    if (!companyId) {
      setLoadError('No se ha especificado company_id en la URL')
      return
    }

    setLoadingEmployees(true)
    setLoadError(null)
    setGenerationResults(null)

    try {
      const res = await fetch(`/api/generacion?action=load_employees&company_id=${companyId}`)
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Error al cargar empleados')
      }

      const rows: EmployeeRow[] = (data.employees || []).map((emp: any) => {
        const comp = emp.compensation || {}
        const contract = emp.contracts?.[0] || {}

        const row: EmployeeRow = {
          id: emp.id,
          name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          nif: emp.nif || '',
          ssNumber: emp.social_security_number || '',
          iban: emp.iban || '',
          baseSalary: comp.baseSalaryMonthly || contract.agreed_base_salary || 0,
          cotizationGroup: comp.cotizationGroup || contract.cotization_group || 7,
          irpfPercentage: comp.irpfPercentage || 0,
          fixedComplements: comp.fixedComplements || 0,
          proratedBonuses: comp.proratedBonuses || 0,
          numberOfBonuses: comp.numberOfBonuses || 2,
          contractType: contract.contract_type || 'permanent',
          fullTime: contract.full_time !== false,
          workdayPercentage: contract.workday_percentage || 100,
          workedDays: 30,
          overtimeHours: 0,
          vacationDays: 0,
          itDays: 0,
          commissions: 0,
          advances: 0,
          grossSalary: null,
          netSalary: null,
          calcError: null,
          payslipResult: null,
          selected: true,
          generated: false,
        }

        // Auto-calculate proratedBonuses if not set
        if (!row.proratedBonuses && row.baseSalary > 0) {
          row.proratedBonuses = Math.round((row.baseSalary * 2) / 12 * 100) / 100
        }

        return calculateRow(row, selectedMonth, selectedYear)
      })

      setEmployees(rows)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error desconocido')
      setEmployees([])
    } finally {
      setLoadingEmployees(false)
    }
  }, [companyId, selectedMonth, selectedYear, calculateRow])

  // ── Update a variable for a specific row ──
  const updateVariable = useCallback((index: number, field: keyof EmployeeRow, value: number) => {
    setEmployees(prev => {
      const updated = [...prev]
      const row = { ...updated[index], [field]: value }
      updated[index] = calculateRow(row, selectedMonth, selectedYear)
      return updated
    })
  }, [calculateRow, selectedMonth, selectedYear])

  // ── Selection handlers ──
  const toggleSelect = useCallback((index: number) => {
    setEmployees(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], selected: !updated[index].selected }
      return updated
    })
  }, [])

  const allSelected = useMemo(() =>
    employees.length > 0 && employees.every(e => e.selected),
  [employees])

  const someSelected = useMemo(() =>
    employees.some(e => e.selected),
  [employees])

  const toggleSelectAll = useCallback(() => {
    setEmployees(prev => prev.map(e => ({ ...e, selected: !allSelected })))
  }, [allSelected])

  // ── Generate payslips ──
  const generatePayslips = useCallback(async (onlySelected: boolean) => {
    const toGenerate = onlySelected
      ? employees.filter(e => e.selected && !e.calcError)
      : employees.filter(e => !e.calcError)

    if (toGenerate.length === 0) return

    setGenerating(true)
    setProgress(0)
    setGenerationResults(null)

    const results: GenerationResult[] = []
    const batchSize = 5
    const totalBatches = Math.ceil(toGenerate.length / batchSize)

    for (let batch = 0; batch < totalBatches; batch++) {
      const batchEmployees = toGenerate.slice(batch * batchSize, (batch + 1) * batchSize)

      try {
        const payload = {
          companyId,
          month: selectedMonth,
          year: selectedYear,
          employees: batchEmployees.map(emp => ({
            employeeId: emp.id,
            employeeName: emp.name,
            dni: emp.nif,
            ssNumber: emp.ssNumber,
            iban: emp.iban,
            baseSalaryMonthly: emp.baseSalary,
            cotizationGroup: emp.cotizationGroup,
            irpfPercentage: emp.irpfPercentage,
            fixedComplements: emp.fixedComplements,
            proratedBonuses: emp.proratedBonuses,
            numberOfBonuses: emp.numberOfBonuses,
            contractType: emp.contractType,
            fullTime: emp.fullTime,
            workdayPercentage: emp.workdayPercentage,
            variables: {
              workedDays: emp.workedDays,
              overtimeHours: emp.overtimeHours,
              vacationDays: emp.vacationDays,
              itDays: emp.itDays,
              commissions: emp.commissions,
              advances: emp.advances,
              incentives: 0,
            },
          })),
        }

        const res = await fetch('/api/generacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = await res.json()

        if (data.results) {
          for (const r of data.results) {
            results.push({
              employeeId: r.employeeId,
              employeeName: r.employeeName,
              success: r.success,
              error: r.error,
            })
          }
        }
      } catch (err) {
        for (const emp of batchEmployees) {
          results.push({
            employeeId: emp.id,
            employeeName: emp.name,
            success: false,
            error: err instanceof Error ? err.message : 'Error de red',
          })
        }
      }

      setProgress(Math.round(((batch + 1) / totalBatches) * 100))
    }

    // Mark generated rows
    const successIds = new Set(results.filter(r => r.success).map(r => r.employeeId))
    setEmployees(prev => prev.map(e =>
      successIds.has(e.id) ? { ...e, generated: true } : e
    ))

    setGenerationResults(results)
    setGenerating(false)
  }, [employees, companyId, selectedMonth, selectedYear])

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    if (!companyId) return

    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({ company_id: companyId })
      if (historyMonth) params.set('month', historyMonth)
      if (historyYear) params.set('year', historyYear)
      if (historyEmployee) params.set('employee_id', historyEmployee)
      if (historyStatus) params.set('status', historyStatus)

      const res = await fetch(`/api/generacion?${params.toString()}`)
      const data = await res.json()

      if (data.success) {
        setHistorico(data.data || [])
        setHistoryTotal(data.total || 0)
      }
    } catch {
      // silent fail
    } finally {
      setHistoryLoading(false)
    }
  }, [companyId, historyMonth, historyYear, historyEmployee, historyStatus])

  // ── Recalculate all when period changes ──
  const recalculateAll = useCallback(() => {
    setEmployees(prev =>
      prev.map(row => calculateRow(row, selectedMonth, selectedYear))
    )
  }, [calculateRow, selectedMonth, selectedYear])

  // ── Download PDFs as ZIP ──
  const downloadPDFs = useCallback(async () => {
    if (!companyId) return
    const month = historyMonth || selectedMonth
    const year = historyYear || selectedYear

    setDownloadingPDFs(true)
    try {
      const res = await fetch('/api/download-pdfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, month: Number(month), year: Number(year) }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al descargar PDFs')
        return
      }

      // Download ZIP file
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Nominas_${year}${String(month).padStart(2, '0')}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al descargar PDFs')
    } finally {
      setDownloadingPDFs(false)
    }
  }, [companyId, historyMonth, historyYear, selectedMonth, selectedYear])

  // ── Generate SEPA file ──
  const generateSEPA = useCallback(async () => {
    if (!companyId) return
    const month = historyMonth || selectedMonth
    const year = historyYear || selectedYear

    // TODO: Get company data from config (for now, prompt user)
    const companyName = prompt('Nombre de la empresa:')
    const companyIBAN = prompt('IBAN de la empresa (cuenta de cargo):')
    const companyBIC = prompt('BIC/SWIFT de la empresa:')
    const companyCIF = prompt('CIF de la empresa (opcional):') || ''

    if (!companyName || !companyIBAN || !companyBIC) {
      alert('Datos de la empresa incompletos')
      return
    }

    setGeneratingSEPA(true)
    try {
      const res = await fetch('/api/sepa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          month: Number(month),
          year: Number(year),
          companyData: { companyName, companyIBAN, companyBIC, companyCIF },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al generar fichero SEPA')
        return
      }

      // Download SEPA XML
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SEPA_Nominas_${year}${String(month).padStart(2, '0')}.xml`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al generar SEPA')
    } finally {
      setGeneratingSEPA(false)
    }
  }, [companyId, historyMonth, historyYear, selectedMonth, selectedYear])

  // ── Generate RED file ──
  const generateRED = useCallback(async () => {
    if (!companyId) return
    const month = historyMonth || selectedMonth
    const year = historyYear || selectedYear

    // TODO: Get company data from config (for now, prompt user)
    const companyName = prompt('Nombre de la empresa:')
    const ccc = prompt('Código de Cuenta de Cotización (CCC - 11 dígitos):')
    const cif = prompt('CIF de la empresa:')
    const cnae = prompt('CNAE (4 dígitos, opcional):') || '0000'

    if (!companyName || !ccc || !cif) {
      alert('Datos de la empresa incompletos')
      return
    }

    setGeneratingRED(true)
    try {
      const res = await fetch('/api/red', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          month: Number(month),
          year: Number(year),
          companyData: { companyName, ccc, cif, cnae },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al generar fichero RED')
        return
      }

      // Download RED file
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RED_${ccc}_${year}${String(month).padStart(2, '0')}.txt`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al generar RED')
    } finally {
      setGeneratingRED(false)
    }
  }, [companyId, historyMonth, historyYear, selectedMonth, selectedYear])

  // ─── RENDER ─────────────────────────────────────────────────────────

  if (!companyId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Empresa no especificada</h2>
            <p className="text-sm text-muted-foreground">
              Añade <code className="bg-slate-100 px-1 rounded">?company_id=ID</code> a la URL para acceder a esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-[#1B2A41] text-white">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#C6A664]/20 p-2.5 rounded-lg">
              <Calculator className="w-6 h-6 text-[#C6A664]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Generación de Nóminas</h1>
              <p className="text-sm text-slate-300 mt-0.5">
                Calcula y genera las nóminas de tus empleados
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={(val) => {
          setActiveTab(val)
          if (val === 'historico') loadHistory()
        }}>
          <TabsList className="mb-6 bg-white border">
            <TabsTrigger value="generar" className="data-[state=active]:bg-[#1B2A41] data-[state=active]:text-white gap-2">
              <ListChecks className="w-4 h-4" />
              Generar Nóminas
            </TabsTrigger>
            <TabsTrigger value="historico" className="data-[state=active]:bg-[#1B2A41] data-[state=active]:text-white gap-2">
              <History className="w-4 h-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* TAB 1: GENERAR NÓMINAS                                      */}
          {/* ════════════════════════════════════════════════════════════ */}
          <TabsContent value="generar">
            {/* ── Period Selector & Actions ── */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-4">
                  {/* Month */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mes</Label>
                    <div className="relative">
                      <select
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(Number(e.target.value))
                          setTimeout(recalculateAll, 0)
                        }}
                        className="h-9 w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {MONTH_NAMES.map((name, i) => (
                          <option key={i} value={i + 1}>{name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Year */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Año</Label>
                    <div className="relative">
                      <select
                        value={selectedYear}
                        onChange={(e) => {
                          setSelectedYear(Number(e.target.value))
                          setTimeout(recalculateAll, 0)
                        }}
                        className="h-9 w-[100px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {[2024, 2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Load Employees */}
                  <Button
                    onClick={loadEmployees}
                    disabled={loadingEmployees}
                    className="bg-[#1B2A41] hover:bg-[#1B2A41]/90"
                  >
                    {loadingEmployees ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Users className="w-4 h-4" />
                    )}
                    Cargar Empleados
                  </Button>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Generate Buttons */}
                  {employees.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => generatePayslips(true)}
                        disabled={generating || !someSelected}
                        className="border-[#C6A664] text-[#C6A664] hover:bg-[#C6A664]/10"
                      >
                        {generating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Generar Seleccionadas ({summary.selected})
                      </Button>
                      <Button
                        onClick={() => generatePayslips(false)}
                        disabled={generating}
                        className="bg-[#C6A664] hover:bg-[#C6A664]/90 text-white"
                      >
                        {generating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Calculator className="w-4 h-4" />
                        )}
                        Generar Todas
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Progress Bar ── */}
            {generating && (
              <Card className="mb-6">
                <CardContent className="pt-6 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-muted-foreground">Generando nóminas...</span>
                    <span className="text-sm font-bold text-[#C6A664]">{progress}%</span>
                  </div>
                  <Progress value={progress} variant="gold" className="h-3" />
                </CardContent>
              </Card>
            )}

            {/* ── Generation Results ── */}
            {generationResults && !generating && (
              <Card className="mb-6 border-l-4 border-l-[#C6A664]">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#C6A664] mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-1">Resultado de la generación</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {generationResults.filter(r => r.success).length} nómina(s) generada(s) correctamente
                        {generationResults.filter(r => !r.success).length > 0 &&
                          `, ${generationResults.filter(r => !r.success).length} error(es)`
                        }
                      </p>
                      {generationResults.filter(r => !r.success).length > 0 && (
                        <div className="space-y-1">
                          {generationResults.filter(r => !r.success).map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{r.employeeName}: {r.error}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGenerationResults(null)}
                      className="shrink-0"
                    >
                      Cerrar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Error ── */}
            {loadError && (
              <Card className="mb-6 border-l-4 border-l-red-500">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-sm text-red-700">{loadError}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Summary Cards ── */}
            {employees.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-[#1B2A41]/10 p-2 rounded-lg">
                        <Users className="w-4 h-4 text-[#1B2A41]" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Empleados</p>
                        <p className="text-xl font-bold">{summary.loaded}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-[#C6A664]/10 p-2 rounded-lg">
                        <TrendingUp className="w-4 h-4 text-[#C6A664]" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Bruto</p>
                        <p className="text-xl font-bold">{formatCurrency(summary.totalGross)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-500/10 p-2 rounded-lg">
                        <Download className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Neto</p>
                        <p className="text-xl font-bold">{formatCurrency(summary.totalNet)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-500/10 p-2 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Seleccionadas</p>
                        <p className="text-xl font-bold">{summary.selected} / {summary.loaded}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Variables Table ── */}
            {employees.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Variables Mensuales</CardTitle>
                      <CardDescription>
                        {MONTH_NAMES[selectedMonth - 1]} {selectedYear} — Edita las variables de cada empleado
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={recalculateAll}>
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Recalcular
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
                          <TableHead className="w-[44px] px-3">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected && !allSelected
                              }}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 rounded border-slate-300 text-[#C6A664] focus:ring-[#C6A664] cursor-pointer"
                            />
                          </TableHead>
                          <TableHead className="min-w-[180px] px-3 text-xs font-semibold uppercase tracking-wider">Empleado</TableHead>
                          <TableHead className="w-[100px] px-2 text-xs font-semibold uppercase tracking-wider text-center">Días Trab.</TableHead>
                          <TableHead className="w-[90px] px-2 text-xs font-semibold uppercase tracking-wider text-center">H. Extra</TableHead>
                          <TableHead className="w-[90px] px-2 text-xs font-semibold uppercase tracking-wider text-center">Vacaciones</TableHead>
                          <TableHead className="w-[80px] px-2 text-xs font-semibold uppercase tracking-wider text-center">IT Días</TableHead>
                          <TableHead className="w-[100px] px-2 text-xs font-semibold uppercase tracking-wider text-center">Comisiones</TableHead>
                          <TableHead className="w-[100px] px-2 text-xs font-semibold uppercase tracking-wider text-center">Anticipos</TableHead>
                          <TableHead className="w-[130px] px-3 text-xs font-semibold uppercase tracking-wider text-right">Salario Bruto</TableHead>
                          <TableHead className="w-[130px] px-3 text-xs font-semibold uppercase tracking-wider text-right">Neto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employees.map((emp, idx) => (
                          <TableRow
                            key={emp.id}
                            className={cn(
                              'transition-colors',
                              emp.generated && 'bg-emerald-50/50',
                              emp.calcError && 'bg-red-50/50',
                              !emp.selected && 'opacity-60'
                            )}
                          >
                            {/* Checkbox */}
                            <TableCell className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={emp.selected}
                                onChange={() => toggleSelect(idx)}
                                className="w-4 h-4 rounded border-slate-300 text-[#C6A664] focus:ring-[#C6A664] cursor-pointer"
                              />
                            </TableCell>

                            {/* Employee Name */}
                            <TableCell className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="text-sm font-medium leading-tight">{emp.name}</p>
                                  <p className="text-xs text-muted-foreground">{emp.nif}</p>
                                </div>
                                {emp.generated && (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                                    Generada
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            {/* Worked Days */}
                            <TableCell className="px-2 py-2">
                              <Input
                                type="number"
                                value={emp.workedDays}
                                onChange={e => updateVariable(idx, 'workedDays', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                max={31}
                              />
                            </TableCell>

                            {/* Overtime Hours */}
                            <TableCell className="px-2 py-2">
                              <Input
                                type="number"
                                value={emp.overtimeHours}
                                onChange={e => updateVariable(idx, 'overtimeHours', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                step={0.5}
                              />
                            </TableCell>

                            {/* Vacation Days */}
                            <TableCell className="px-2 py-2">
                              <Input
                                type="number"
                                value={emp.vacationDays}
                                onChange={e => updateVariable(idx, 'vacationDays', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                max={31}
                              />
                            </TableCell>

                            {/* IT Days */}
                            <TableCell className="px-2 py-2">
                              <Input
                                type="number"
                                value={emp.itDays}
                                onChange={e => updateVariable(idx, 'itDays', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                max={31}
                              />
                            </TableCell>

                            {/* Commissions */}
                            <TableCell className="px-2 py-2">
                              <Input
                                type="number"
                                value={emp.commissions}
                                onChange={e => updateVariable(idx, 'commissions', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                step={10}
                              />
                            </TableCell>

                            {/* Advances */}
                            <TableCell className="px-2 py-2">
                              <Input
                                type="number"
                                value={emp.advances}
                                onChange={e => updateVariable(idx, 'advances', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                step={10}
                              />
                            </TableCell>

                            {/* Gross Salary */}
                            <TableCell className="px-3 py-2 text-right">
                              {emp.calcError ? (
                                <span className="text-xs text-red-500" title={emp.calcError}>Error</span>
                              ) : (
                                <span className="text-sm font-semibold tabular-nums text-[#1B2A41]">
                                  {formatCurrency(emp.grossSalary)}
                                </span>
                              )}
                            </TableCell>

                            {/* Net Salary */}
                            <TableCell className="px-3 py-2 text-right">
                              {emp.calcError ? (
                                <span className="text-xs text-red-500">—</span>
                              ) : (
                                <span className="text-sm font-bold tabular-nums text-emerald-700">
                                  {formatCurrency(emp.netSalary)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Table Footer with Totals */}
                  <div className="border-t bg-slate-50/80 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {employees.length} empleado(s) cargados
                    </span>
                    <div className="flex gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total Bruto</p>
                        <p className="text-sm font-bold tabular-nums">{formatCurrency(summary.totalGross)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total Neto</p>
                        <p className="text-sm font-bold tabular-nums text-emerald-700">{formatCurrency(summary.totalNet)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : !loadingEmployees && !loadError ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-1">Sin empleados cargados</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Selecciona el mes y año, luego pulsa &quot;Cargar Empleados&quot; para comenzar.
                  </p>
                  <Button onClick={loadEmployees} className="bg-[#1B2A41] hover:bg-[#1B2A41]/90">
                    <Users className="w-4 h-4" />
                    Cargar Empleados
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* TAB 2: HISTÓRICO                                            */}
          {/* ════════════════════════════════════════════════════════════ */}
          <TabsContent value="historico">
            {/* ── Filters ── */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mes</Label>
                    <div className="relative">
                      <select
                        value={historyMonth}
                        onChange={(e) => setHistoryMonth(e.target.value)}
                        className="h-9 w-[150px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Todos</option>
                        {MONTH_NAMES.map((name, i) => (
                          <option key={i} value={i + 1}>{name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Año</Label>
                    <div className="relative">
                      <select
                        value={historyYear}
                        onChange={(e) => setHistoryYear(e.target.value)}
                        className="h-9 w-[100px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Todos</option>
                        {[2024, 2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</Label>
                    <div className="relative">
                      <select
                        value={historyStatus}
                        onChange={(e) => setHistoryStatus(e.target.value)}
                        className="h-9 w-[140px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Todos</option>
                        <option value="draft">Borrador</option>
                        <option value="generated">Generada</option>
                        <option value="sent">Enviada</option>
                        <option value="paid">Pagada</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Buscar empleado</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Nombre o DNI..."
                        value={historyEmployee}
                        onChange={(e) => setHistoryEmployee(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>

                  <Button onClick={loadHistory} disabled={historyLoading} className="bg-[#1B2A41] hover:bg-[#1B2A41]/90">
                    {historyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Export Actions ── */}
            {historico.length > 0 && (
              <Card className="mb-6 bg-gradient-to-r from-slate-50 to-slate-100/50 border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <h3 className="text-sm font-semibold text-slate-700 mb-1">Exportar y Generar Ficheros</h3>
                      <p className="text-xs text-muted-foreground">
                        Descarga PDFs, genera ficheros SEPA (transferencias) y RED (Seguridad Social)
                      </p>
                    </div>
                    
                    <Button
                      onClick={downloadPDFs}
                      disabled={downloadingPDFs}
                      variant="outline"
                      className="bg-white hover:bg-slate-50"
                    >
                      {downloadingPDFs ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <FileArchive className="w-4 h-4 mr-2" />
                      )}
                      Descargar PDFs (ZIP)
                    </Button>

                    <Button
                      onClick={generateSEPA}
                      disabled={generatingSEPA}
                      variant="outline"
                      className="bg-white hover:bg-slate-50"
                    >
                      {generatingSEPA ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <FileCode className="w-4 h-4 mr-2" />
                      )}
                      Generar SEPA
                    </Button>

                    <Button
                      onClick={generateRED}
                      disabled={generatingRED}
                      variant="outline"
                      className="bg-white hover:bg-slate-50"
                    >
                      {generatingRED ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Database className="w-4 h-4 mr-2" />
                      )}
                      Generar RED
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── History Table ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Nóminas Generadas</CardTitle>
                  <Badge variant="secondary" className="text-xs">{historyTotal} resultado(s)</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-[#C6A664]" />
                  </div>
                ) : historico.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Empleado</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Período</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Bruto</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Neto</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Coste Empresa</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-center">Estado</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((nomina) => {
                        const statusCfg = STATUS_CONFIG[nomina.status] || STATUS_CONFIG.draft
                        const periodDate = new Date(nomina.period_start + 'T00:00:00')
                        const periodMonth = periodDate.getMonth()
                        const periodYear = periodDate.getFullYear()

                        return (
                          <TableRow key={nomina.id}>
                            <TableCell className="py-3">
                              <div>
                                <p className="text-sm font-medium">{nomina.employee?.name || nomina.dni || '—'}</p>
                                <p className="text-xs text-muted-foreground">{nomina.dni}</p>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm">
                                  {MONTH_NAMES[periodMonth]} {periodYear}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <span className="text-sm tabular-nums font-medium">{formatCurrency(nomina.gross_salary)}</span>
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <span className="text-sm tabular-nums font-bold text-emerald-700">{formatCurrency(nomina.net_pay)}</span>
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <span className="text-sm tabular-nums">{formatCurrency(nomina.cost_empresa)}</span>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <Badge className={cn('text-[11px]', statusCfg.className)}>
                                {statusCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDetailNomina(nomina)}
                                className="text-[#1B2A41] hover:text-[#C6A664]"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <FileText className="w-12 h-12 text-slate-300 mb-4" />
                    <h3 className="text-lg font-semibold mb-1">Sin resultados</h3>
                    <p className="text-sm text-muted-foreground">
                      No se encontraron nóminas con los filtros seleccionados.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Detalle de Nómina                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailNomina} onOpenChange={(open) => !open && setDetailNomina(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailNomina && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#C6A664]" />
                  Detalle de Nómina
                </DialogTitle>
                <DialogDescription>
                  {detailNomina.employee?.name || detailNomina.dni} —{' '}
                  {(() => {
                    const d = new Date(detailNomina.period_start + 'T00:00:00')
                    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
                  })()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Employee Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">Empleado</p>
                    <p className="text-sm font-medium">{detailNomina.employee?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">DNI</p>
                    <p className="text-sm font-medium">{detailNomina.dni || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">N.S.S.</p>
                    <p className="text-sm font-medium">{detailNomina.employee?.social_security_number || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <Badge className={cn('text-[11px]', (STATUS_CONFIG[detailNomina.status] || STATUS_CONFIG.draft).className)}>
                      {(STATUS_CONFIG[detailNomina.status] || STATUS_CONFIG.draft).label}
                    </Badge>
                  </div>
                </div>

                {/* Perceptions */}
                {detailNomina.perceptions && detailNomina.perceptions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-[#1B2A41]">Devengos</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {detailNomina.perceptions.map((p, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-3 py-2">{p.concept}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(p.amount)}</td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 font-semibold">
                            <td className="px-3 py-2">Total Devengos</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(detailNomina.gross_salary)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Deductions */}
                {detailNomina.deductions && detailNomina.deductions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-[#1B2A41]">Deducciones del Trabajador</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {detailNomina.deductions.map((d, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                {d.concept}
                                {d.rate !== undefined && (
                                  <span className="text-xs text-muted-foreground ml-1">({d.rate}%)</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium text-red-600">
                                -{formatCurrency(d.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Company Contributions */}
                {detailNomina.contributions && detailNomina.contributions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-[#1B2A41]">Aportaciones de la Empresa</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {detailNomina.contributions.map((c, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                {c.concept}
                                {c.rate !== undefined && (
                                  <span className="text-xs text-muted-foreground ml-1">({c.rate}%)</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(c.amount)}</td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 font-semibold">
                            <td className="px-3 py-2">Total Empresa</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(detailNomina.total_contributions)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-[#1B2A41] rounded-lg text-white">
                  <div className="text-center">
                    <p className="text-xs text-slate-300">Salario Bruto</p>
                    <p className="text-lg font-bold tabular-nums">{formatCurrency(detailNomina.gross_salary)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-[#C6A664]">Líquido a Percibir</p>
                    <p className="text-lg font-bold tabular-nums text-[#C6A664]">{formatCurrency(detailNomina.net_pay)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-300">Coste Empresa</p>
                    <p className="text-lg font-bold tabular-nums">{formatCurrency(detailNomina.cost_empresa)}</p>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setDetailNomina(null)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Page Wrapper with Suspense ─────────────────────────────────────────

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#C6A664]" />
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    </div>
  )
}

export default function GeneracionPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <GeneracionContent />
    </Suspense>
  )
}
