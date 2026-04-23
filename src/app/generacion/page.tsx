'use client'

import { useState, useCallback, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  CalculatorIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ClipboardDocumentCheckIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  EyeIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
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
  calculatePayslip, getDefaultPayrollConfig, TipoContrato, TipoJornada
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
  imageUrl: string | null
  baseSalary: number
  cotizationGroup: number
  irpfPercentage: number
  fixedComplements: number
  proratedBonuses: number
  numberOfBonuses: number
  contractType: string
  fullTime: boolean
  workdayPercentage: number
  // Antigüedad jornada-adjusted resuelta desde el convenio (devengo)
  seniorityAmount: number
  seniorityPercent: number
  seniorityPeriods: number
  yearsOfService: number
  // Prorrata mensual jornada-adjusted (convenio)
  monthlyProratedBonusFromAgreement: number | null
  // Editable variables
  workedDays: number
  overtimeHours: number
  vacationDays: number
  itDays: number
  sickLeaveDays: number
  expenses: number
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
  // Contrato / convenio
  hasActiveContract: boolean
  usingAgreementDefaults: boolean
}

interface CompanyAgreementSummary {
  agreement_id: string
  defaults: {
    province?: string | null
    weekly_hours?: number | null
    trial_period_months?: number | null
    number_of_bonuses?: number | null
    vacation_days_per_year?: number | null
    default_professional_category?: string | null
    default_cotization_group?: number | null
  } | null
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
  const [companyAgreement, setCompanyAgreement] = useState<CompanyAgreementSummary | null>(null)
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [generationResults, setGenerationResults] = useState<GenerationResult[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [autoCreatingContractFor, setAutoCreatingContractFor] = useState<string | null>(null)

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
  const [exportError, setExportError] = useState<string | null>(null)

  // ── Detail dialog (historial) ──
  const [detailNomina, setDetailNomina] = useState<NominaHistorico | null>(null)

  // ── Preview nómina (pre-generación) ──
  const [previewEmployee, setPreviewEmployee] = useState<EmployeeRow | null>(null)

  // ── Contract modal (misma página, iframe a Contratos) ──
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [contractModalMode, setContractModalMode] = useState<'create' | 'upload_pdf'>('create')
  const [contractModalEmployee, setContractModalEmployee] = useState<{ id: string; first_name: string; last_name: string } | null>(null)
  const [contractIframeUrl, setContractIframeUrl] = useState<string | null>(null)

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState('generar')

  // URL del iframe de contratos (solo en cliente para evitar hidratación)
  useEffect(() => {
    if (contractModalOpen && companyId && contractModalEmployee) {
      setContractIframeUrl(
        `${typeof window !== 'undefined' ? window.location.origin : ''}/contratos?company_id=${companyId}&employee_id=${contractModalEmployee.id}${contractModalMode === 'upload_pdf' ? '&upload_pdf=true' : '&open=create'}`
      )
    } else {
      setContractIframeUrl(null)
    }
  }, [contractModalOpen, companyId, contractModalEmployee, contractModalMode])

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

      const nBonuses = row.numberOfBonuses || 2
      // ────────────────────────────────────────────────────────────────
      // FÓRMULA UNIFICADA con Contratos.tsx + backend (route.ts):
      //
      //   monthlyBase   = row.baseSalary  (= contract.agreed_base_salary,
      //                    salary_table × jornada%, fuente única de verdad)
      //   antigüedad    = monthlyBase × seniorityPercent / 100
      //                    (NO se multiplica por jornada porque el base ya
      //                     la lleva aplicada)
      //   prorrata mes  = (monthlyBase + antigüedad) × nº pagas / 12
      // ────────────────────────────────────────────────────────────────
      const seniorityAmount = row.seniorityAmount || 0
      const baseWithSeniority = row.baseSalary + seniorityAmount

      // Si el backend ya nos dio la prorrata jornada-adjusted del convenio,
      // la usamos. Si no, calculamos a partir del base+antigüedad.
      const monthlyProratedBonus =
        row.monthlyProratedBonusFromAgreement != null
          ? row.monthlyProratedBonusFromAgreement
          : Math.round((baseWithSeniority * nBonuses) / 12 * 100) / 100

      const employeeInput: EmployeePayrollInput = {
        baseSalaryMonthly: row.baseSalary,
        cotizationGroup: (row.cotizationGroup || 7) as GrupoCotizacion,
        irpfPercentage: row.irpfPercentage || 0,
        // Antigüedad como complemento fijo (devengo salarial mensual).
        // Se suma al complemento manual que el usuario haya configurado.
        fixedComplements: (row.fixedComplements || 0) + seniorityAmount,
        // Se pasa 0 aquí; la prorrata entra como devengo mensual (otherSalaryAccruals)
        // para replicar el modo "prorrateado" del backend y que aparezca en totalDevengos.
        proratedBonuses: 0,
        numberOfBonuses: nBonuses,
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
        // Prorrata mensual de pagas extras → devengo salarial del mes
        // (coincide con la lógica del endpoint /api/generacion en modo prorrateado)
        otherSalaryAccruals: monthlyProratedBonus,
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

      const result = calculatePayslip(employeeInput, monthlyVars, getDefaultPayrollConfig(year), month)

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

      // Guardar info del convenio activo (si la empresa tiene alguno asignado).
      const agreementInfo: CompanyAgreementSummary | null = data.companyAgreement || null
      setCompanyAgreement(agreementInfo)

      const rows: EmployeeRow[] = (data.employees || []).map((emp: any) => {
        const comp = emp.compensation || {}
        const contract = emp.contracts?.[0] || {}
        const hasActiveContract = !!emp.hasActiveContract
        const defaults = agreementInfo?.defaults || {}
        // Datos derivados del convenio resueltos en el backend (jornada-adjusted)
        const derived = emp.derivedPreview || null

        const daysInMonth = getDaysInMonth(selectedMonth, selectedYear)

        // Pagas: convenio > compensation > defaults > 2
        const numberOfBonuses =
          derived?.numberOfBonuses
          || comp.numberOfBonuses
          || (hasActiveContract ? 2 : Number(defaults.number_of_bonuses) || 2)

        const row: EmployeeRow = {
          id: emp.id,
          name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          nif: emp.nif || '',
          ssNumber: emp.social_security_number || '',
          iban: emp.iban || '',
          imageUrl: emp.image_url || null,
          baseSalary:
            hasActiveContract && Number(contract.agreed_base_salary) > 0
              ? Number(contract.agreed_base_salary)
              : Number(comp.baseSalaryMonthly) || 0,
          cotizationGroup:
            comp.cotizationGroup
            || contract.cotization_group
            || (hasActiveContract ? 7 : Number(defaults.default_cotization_group) || 7),
          irpfPercentage: comp.irpfPercentage || 0,
          fixedComplements: comp.fixedComplements || 0,
          proratedBonuses: comp.proratedBonuses || 0,
          numberOfBonuses,
          contractType: contract.contract_type || 'permanent',
          fullTime: contract.full_time !== false,
          workdayPercentage: contract.workday_percentage || 100,
          seniorityAmount: derived?.seniorityAmount ?? 0,
          seniorityPercent: derived?.seniorityPercent ?? 0,
          seniorityPeriods: derived?.seniorityPeriods ?? 0,
          yearsOfService: derived?.yearsOfService ?? 0,
          monthlyProratedBonusFromAgreement: derived?.monthlyProratedBonuses ?? null,
          workedDays: daysInMonth,
          overtimeHours: 0,
          vacationDays: 0,
          itDays: 0,
          sickLeaveDays: 0,
          expenses: 0,
          commissions: 0,
          advances: 0,
          grossSalary: null,
          netSalary: null,
          calcError: null,
          payslipResult: null,
          selected: true,
          generated: false,
          hasActiveContract,
          usingAgreementDefaults: !hasActiveContract && !!agreementInfo,
        }

        // Si el convenio no nos dio prorrata, calculamos: (salario_base × nº pagas) / 12
        if (!row.proratedBonuses && row.baseSalary > 0) {
          row.proratedBonuses =
            Math.round((row.baseSalary * row.numberOfBonuses) / 12 * 100) / 100
        }

        return calculateRow(row, selectedMonth, selectedYear)
      })

      setEmployees(rows)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error desconocido')
      setEmployees([])
      setCompanyAgreement(null)
    } finally {
      setLoadingEmployees(false)
    }
  }, [companyId, selectedMonth, selectedYear, calculateRow])

  // ── Auto-crear contrato desde convenio para un empleado ─────────────
  const autoCreateContract = useCallback(async (employeeId: string) => {
    if (!companyId) return
    setAutoCreatingContractFor(employeeId)
    try {
      const res = await fetch('/api/contratos/auto-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, employeeId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        alert(data.error || 'No se pudo auto-crear el contrato desde el convenio.')
        return
      }
      // Recarga empleados para reflejar el nuevo contrato y la base salarial.
      await loadEmployees()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al auto-crear contrato')
    } finally {
      setAutoCreatingContractFor(null)
    }
  }, [companyId, loadEmployees])

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
              sickLeaveDays: emp.sickLeaveDays,
              expenses: emp.expenses,
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
    setExportError(null)
    try {
      const res = await fetch('/api/download-pdfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, month: Number(month), year: Number(year) }),
      })

      if (!res.ok) {
        let msg = `Error ${res.status} al descargar PDFs`
        try {
          const data = await res.json()
          msg = data.error || msg
          if (data.details) msg += ` — ${Array.isArray(data.details) ? data.details.join('; ') : data.details}`
        } catch {}
        setExportError(msg)
        return
      }

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
      setExportError(err instanceof Error ? err.message : 'Error al descargar PDFs')
    } finally {
      setDownloadingPDFs(false)
    }
  }, [companyId, historyMonth, historyYear, selectedMonth, selectedYear])

  // ── Generate SEPA file ──
  const generateSEPA = useCallback(async () => {
    if (!companyId) return
    const month = historyMonth || selectedMonth
    const year = historyYear || selectedYear

    setGeneratingSEPA(true)
    setExportError(null)
    try {
      const res = await fetch('/api/sepa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          month: Number(month),
          year: Number(year),
        }),
      })

      if (!res.ok) {
        let msg = `Error ${res.status} al generar SEPA`
        try {
          const data = await res.json()
          msg = data.error || msg
          if (data.hint) msg += ` — ${data.hint}`
        } catch {}
        setExportError(msg)
        return
      }

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
      setExportError(err instanceof Error ? err.message : 'Error al generar SEPA')
    } finally {
      setGeneratingSEPA(false)
    }
  }, [companyId, historyMonth, historyYear, selectedMonth, selectedYear])

  // ── Generate RED file ──
  const generateRED = useCallback(async () => {
    if (!companyId) return
    const month = historyMonth || selectedMonth
    const year = historyYear || selectedYear

    setGeneratingRED(true)
    setExportError(null)
    try {
      const res = await fetch('/api/red', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          month: Number(month),
          year: Number(year),
        }),
      })

      if (!res.ok) {
        let msg = `Error ${res.status} al generar RED`
        try {
          const data = await res.json()
          msg = data.error || msg
          if (data.hint) msg += ` — ${data.hint}`
        } catch {}
        setExportError(msg)
        return
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RED_${companyId}_${year}${String(month).padStart(2, '0')}.txt`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Error al generar RED')
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
            <ExclamationCircleIcon className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
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
      {/* ── Content ── */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={(val) => {
          setActiveTab(val)
          if (val === 'historico') loadHistory()
        }}>
          <TabsList className="mb-6 bg-white border">
            <TabsTrigger value="generar" className="data-[state=active]:bg-[#1B2A41] data-[state=active]:text-white gap-2">
              <ClipboardDocumentCheckIcon className="w-4 h-4" />
              Generar Nóminas
            </TabsTrigger>
            <TabsTrigger value="historico" className="data-[state=active]:bg-[#1B2A41] data-[state=active]:text-white gap-2">
              <ArrowUturnLeftIcon className="w-4 h-4" />
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
                      <ChevronDownIcon className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                      <ChevronDownIcon className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Load Employees */}
                  <Button
                    onClick={loadEmployees}
                    disabled={loadingEmployees}
                    className="bg-[#1B2A41] hover:bg-[#1B2A41]/90"
                  >
                    {loadingEmployees ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserGroupIcon className="w-4 h-4" />
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
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircleIcon className="w-4 h-4" />
                        )}
                        Generar Seleccionadas ({summary.selected})
                      </Button>
                      <Button
                        onClick={() => generatePayslips(false)}
                        disabled={generating}
                        className="bg-[#C6A664] hover:bg-[#C6A664]/90 text-white"
                      >
                        {generating ? (
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : (
                          <CalculatorIcon className="w-4 h-4" />
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
                    <CheckCircleIcon className="w-5 h-5 text-[#C6A664] mt-0.5 shrink-0" />
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
                              <ExclamationCircleIcon className="w-3.5 h-3.5 shrink-0" />
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
                    <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
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
                        <UserGroupIcon className="w-4 h-4 text-[#1B2A41]" />
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
                        <ArrowTrendingUpIcon className="w-4 h-4 text-[#C6A664]" />
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
                        <ArrowDownTrayIcon className="w-4 h-4 text-emerald-600" />
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
                        <CheckCircleIcon className="w-4 h-4 text-blue-600" />
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
                      <ArrowPathIcon className="w-4 h-4 mr-1" />
                      Recalcular
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
                          <TableHead className="w-[44px] px-3 text-center">
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
                          <TableHead className="min-w-[200px] px-3 text-xs font-semibold uppercase tracking-wider">Empleado</TableHead>
                          <TableHead className="w-[85px] px-1 text-xs font-semibold uppercase tracking-wider text-center">Días Trab.</TableHead>
                          <TableHead className="w-[80px] px-1 text-xs font-semibold uppercase tracking-wider text-center">H. Extra</TableHead>
                          <TableHead className="w-[80px] px-1 text-xs font-semibold uppercase tracking-wider text-center">Vacaciones</TableHead>
                          <TableHead className="w-[75px] px-1 text-xs font-semibold uppercase tracking-wider text-center">IT Días</TableHead>
                          <TableHead className="w-[75px] px-1 text-xs font-semibold uppercase tracking-wider text-center">Bajas</TableHead>
                          <TableHead className="w-[85px] px-1 text-xs font-semibold uppercase tracking-wider text-center">Gastos</TableHead>
                          <TableHead className="w-[85px] px-1 text-xs font-semibold uppercase tracking-wider text-center">Comisiones</TableHead>
                          <TableHead className="w-[85px] px-1 text-xs font-semibold uppercase tracking-wider text-center">Anticipos</TableHead>
                          <TableHead className="w-[110px] px-2 text-xs font-semibold uppercase tracking-wider text-center">Bruto</TableHead>
                          <TableHead className="w-[110px] px-2 text-xs font-semibold uppercase tracking-wider text-center">Neto</TableHead>
                          <TableHead className="w-[44px] px-2 text-center"></TableHead>
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
                            <TableCell className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={emp.selected}
                                onChange={() => toggleSelect(idx)}
                                className="w-4 h-4 rounded border-slate-300 text-[#C6A664] focus:ring-[#C6A664] cursor-pointer"
                              />
                            </TableCell>

                            {/* Employee Name + Avatar */}
                            <TableCell className="px-3 py-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden border border-slate-200 bg-gradient-to-br from-[#1B2A41] to-slate-600 flex items-center justify-center">
                                  {emp.imageUrl ? (
                                    <img src={emp.imageUrl} alt={emp.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-[11px] font-bold text-white">{emp.name.charAt(0).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium leading-tight truncate">{emp.name}</p>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-[11px] text-muted-foreground">{emp.nif}</p>
                                    {!emp.hasActiveContract && emp.usingAgreementDefaults && (
                                      <Badge
                                        title="Sin contrato activo: se usa el convenio colectivo asignado a la empresa"
                                        className="bg-[#C6A664]/15 text-[#8F7430] border-[#C6A664]/40 text-[10px] px-1.5 py-0 shrink-0"
                                      >
                                        Convenio
                                      </Badge>
                                    )}
                                    {!emp.hasActiveContract && !emp.usingAgreementDefaults && (
                                      <Badge
                                        title="Sin contrato ni convenio: asigna uno para poder generar nómina"
                                        className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0 shrink-0"
                                      >
                                        Sin convenio
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {emp.generated && (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 shrink-0">
                                    Generada
                                  </Badge>
                                )}
                                {!emp.hasActiveContract && companyAgreement && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={autoCreatingContractFor === emp.id}
                                    onClick={() => autoCreateContract(emp.id)}
                                    title="Crear un contrato formal a partir del convenio colectivo (base, jornada, pagas, provincia). Un clic."
                                    className="h-7 px-2 text-[11px] text-[#1B2A41] hover:text-[#C6A664] shrink-0"
                                  >
                                    {autoCreatingContractFor === emp.id ? (
                                      <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <DocumentTextIcon className="w-3 h-3 mr-1" />
                                    )}
                                    Crear contrato
                                  </Button>
                                )}
                              </div>
                            </TableCell>

                            {/* Worked Days */}
                            <TableCell className="px-1 py-2 text-center">
                              <Input
                                type="number"
                                value={emp.workedDays}
                                onChange={e => updateVariable(idx, 'workedDays', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                max={getDaysInMonth(selectedMonth, selectedYear)}
                              />
                            </TableCell>

                            {/* Overtime Hours */}
                            <TableCell className="px-1 py-2 text-center">
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
                            <TableCell className="px-1 py-2 text-center">
                              <Input
                                type="number"
                                value={emp.vacationDays}
                                onChange={e => updateVariable(idx, 'vacationDays', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                max={getDaysInMonth(selectedMonth, selectedYear)}
                              />
                            </TableCell>

                            {/* IT Days */}
                            <TableCell className="px-1 py-2 text-center">
                              <Input
                                type="number"
                                value={emp.itDays}
                                onChange={e => updateVariable(idx, 'itDays', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                max={getDaysInMonth(selectedMonth, selectedYear)}
                              />
                            </TableCell>

                            {/* Sick Leave Days (Bajas) */}
                            <TableCell className="px-1 py-2 text-center">
                              <Input
                                type="number"
                                value={emp.sickLeaveDays}
                                onChange={e => updateVariable(idx, 'sickLeaveDays', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                max={getDaysInMonth(selectedMonth, selectedYear)}
                              />
                            </TableCell>

                            {/* Expenses (Gastos) */}
                            <TableCell className="px-1 py-2 text-center">
                              <Input
                                type="number"
                                value={emp.expenses}
                                onChange={e => updateVariable(idx, 'expenses', Number(e.target.value))}
                                className="h-8 text-center text-sm w-full tabular-nums"
                                min={0}
                                step={10}
                              />
                            </TableCell>

                            {/* Commissions */}
                            <TableCell className="px-1 py-2 text-center">
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
                            <TableCell className="px-1 py-2 text-center">
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
                            <TableCell className="px-2 py-2 text-center">
                              {emp.calcError ? (
                                <span className="text-xs text-red-500" title={emp.calcError}>Error</span>
                              ) : (
                                <span className="text-sm font-semibold tabular-nums text-[#1B2A41]">
                                  {formatCurrency(emp.grossSalary)}
                                </span>
                              )}
                            </TableCell>

                            {/* Net Salary */}
                            <TableCell className="px-2 py-2 text-center">
                              {emp.calcError ? (
                                <span className="text-xs text-red-500">—</span>
                              ) : (
                                <span className="text-sm font-bold tabular-nums text-emerald-700">
                                  {formatCurrency(emp.netSalary)}
                                </span>
                              )}
                            </TableCell>

                            {/* Preview button */}
                            <TableCell className="px-2 py-2 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-[#C6A664] hover:bg-[#C6A664]/10"
                                title="Vista previa de nómina"
                                disabled={!emp.payslipResult}
                                onClick={() => setPreviewEmployee(emp)}
                              >
                                <EyeIcon className="w-4 h-4" />
                              </Button>
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
                  <UserGroupIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-1">Sin empleados cargados</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Selecciona el mes y año, luego pulsa &quot;Cargar Empleados&quot; para comenzar.
                  </p>
                  <Button onClick={loadEmployees} className="bg-[#1B2A41] hover:bg-[#1B2A41]/90">
                    <UserGroupIcon className="w-4 h-4" />
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
                      <ChevronDownIcon className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                      <ChevronDownIcon className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                      <ChevronDownIcon className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Buscar empleado</Label>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Nombre o DNI..."
                        value={historyEmployee}
                        onChange={(e) => setHistoryEmployee(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>

                  <Button onClick={loadHistory} disabled={historyLoading} className="bg-[#1B2A41] hover:bg-[#1B2A41]/90">
                    {historyLoading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <MagnifyingGlassIcon className="w-4 h-4" />}
                    Buscar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Export error banner ── */}
            {exportError && (
              <Card className="mb-6 border-l-4 border-l-red-500">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start gap-3">
                    <ExclamationCircleIcon className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 text-sm text-red-700">{exportError}</div>
                    <Button variant="ghost" size="sm" onClick={() => setExportError(null)}>
                      Cerrar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

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
                        <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <ArchiveBoxIcon className="w-4 h-4 mr-2" />
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
                        <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <CodeBracketIcon className="w-4 h-4 mr-2" />
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
                        <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <CircleStackIcon className="w-4 h-4 mr-2" />
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
                    <ArrowPathIcon className="w-6 h-6 animate-spin text-[#C6A664]" />
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
                                <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
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
                                <EyeIcon className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <DocumentTextIcon className="w-12 h-12 text-slate-300 mb-4" />
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
      {/* DIALOG: Vista Previa de Nómina (pre-generación)               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!previewEmployee} onOpenChange={(open) => !open && setPreviewEmployee(null)}>
        <DialogContent className="max-w-4xl p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
          {previewEmployee?.payslipResult && (() => {
            const r = previewEmployee.payslipResult
            const a = r.accruals
            const wd = r.workerDeductions
            const cd = r.companyDeductions

            // La prorrata mensual de pagas extra se carga dentro de `otherSalaryAccruals`
            // para que contribuya a totalAccruals (ver `calculateRow`). Por eso mostramos
            // esa cifra en "Prorrata pagas extra" y no repetimos la línea.
            //
            // La antigüedad la cargamos en `fixedComplements` para que entre en el cálculo,
            // pero la mostramos como línea separada y restamos del bloque "Complementos
            // salariales" para no contarla dos veces visualmente.
            const seniorityAmount = previewEmployee.seniorityAmount || 0
            const manualComplements = Math.max(0, a.fixedComplements - seniorityAmount)
            const salaryLines: Array<{ concept: string; amount: number; meta?: string }> = [
              { concept: 'Salario Base', amount: a.baseSalary },
              {
                concept: 'Antigüedad',
                amount: seniorityAmount,
                meta:
                  previewEmployee.seniorityPercent > 0
                    ? `${previewEmployee.seniorityPercent.toFixed(2)}% · ${previewEmployee.yearsOfService} años`
                    : undefined,
              },
              { concept: 'Horas extraordinarias', amount: a.overtimeNormal },
              { concept: 'Gratificaciones extraordinarias', amount: a.bonusPayment },
              { concept: 'Salario en especie', amount: 0 },
              { concept: 'Complementos salariales', amount: manualComplements },
              { concept: 'Prorrata pagas extra', amount: a.otherSalaryAccruals },
              { concept: 'Comisiones / Incentivos', amount: a.commissions + a.incentives },
              { concept: 'IT – Empresa', amount: a.itCompanyBenefit },
              { concept: 'IT – Seg. Social', amount: a.itSSBenefit },
            ]
            const nonSalaryLines: Array<{ concept: string; amount: number }> = [
              { concept: 'Indemnizaciones o suplidos', amount: 0 },
              { concept: 'Prestaciones e ind. de la Seg. Soc.', amount: 0 },
              { concept: 'Ind. por traslados, suspensiones o despidos', amount: 0 },
              { concept: 'Otras percepciones no salariales', amount: a.nonSalaryComplements + a.otherNonSalaryAccruals },
            ]
            const deductionLines = [
              { concept: 'Contingencias Comunes', base: r.bases.baseCC, rate: 4.70, amount: wd.contingenciasComunes },
              { concept: 'Desempleo', base: r.bases.baseCP, rate: previewEmployee.fullTime ? 1.55 : 1.60, amount: wd.desempleo },
              { concept: 'Formación Profesional', base: r.bases.baseCP, rate: 0.10, amount: wd.formacionProfesional },
              { concept: 'MEI', base: r.bases.baseCP, rate: 0.12, amount: wd.mei },
              { concept: `IRPF`, base: r.bases.baseIRPF, rate: previewEmployee.irpfPercentage, amount: wd.irpf },
              { concept: 'Anticipos', base: 0, rate: 0, amount: wd.advances },
              { concept: 'Otras deducciones', base: 0, rate: 0, amount: wd.otherDeductions },
            ]

            const fmt = (v: number) =>
              v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

            return (
              <>
                {/* ─── Header fijo ─── */}
                <DialogHeader className="px-5 py-3 border-b shrink-0 bg-white">
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <EyeIcon className="w-4 h-4 text-[#C6A664]" />
                    Vista previa de nómina
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {previewEmployee.name} · {MONTH_NAMES[selectedMonth - 1]} {selectedYear} ·
                    Grupo {previewEmployee.cotizationGroup} ·
                    Jornada {previewEmployee.workdayPercentage}% ·
                    IRPF {previewEmployee.irpfPercentage}%
                  </DialogDescription>
                </DialogHeader>

                {/* ─── Cuerpo con scroll interno ─── */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5 bg-slate-50/40">

                  {/* ── I. DEVENGOS ── */}
                  <section className="bg-white border rounded-md overflow-hidden shadow-sm">
                    <header className="bg-[#1B2A41] text-white px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
                      I. Devengos
                    </header>

                    <div className="grid grid-cols-2 divide-x text-[11px]">
                      {/* Percepciones salariales */}
                      <div>
                        <div className="bg-slate-100 px-2 py-[3px] text-[9.5px] font-semibold flex justify-between">
                          <span>1. Percepciones salariales</span>
                          <span className="text-slate-500 font-normal">Importe €</span>
                        </div>
                        {salaryLines.map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              'flex items-center px-2 gap-1.5 h-[22px] border-b last:border-0',
                              line.amount === 0 && 'text-slate-400'
                            )}
                          >
                            <span className="text-[9px] text-slate-400 tabular-nums w-6 shrink-0">
                              {String(i + 1).padStart(3, '0')}
                            </span>
                            <span className="flex-1 truncate flex items-baseline gap-1.5">
                              {line.concept}
                              {line.meta && (
                                <span className="text-[9px] text-slate-500 font-normal">
                                  ({line.meta})
                                </span>
                              )}
                            </span>
                            <span className="tabular-nums shrink-0 font-medium">{fmt(line.amount)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Percepciones no salariales */}
                      <div>
                        <div className="bg-slate-100 px-2 py-[3px] text-[9.5px] font-semibold flex justify-between">
                          <span>2. Percepciones no salariales</span>
                          <span className="text-slate-500 font-normal">Importe €</span>
                        </div>
                        {nonSalaryLines.map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              'flex items-center px-2 gap-1.5 h-[22px] border-b last:border-0',
                              line.amount === 0 && 'text-slate-400'
                            )}
                          >
                            <span className="text-[9px] text-slate-400 tabular-nums w-6 shrink-0">
                              {String(101 + i).padStart(3, '0')}
                            </span>
                            <span className="flex-1 truncate">{line.concept}</span>
                            <span className="tabular-nums shrink-0 font-medium">{fmt(line.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <footer className="bg-[#1B2A41] text-white flex justify-between items-center px-2.5 py-1 text-[11px] font-semibold">
                      <span className="tracking-wider">A. TOTAL DEVENGADO</span>
                      <span className="tabular-nums text-[12px]">{fmt(a.totalAccruals)} €</span>
                    </footer>
                  </section>

                  {/* ── II. DEDUCCIONES ── */}
                  <section className="bg-white border rounded-md overflow-hidden shadow-sm">
                    <header className="bg-[#1B2A41] text-white px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
                      II. Deducciones
                    </header>
                    <div className="grid grid-cols-[auto_1fr_90px_60px_90px] gap-x-3 px-2 py-[3px] bg-slate-100 text-[9.5px] font-semibold">
                      <span className="w-6">Cód.</span>
                      <span>Concepto</span>
                      <span className="text-right text-slate-500 font-normal">Base €</span>
                      <span className="text-right text-slate-500 font-normal">Tipo %</span>
                      <span className="text-right text-slate-500 font-normal">Importe €</span>
                    </div>
                    {deductionLines.map((d, i) => (
                      <div
                        key={i}
                        className={cn(
                          'grid grid-cols-[auto_1fr_90px_60px_90px] gap-x-3 px-2 h-[22px] items-center text-[11px] border-b last:border-0',
                          d.amount === 0 && 'text-slate-400'
                        )}
                      >
                        <span className="text-[9px] text-slate-400 tabular-nums w-6">
                          {String(i + 1).padStart(3, '0')}
                        </span>
                        <span className="truncate">{d.concept}</span>
                        <span className="text-right tabular-nums text-slate-500">
                          {d.base > 0 ? fmt(d.base) : ''}
                        </span>
                        <span className="text-right tabular-nums text-slate-500">
                          {d.rate > 0 ? d.rate.toFixed(2).replace('.', ',') : ''}
                        </span>
                        <span className="text-right tabular-nums font-medium">{fmt(d.amount)}</span>
                      </div>
                    ))}
                    <footer className="bg-[#1B2A41] text-white flex justify-between items-center px-2.5 py-1 text-[11px] font-semibold">
                      <span className="tracking-wider">B. TOTAL A DEDUCIR</span>
                      <span className="tabular-nums text-[12px]">{fmt(wd.totalDeductions)} €</span>
                    </footer>
                  </section>

                  {/* ── Bases / Aportación empresa (2 columnas compactas) ── */}
                  <section className="grid grid-cols-2 gap-2.5">
                    <div className="bg-white border rounded-md p-2.5 shadow-sm">
                      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                        Bases de cotización
                      </div>
                      <div className="text-[11px] space-y-0.5">
                        <div className="flex justify-between"><span>Base CC</span><span className="tabular-nums">{fmt(r.bases.baseCC)} €</span></div>
                        <div className="flex justify-between"><span>Base CP</span><span className="tabular-nums">{fmt(r.bases.baseCP)} €</span></div>
                        <div className="flex justify-between"><span>Base IRPF</span><span className="tabular-nums">{fmt(r.bases.baseIRPF)} €</span></div>
                      </div>
                    </div>
                    <div className="bg-white border rounded-md p-2.5 shadow-sm">
                      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                        Aportación empresa
                      </div>
                      <div className="text-[11px] space-y-0.5">
                        <div className="flex justify-between"><span>Contingencias comunes</span><span className="tabular-nums">{fmt(cd.contingenciasComunes)} €</span></div>
                        <div className="flex justify-between"><span>AT/EP</span><span className="tabular-nums">{fmt(cd.atEp)} €</span></div>
                        <div className="flex justify-between"><span>Desempleo</span><span className="tabular-nums">{fmt(cd.desempleo)} €</span></div>
                        <div className="flex justify-between"><span>FOGASA</span><span className="tabular-nums">{fmt(cd.fogasa)} €</span></div>
                        <div className="flex justify-between"><span>FP empresa</span><span className="tabular-nums">{fmt(cd.formacionProfesional)} €</span></div>
                        <div className="flex justify-between font-semibold border-t pt-0.5 mt-0.5">
                          <span>Total coste empresa</span>
                          <span className="tabular-nums">{fmt(r.totalCostCompany)} €</span>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                {/* ─── Footer sticky con líquido ─── */}
                <div className="shrink-0 border-t bg-gradient-to-r from-[#1B2A41] to-[#2a3f5f] text-white px-5 py-2.5 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.12em] font-semibold opacity-90">
                    Líquido total a percibir (A – B)
                  </span>
                  <span className="tabular-nums text-xl font-bold text-[#C6A664]">
                    {fmt(r.netSalary)} €
                  </span>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* DIALOG: Detalle de Nómina                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!detailNomina} onOpenChange={(open) => !open && setDetailNomina(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailNomina && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5 text-[#C6A664]" />
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

      {/* Modal Contratos en la misma página (crear manual / subir PDF con IA) */}
      <Dialog
        open={contractModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setContractModalOpen(false)
            setContractModalEmployee(null)
            loadEmployees()
          }
        }}
      >
        <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-base">
              {contractModalMode === 'upload_pdf'
                ? 'Subir contrato en PDF con IA'
                : 'Crear contrato manualmente'}
              {contractModalEmployee && (
                <span className="font-normal text-muted-foreground">
                  {' — '}
                  {contractModalEmployee.first_name} {contractModalEmployee.last_name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 relative px-6 pb-6">
            {contractIframeUrl && (
              <iframe
                title="Contratos"
                src={contractIframeUrl}
                className="absolute inset-0 w-full h-full rounded-lg border border-slate-200"
              />
            )}
          </div>
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
        <ArrowPathIcon className="w-8 h-8 animate-spin text-[#C6A664]" />
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
