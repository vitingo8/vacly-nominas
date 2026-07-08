'use client'

// ============================================================================
// Asistente guiado de generación de nóminas (4 pasos)
//   1. Periodo y empresa
//   2. Checklist de preparación
//   3. Revisión por empleado (desglose en vivo + variables editables)
//   4. Generar y resultados (exportación PDF/SEPA/RED y modelos 111/190)
// La vista avanzada/clásica sigue disponible en /generacion/clasico.
// ============================================================================

import { useState, useCallback, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CurrencyEuroIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ReceiptPercentIcon,
  ScaleIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useEmbeddedMode } from '@/lib/embedded-mode'
import {
  calculatePayslip,
  TipoContrato,
  TipoJornada,
  TipoErte,
} from '@/lib/calculadora'
import type {
  EmployeePayrollInput,
  MonthlyVariablesInput,
  PayslipResult,
  GrupoCotizacion,
  PayrollConfigInput,
} from '@/lib/calculadora'
import { resolvePayrollConfigForDate, type PeriodSmi } from '@/lib/payroll-parameters'
import {
  DASHBOARD_CARD,
  DASHBOARD_CARD_HEADER,
  DASHBOARD_EYEBROW,
  DASHBOARD_INPUT_MD,
  DASHBOARD_KPI_TILE,
  DASHBOARD_OUTLINE_BTN,
  DASHBOARD_PAGE_BG,
  DASHBOARD_PILL_GROUP,
  DASHBOARD_PRIMARY_BTN,
  DASHBOARD_TITLE,
  dashboardPillClass,
} from '@/components/dashboard-styles'

// ─── Tipos ───────────────────────────────────────────────────────────────

interface InKindExtra { amount: number; repercutido: boolean }
interface GarnishmentExtra {
  active: boolean
  familyReductionPercent: number
  pensionAlimentos: number
  fixedAmount?: number
  maxAmount?: number
}
interface ErteExtra {
  type: 'SUSPENSION' | 'REDUCCION'
  affectedDays: number
  reductionPercent: number
  exemptionPercent: number
}

interface ComplementLine {
  concept: string
  amount: number
  cotizesSS: boolean
  tributesIRPF: boolean
}

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
  fixedComplementsCotizable: number
  fixedComplementsNonCotizable: number
  complementLines: ComplementLine[]
  proratedBonuses: number
  numberOfBonuses: number
  contractType: string
  fullTime: boolean
  workdayPercentage: number
  seniorityAmount: number
  seniorityPercent: number
  seniorityPeriods: number
  yearsOfService: number
  monthlyProratedBonusFromAgreement: number | null
  automaticAgreementConcepts: Array<{
    concept: string
    amount: number
    type: 'salary' | 'non_salary'
    cotizesSS?: boolean
    tributesIRPF?: boolean
  }>
  workedDays: number
  overtimeHours: number
  overtimeSource: 'manual' | 'fichajes'
  overtimeHoursExplicit: boolean
  autoOvertimeHours: number
  autoOvertimeDays: number
  vacationDays: number
  itDays: number
  itContingencyType: 'ENFERMEDAD_COMUN' | 'ACCIDENTE_TRABAJO'
  itStartDay: number
  itAbsoluteDaysSinceStart: number
  commissions: number
  advances: number
  // extras (Fase 3-6)
  inKind: InKindExtra
  garnishment: GarnishmentExtra
  erte: ErteExtra | null
  bonifications: number
  // calculado
  grossSalary: number | null
  netSalary: number | null
  calcError: string | null
  payslipResult: PayslipResult | null
  selected: boolean
  generated: boolean
  hasActiveContract: boolean
  usingAgreementDefaults: boolean
  irpfSource: string
  manualIrpfRate: number | null
  aeatIrpfRate: number | null
  irpfDiffers: boolean
  motorWarnings: string[]
  irpfSaving: boolean
}

interface CompanyAgreementSummary {
  agreement_id: string
  defaults: Record<string, any> | null
}

interface GenerationResult {
  employeeId: string
  employeeName: string
  success: boolean
  error?: string
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function moneyValue(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100
}

function mapContractType(type: string): TipoContrato {
  return CONTRACT_TYPE_MAP[type] || TipoContrato.INDEFINIDO
}

function resolveWorkdayCoefficient(fullTime: boolean, pct: number): number {
  if (fullTime) return 1
  const c = Number(pct)
  if (Number.isFinite(c) && c > 0 && c <= 100) return c / 100
  return 1
}

function resolveWorkdayType(fullTime: boolean, pct: number): TipoJornada {
  return resolveWorkdayCoefficient(fullTime, pct) >= 1 ? TipoJornada.COMPLETA : TipoJornada.PARCIAL
}

function getPreviewPayrollConfig(month: number, year: number, periodSmi?: PeriodSmi | null): PayrollConfigInput {
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  const resolved = resolvePayrollConfigForDate(periodStart)
  return { ...resolved.config, smiMonthly: periodSmi?.monthly ?? resolved.smiForPeriod.monthly }
}

function defaultExtras(): { inKind: InKindExtra; garnishment: GarnishmentExtra; erte: ErteExtra | null; bonifications: number } {
  return {
    inKind: { amount: 0, repercutido: true },
    garnishment: { active: false, familyReductionPercent: 0, pensionAlimentos: 0 },
    erte: null,
    bonifications: 0,
  }
}

// ─── Componente principal ───────────────────────────────────────────────────

function WizardInner() {
  const searchParams = useSearchParams()
  const companyId = searchParams.get('company_id') || ''
  const isEmbedded = useEmbeddedMode()

  const now = new Date()
  const [step, setStep] = useState(1)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [companyAgreement, setCompanyAgreement] = useState<CompanyAgreementSummary | null>(null)
  const [periodSmi, setPeriodSmi] = useState<PeriodSmi | null>(null)
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [generationResults, setGenerationResults] = useState<GenerationResult[] | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportInfo, setExportInfo] = useState<string | null>(null)

  // ── Cálculo de una fila (preview en vivo) ──
  const calculateRow = useCallback(
    (row: EmployeeRow, month: number, year: number, smiOverride?: PeriodSmi | null): EmployeeRow => {
      try {
        const calendarDays = getDaysInMonth(month, year)
        const nBonuses = row.numberOfBonuses || 2
        const seniorityAmount = moneyValue(row.seniorityAmount)
        const automaticCotizable = row.automaticAgreementConcepts.filter(
          (c) => c.cotizesSS !== false && (c.cotizesSS === true || c.type === 'salary'),
        )
        const automaticNonCotizable = row.automaticAgreementConcepts.filter(
          (c) => c.cotizesSS === false || (c.cotizesSS == null && c.type === 'non_salary'),
        )
        const automaticSalaryAmount = automaticCotizable.reduce((s, c) => s + moneyValue(c.amount), 0)
        const automaticNonSalaryAmount = automaticNonCotizable.reduce((s, c) => s + moneyValue(c.amount), 0)
        const employeeCotizable = moneyValue(row.fixedComplementsCotizable ?? row.fixedComplements)
        const employeeNonCotizable = moneyValue(row.fixedComplementsNonCotizable)
        const baseWithSeniority = moneyValue(row.baseSalary) + seniorityAmount
        const monthlyProratedBonus =
          row.monthlyProratedBonusFromAgreement != null
            ? row.monthlyProratedBonusFromAgreement
            : Math.round((baseWithSeniority * nBonuses) / 12 * 100) / 100

        const employeeInput: EmployeePayrollInput = {
          baseSalaryMonthly: moneyValue(row.baseSalary),
          cotizationGroup: (row.cotizationGroup || 7) as GrupoCotizacion,
          irpfPercentage: row.irpfPercentage || 0,
          fixedComplements: employeeCotizable + seniorityAmount + automaticSalaryAmount,
          nonSalaryComplements: employeeNonCotizable + automaticNonSalaryAmount,
          proratedBonuses: 0,
          numberOfBonuses: nBonuses,
          contractType: mapContractType(row.contractType),
          workdayType: resolveWorkdayType(row.fullTime, row.workdayPercentage),
          partTimeCoefficient: resolveWorkdayCoefficient(row.fullTime, row.workdayPercentage),
          companyBonifications: moneyValue(row.bonifications),
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
          otherSalaryAccruals: monthlyProratedBonus,
          otherNonSalaryAccruals: 0,
          otherDeductions: 0,
          inKind: row.inKind.amount > 0 ? { amount: row.inKind.amount, repercutido: row.inKind.repercutido } : undefined,
          garnishment: row.garnishment.active
            ? {
                active: true,
                familyReductionPercent: row.garnishment.familyReductionPercent,
                pensionAlimentos: row.garnishment.pensionAlimentos,
                fixedAmount: row.garnishment.fixedAmount,
                maxAmount: row.garnishment.maxAmount,
              }
            : undefined,
          erte: row.erte
            ? {
                type: row.erte.type === 'REDUCCION' ? TipoErte.REDUCCION : TipoErte.SUSPENSION,
                affectedDays: row.erte.affectedDays,
                reductionPercent: row.erte.reductionPercent,
                exemptionPercent: row.erte.exemptionPercent,
              }
            : undefined,
        }

        if (row.itDays > 0) {
          monthlyVars.temporaryDisability = {
            active: true,
            contingencyType: row.itContingencyType as any,
            startDay: row.itStartDay,
            endDay: Math.min(calendarDays, row.itStartDay + row.itDays - 1),
            absoluteDaysSinceStart: row.itAbsoluteDaysSinceStart,
          }
        }

        const result = calculatePayslip(
          employeeInput,
          monthlyVars,
          getPreviewPayrollConfig(month, year, smiOverride ?? periodSmi),
          month,
        )

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
    },
    [periodSmi],
  )

  // ── Cargar empleados ──
  const loadEmployees = useCallback(async () => {
    if (!companyId) {
      setLoadError('No se ha especificado company_id en la URL')
      return
    }
    setLoadingEmployees(true)
    setLoadError(null)
    setGenerationResults(null)
    try {
      const res = await fetch(
        `/api/generacion?action=load_employees&company_id=${companyId}&month=${selectedMonth}&year=${selectedYear}`,
      )
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Error al cargar empleados')

      const agreementInfo: CompanyAgreementSummary | null = data.companyAgreement || null
      const nextPeriodSmi: PeriodSmi | null =
        data.payrollConfig?.smiForPeriod ??
        resolvePayrollConfigForDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`).smiForPeriod
      setCompanyAgreement(agreementInfo)
      setPeriodSmi(nextPeriodSmi)

      const rows: EmployeeRow[] = (data.employees || []).map((emp: any) => {
        const comp = emp.compensation || {}
        const contract = emp.contracts?.[0] || {}
        const hasActiveContract = !!emp.hasActiveContract
        const defaults = agreementInfo?.defaults || {}
        const derived = emp.derivedPreview || null
        const daysInMonth = getDaysInMonth(selectedMonth, selectedYear)
        const autoIT = emp.autoITAbsence || null
        const autoITDays = Number(autoIT?.daysInPeriod ?? 0)
        const numberOfBonuses =
          derived?.numberOfBonuses || comp.numberOfBonuses ||
          (hasActiveContract ? 2 : Number(defaults.number_of_bonuses) || 2)
        const extras = defaultExtras()

        const row: EmployeeRow = {
          id: emp.id,
          name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          nif: emp.nif || '',
          ssNumber: emp.social_security_number || '',
          iban: emp.iban || '',
          imageUrl: emp.image_url || null,
          baseSalary:
            derived?.baseSalaryMonthly != null
              ? Number(derived.baseSalaryMonthly)
              : hasActiveContract && Number(contract.agreed_base_salary) > 0
                ? Number(contract.agreed_base_salary)
                : Number(comp.baseSalaryMonthly) || 0,
          cotizationGroup:
            comp.cotizationGroup || contract.cotization_group ||
            (hasActiveContract ? 7 : Number(defaults.default_cotization_group) || 7),
          irpfPercentage: comp.irpfPercentage || 0,
          fixedComplements: comp.fixedComplementsCotizable ?? moneyValue(comp.fixedComplements),
          fixedComplementsCotizable: comp.fixedComplementsCotizable ?? moneyValue(comp.fixedComplements),
          fixedComplementsNonCotizable: comp.fixedComplementsNonCotizable ?? 0,
          complementLines: (comp.complementLines ?? []).map((line: any) => ({
            concept: line.concept,
            amount: moneyValue(line.amount),
            cotizesSS: line.cotizesSS !== false,
            tributesIRPF: line.tributesIRPF !== false,
          })),
          proratedBonuses: comp.proratedBonuses || 0,
          numberOfBonuses,
          contractType: contract.contract_type || 'permanent',
          fullTime:
            contract.full_time !== false &&
            resolveWorkdayCoefficient(contract.full_time, contract.workday_percentage) >= 1,
          workdayPercentage: contract.workday_percentage || 100,
          seniorityAmount: derived?.seniorityAmount ?? 0,
          seniorityPercent: derived?.seniorityPercent ?? 0,
          seniorityPeriods: derived?.seniorityPeriods ?? 0,
          yearsOfService: derived?.yearsOfService ?? 0,
          monthlyProratedBonusFromAgreement: derived?.monthlyProratedBonuses ?? null,
          automaticAgreementConcepts: derived?.automaticConcepts ?? [],
          workedDays: Math.max(0, daysInMonth - autoITDays),
          overtimeHours: Number(emp.autoOvertimeHours ?? 0),
          overtimeSource: 'fichajes',
          overtimeHoursExplicit: false,
          autoOvertimeHours: Number(emp.autoOvertimeHours ?? 0),
          autoOvertimeDays: Number(emp.autoOvertimeMeta?.daysWithOvertime ?? 0),
          vacationDays: 0,
          itDays: autoITDays,
          itContingencyType: autoIT?.contingencyType ?? 'ENFERMEDAD_COMUN',
          itStartDay: Number(autoIT?.startDay ?? 1),
          itAbsoluteDaysSinceStart: Number(autoIT?.absoluteDaysSinceStart ?? 1),
          commissions: 0,
          advances: 0,
          ...extras,
          grossSalary: null,
          netSalary: null,
          calcError: null,
          payslipResult: null,
          selected: true,
          generated: false,
          hasActiveContract,
          usingAgreementDefaults: !hasActiveContract && !!agreementInfo,
          irpfSource: comp.irpfSource || 'none',
          manualIrpfRate: comp.manualRate ?? null,
          aeatIrpfRate: comp.aeatRate ?? null,
          irpfDiffers: !!comp.irpfDiffers,
          motorWarnings: [
            ...(emp.complementWarnings ?? []),
            ...(derived?.warnings ?? []),
            ...(emp.autoOvertimeMeta?.warnings ?? []),
          ],
          irpfSaving: false,
        }
        if (!row.proratedBonuses && row.baseSalary > 0) {
          row.proratedBonuses = Math.round((row.baseSalary * row.numberOfBonuses) / 12 * 100) / 100
        }
        return calculateRow(row, selectedMonth, selectedYear, nextPeriodSmi)
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

  // ── Actualizar una variable de un empleado y recalcular ──
  const updateRow = useCallback(
    (id: string, patch: Partial<EmployeeRow>) => {
      setEmployees((prev) =>
        prev.map((e) => (e.id === id ? calculateRow({ ...e, ...patch }, selectedMonth, selectedYear) : e)),
      )
    },
    [calculateRow, selectedMonth, selectedYear],
  )

  // ── Resumen agregado ──
  const summary = useMemo(() => {
    const selected = employees.filter((e) => e.selected && !e.calcError)
    const totalGross = selected.reduce((s, e) => s + (e.grossSalary ?? 0), 0)
    const totalNet = selected.reduce((s, e) => s + (e.netSalary ?? 0), 0)
    const totalIrpf = selected.reduce((s, e) => s + (e.payslipResult?.workerDeductions.irpf ?? 0), 0)
    const totalSS = selected.reduce((s, e) => s + (e.payslipResult?.workerDeductions.totalSS ?? 0), 0)
    const totalCost = selected.reduce((s, e) => s + (e.payslipResult?.totalCostCompany ?? 0), 0)
    return {
      count: selected.length,
      totalGross,
      totalNet,
      totalIrpf,
      totalSS,
      totalCost,
      errors: employees.filter((e) => e.calcError).length,
    }
  }, [employees])

  // ── Checklist de preparación ──
  const checklist = useMemo(() => {
    const total = employees.length
    const withContract = employees.filter((e) => e.hasActiveContract).length
    const withAgreement = !!companyAgreement
    const withIrpf = employees.filter((e) => e.irpfPercentage > 0).length
    const withSalary = employees.filter((e) => e.baseSalary > 0).length
    const withIban = employees.filter((e) => e.iban).length
    const errors = employees.filter((e) => e.calcError).length
    return [
      {
        id: 'employees',
        label: 'Empleados cargados',
        ok: total > 0,
        detail: `${total} empleado(s)`,
      },
      {
        id: 'contracts',
        label: 'Contratos activos',
        ok: total > 0 && withContract === total,
        detail: `${withContract}/${total} con contrato`,
      },
      {
        id: 'agreement',
        label: 'Convenio asignado',
        ok: withAgreement,
        detail: withAgreement ? 'Convenio activo' : 'Sin convenio',
      },
      {
        id: 'salary',
        label: 'Salario base definido',
        ok: total > 0 && withSalary === total,
        detail: `${withSalary}/${total}`,
      },
      {
        id: 'irpf',
        label: 'IRPF calculado',
        ok: total > 0 && withIrpf === total,
        detail: `${withIrpf}/${total} (se resuelve en generación si falta)`,
      },
      {
        id: 'iban',
        label: 'IBAN para transferencia',
        ok: total > 0 && withIban === total,
        detail: `${withIban}/${total}`,
      },
      {
        id: 'calc',
        label: 'Sin errores de cálculo',
        ok: errors === 0,
        detail: errors === 0 ? 'Todo correcto' : `${errors} con error`,
      },
    ]
  }, [employees, companyAgreement])

  const blockers = checklist.filter((c) => !c.ok && (c.id === 'employees' || c.id === 'calc'))

  // ── Generar nóminas ──
  const generatePayslips = useCallback(async () => {
    const toGenerate = employees.filter((e) => e.selected && !e.calcError)
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
          employees: batchEmployees.map((emp) => ({
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
              overtimeSource: emp.overtimeSource,
              overtimeHoursExplicit: emp.overtimeHoursExplicit,
              vacationDays: emp.vacationDays,
              itDays: emp.itDays,
              itContingencyType: emp.itContingencyType,
              commissions: emp.commissions,
              advances: emp.advances,
              incentives: 0,
              // extras Fase 3-6
              inKind: emp.inKind.amount > 0 ? emp.inKind : undefined,
              garnishment: emp.garnishment.active ? emp.garnishment : undefined,
              erte: emp.erte ?? undefined,
              bonifications: emp.bonifications || undefined,
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
            results.push({ employeeId: r.employeeId, employeeName: r.employeeName, success: r.success, error: r.error })
          }
        }
      } catch (err) {
        for (const emp of batchEmployees) {
          results.push({ employeeId: emp.id, employeeName: emp.name, success: false, error: err instanceof Error ? err.message : 'Error de red' })
        }
      }
      setProgress(Math.round(((batch + 1) / totalBatches) * 100))
    }

    const successIds = new Set(results.filter((r) => r.success).map((r) => r.employeeId))
    setEmployees((prev) => prev.map((e) => (successIds.has(e.id) ? { ...e, generated: true } : e)))
    setGenerationResults(results)
    setGenerating(false)
  }, [employees, companyId, selectedMonth, selectedYear])

  // ── Exportaciones ──
  const downloadBlob = async (url: string, body: any, fileName: string) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      let msg = `Error ${res.status}`
      try { const d = await res.json(); msg = d.error || msg } catch {}
      throw new Error(msg)
    }
    const blob = await res.blob()
    const objectUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(objectUrl)
    document.body.removeChild(a)
  }

  const runExport = useCallback(
    async (kind: 'pdf' | 'sepa' | 'red' | 'm111' | 'm190') => {
      setExportBusy(kind)
      setExportError(null)
      setExportInfo(null)
      try {
        if (kind === 'sepa') {
          await downloadBlob('/api/sepa', { companyId, month: selectedMonth, year: selectedYear }, `SEPA_${selectedYear}${String(selectedMonth).padStart(2, '0')}.xml`)
        } else if (kind === 'red') {
          await downloadBlob('/api/red', { companyId, month: selectedMonth, year: selectedYear }, `RED_${selectedYear}${String(selectedMonth).padStart(2, '0')}.txt`)
        } else if (kind === 'pdf') {
          const listRes = await fetch(`/api/generacion?company_id=${companyId}&month=${selectedMonth}&year=${selectedYear}&status=generated`)
          const listData = await listRes.json()
          const nominaIds = (listData.nominas || listData.data || []).map((n: any) => n.id).filter(Boolean)
          if (nominaIds.length === 0) throw new Error('No hay nóminas generadas para descargar.')
          await downloadBlob('/api/download-pdfs', { companyId, month: selectedMonth, year: selectedYear, nominaIds }, `Nominas_${selectedYear}${String(selectedMonth).padStart(2, '0')}.zip`)
        } else if (kind === 'm111' || kind === 'm190') {
          const quarter = Math.ceil(selectedMonth / 3)
          const res = await fetch('/api/filing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId,
              kind: kind === 'm111' ? 'modelo_111' : 'modelo_190',
              year: selectedYear,
              quarter: kind === 'm111' ? quarter : undefined,
            }),
          })
          const data = await res.json()
          if (!data.success) throw new Error(data.error || 'Error generando el modelo')
          const blob = new Blob([data.result.csv], { type: 'text/csv;charset=utf-8' })
          const objectUrl = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = objectUrl
          a.download = data.fileName
          document.body.appendChild(a)
          a.click()
          window.URL.revokeObjectURL(objectUrl)
          document.body.removeChild(a)
          setExportInfo(`${kind === 'm111' ? 'Modelo 111' : 'Modelo 190'} generado: ${formatCurrency(data.result.totalAIngresar ?? data.result.totalRetenciones)} en retenciones.`)
        }
      } catch (err) {
        setExportError(err instanceof Error ? err.message : 'Error en la exportación')
      } finally {
        setExportBusy(null)
      }
    },
    [companyId, selectedMonth, selectedYear],
  )

  useEffect(() => {
    if (companyId && step >= 2 && employees.length === 0 && !loadingEmployees && !loadError) {
      loadEmployees()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (!companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Falta el identificador de empresa</CardTitle></CardHeader>
          <CardContent className="text-sm text-slate-600">
            Añade <code className="bg-slate-100 px-1 rounded">?company_id=ID</code> a la URL para acceder al asistente.
          </CardContent>
        </Card>
      </div>
    )
  }

  const steps = [
    { n: 1, label: 'Periodo', icon: CalendarDaysIcon },
    { n: 2, label: 'Preparación', icon: ShieldCheckIcon },
    { n: 3, label: 'Revisión', icon: UserGroupIcon },
    { n: 4, label: 'Generar', icon: DocumentTextIcon },
  ]

  return (
    <div className={DASHBOARD_PAGE_BG}>
      {/* Cabecera + stepper */}
      <div className="bg-[#1B2A41] text-white">
        <div className={cn('max-w-6xl mx-auto px-6', isEmbedded ? 'py-4' : 'py-6')}>
          {!isEmbedded && (
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Asistente de nóminas</h1>
                <p className="text-sm text-white/70 mt-1">
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear} · 100% automático conforme a la legislación española
                </p>
              </div>
              <a
                href={`/generacion/clasico?company_id=${companyId}`}
                className="text-xs text-[#C6A664] hover:text-[#d8bd86] underline underline-offset-4"
              >
                Vista avanzada
              </a>
            </div>
          )}
          <div className={cn('flex items-center gap-2', !isEmbedded && 'mt-6')}>
            {steps.map((s, idx) => {
              const Icon = s.icon
              const active = step === s.n
              const done = step > s.n
              return (
                <div key={s.n} className="flex items-center flex-1">
                  <button
                    onClick={() => (s.n < step || s.n === step ? setStep(s.n) : null)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
                      active ? 'bg-[#C6A664] text-[#1B2A41]' : done ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50',
                    )}
                  >
                    <span className={cn('flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                      active ? 'bg-[#1B2A41] text-white' : done ? 'bg-emerald-400 text-[#1B2A41]' : 'bg-white/10')}>
                      {done ? '✓' : s.n}
                    </span>
                    <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
                    <Icon className="h-4.5 w-4.5 shrink-0 sm:hidden" />
                  </button>
                  {idx < steps.length - 1 && <div className={cn('h-px flex-1 mx-1', done ? 'bg-emerald-400/60' : 'bg-white/10')} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ─── PASO 1: PERIODO ─── */}
        {step === 1 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDaysIcon className="h-4.5 w-4.5 shrink-0 text-[#C6A664]" /> ¿Qué periodo vas a liquidar?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                  <div>
                    <Label>Mes</Label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Año</Label>
                    <Input
                      type="number"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-4.5 w-4.5 shrink-0 flex-shrink-0 mt-0.5" />
                  <span>Solo se pueden generar nóminas de meses ya cerrados (no del mes en curso ni futuros).</span>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => { setStep(2); loadEmployees() }}
                    className="bg-[#1B2A41] hover:bg-[#1B2A41]/90 gap-2"
                  >
                    Continuar <ArrowRightIcon className="h-4.5 w-4.5 shrink-0" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── PASO 2: PREPARACIÓN ─── */}
        {step === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><ShieldCheckIcon className="h-4.5 w-4.5 shrink-0 text-[#C6A664]" /> Checklist de preparación</span>
                  <Button variant="outline" size="sm" onClick={loadEmployees} disabled={loadingEmployees} className="gap-2">
                    <ArrowPathIcon className={cn('h-4.5 w-4.5 shrink-0', loadingEmployees && 'animate-spin')} /> Recargar
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">{loadError}</div>
                )}
                {loadingEmployees ? (
                  <div className="py-12 text-center text-slate-500">
                    <ArrowPathIcon className="w-8 h-8 animate-spin mx-auto mb-3" /> Cargando empleados, convenio y variables…
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {checklist.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 bg-white">
                        <div className="flex items-center gap-3">
                          {c.ok ? (
                            <CheckCircleIcon className="w-6 h-6 text-emerald-500" />
                          ) : (
                            <ExclamationTriangleIcon className="w-6 h-6 text-amber-500" />
                          )}
                          <span className="font-medium text-slate-800">{c.label}</span>
                        </div>
                        <Badge variant="outline" className={cn(c.ok ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-amber-700 border-amber-200 bg-amber-50')}>
                          {c.detail}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeftIcon className="h-4.5 w-4.5 shrink-0" /> Atrás</Button>
              <Button
                onClick={() => setStep(3)}
                disabled={blockers.length > 0 || employees.length === 0}
                className="bg-[#1B2A41] hover:bg-[#1B2A41]/90 gap-2"
              >
                Revisar empleados <ArrowRightIcon className="h-4.5 w-4.5 shrink-0" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── PASO 3: REVISIÓN ─── */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard icon={UserGroupIcon} label="Seleccionados" value={`${summary.count}`} />
              <SummaryCard icon={CurrencyEuroIcon} label="Total bruto" value={formatCurrency(summary.totalGross)} />
              <SummaryCard icon={BanknotesIcon} label="Total líquido" value={formatCurrency(summary.totalNet)} />
              <SummaryCard icon={ReceiptPercentIcon} label="Total IRPF" value={formatCurrency(summary.totalIrpf)} />
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><UserGroupIcon className="h-4.5 w-4.5 shrink-0 text-[#C6A664]" /> Revisión por empleado</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {employees.map((emp) => (
                  <EmployeeReviewRow
                    key={emp.id}
                    emp={emp}
                    companyId={companyId}
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    expanded={expandedId === emp.id}
                    onToggle={() => setExpandedId(expandedId === emp.id ? null : emp.id)}
                    onUpdate={updateRow}
                    calendarDays={getDaysInMonth(selectedMonth, selectedYear)}
                  />
                ))}
                {employees.length === 0 && (
                  <div className="py-8 text-center text-slate-500 text-sm">No hay empleados cargados.</div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeftIcon className="h-4.5 w-4.5 shrink-0" /> Atrás</Button>
              <Button onClick={() => setStep(4)} className="bg-[#1B2A41] hover:bg-[#1B2A41]/90 gap-2">
                Generar nóminas <ArrowRightIcon className="h-4.5 w-4.5 shrink-0" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── PASO 4: GENERAR ─── */}
        {step === 4 && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><DocumentTextIcon className="h-4.5 w-4.5 shrink-0 text-[#C6A664]" /> Resumen y generación</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <SummaryCard icon={UserGroupIcon} label="Nóminas" value={`${summary.count}`} />
                  <SummaryCard icon={CurrencyEuroIcon} label="Coste empresa" value={formatCurrency(summary.totalCost)} />
                  <SummaryCard icon={BanknotesIcon} label="Total líquido" value={formatCurrency(summary.totalNet)} />
                  <SummaryCard icon={ReceiptPercentIcon} label="Total IRPF" value={formatCurrency(summary.totalIrpf)} />
                  <SummaryCard icon={ScaleIcon} label="Total SS trabajador" value={formatCurrency(summary.totalSS)} />
                  <SummaryCard icon={BuildingOffice2Icon} label="Bruto" value={formatCurrency(summary.totalGross)} />
                </div>

                {generating && (
                  <div className="space-y-2">
                    <Progress value={progress} />
                    <p className="text-sm text-slate-500 text-center">Generando… {progress}%</p>
                  </div>
                )}

                {!generationResults && !generating && (
                  <Button onClick={generatePayslips} disabled={summary.count === 0} className="w-full bg-[#C6A664] text-[#1B2A41] hover:bg-[#C6A664]/90 font-semibold gap-2">
                    <DocumentTextIcon className="h-4.5 w-4.5 shrink-0" /> Generar {summary.count} nómina(s)
                  </Button>
                )}

                {generationResults && (
                  <div className="space-y-3">
                    <div className="rounded-lg border p-3 bg-emerald-50 border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
                      <CheckCircleIcon className="h-4.5 w-4.5 shrink-0" />
                      {generationResults.filter((r) => r.success).length} generada(s) correctamente
                      {generationResults.some((r) => !r.success) && `, ${generationResults.filter((r) => !r.success).length} con error`}
                    </div>
                    {generationResults.filter((r) => !r.success).map((r) => (
                      <div key={r.employeeId} className="text-sm text-red-700 flex items-center gap-2">
                        <XCircleIcon className="h-4.5 w-4.5 shrink-0" /> {r.employeeName}: {r.error}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {generationResults && generationResults.some((r) => r.success) && (
              <Card>
                <CardHeader><CardTitle className="text-base">Exportar y presentar</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {exportError && <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-sm text-red-700">{exportError}</div>}
                  {exportInfo && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-sm text-emerald-700">{exportInfo}</div>}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <ExportButton label="PDFs (ZIP)" busy={exportBusy === 'pdf'} onClick={() => runExport('pdf')} />
                    <ExportButton label="Transferencia SEPA" busy={exportBusy === 'sepa'} onClick={() => runExport('sepa')} />
                    <ExportButton label="Fichero RED/SS" busy={exportBusy === 'red'} onClick={() => runExport('red')} />
                    <ExportButton label="Modelo 111" busy={exportBusy === 'm111'} onClick={() => runExport('m111')} />
                    <ExportButton label="Modelo 190" busy={exportBusy === 'm190'} onClick={() => runExport('m190')} />
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)} className="gap-2"><ArrowLeftIcon className="h-4.5 w-4.5 shrink-0" /> Atrás</Button>
              {generationResults && (
                <Button variant="outline" onClick={() => { setGenerationResults(null); setStep(1) }}>Nueva liquidación</Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className={DASHBOARD_KPI_TILE}>
      <div className="flex items-center gap-2 text-vacly-slate text-xs mb-1"><Icon className="h-4.5 w-4.5 shrink-0" /> {label}</div>
      <div className="text-lg font-semibold text-vacly-navy">{value}</div>
    </div>
  )
}

function ExportButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={busy} className="justify-start gap-2 h-auto py-3">
      {busy ? <ArrowPathIcon className="h-4.5 w-4.5 shrink-0 animate-spin" /> : <DocumentTextIcon className="h-4.5 w-4.5 shrink-0 text-[#C6A664]" />}
      <span className="text-sm">{label}</span>
    </Button>
  )
}

function NumField({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="relative">
        <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 h-9" />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
    </div>
  )
}

function irpfSourceLabel(source: string): string {
  const map: Record<string, string> = {
    manual: 'Manual',
    aeat_persisted: 'AEAT',
    aeat_live: 'AEAT (recalc.)',
    estimated: 'Estimado',
    request_fallback: 'Petición',
    none: 'Sin tipo',
  }
  return map[source] ?? source
}

function EmployeeReviewRow({
  emp, companyId, selectedMonth, selectedYear, expanded, onToggle, onUpdate, calendarDays,
}: {
  emp: EmployeeRow
  companyId: string
  selectedMonth: number
  selectedYear: number
  expanded: boolean
  onToggle: () => void
  onUpdate: (id: string, patch: Partial<EmployeeRow>) => void
  calendarDays: number
}) {
  const p = emp.payslipResult

  const saveIrpfManual = async () => {
    onUpdate(emp.id, { irpfSaving: true })
    try {
      const res = await fetch(
        `/api/generacion?action=update_irpf&company_id=${companyId}&employee_id=${emp.id}&mode=manual&irpf_percentage=${emp.irpfPercentage}`,
      )
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      onUpdate(emp.id, {
        irpfPercentage: data.irpfPercentage,
        irpfSource: data.irpfSource,
        manualIrpfRate: data.manualRate,
        aeatIrpfRate: data.aeatRate,
        irpfDiffers: data.differs,
        irpfSaving: false,
      })
    } catch {
      onUpdate(emp.id, { irpfSaving: false })
    }
  }

  const recalcIrpfAeat = async () => {
    onUpdate(emp.id, { irpfSaving: true })
    try {
      const res = await fetch(
        `/api/generacion?action=update_irpf&company_id=${companyId}&employee_id=${emp.id}&mode=recalculate&year=${selectedYear}`,
      )
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      onUpdate(emp.id, {
        irpfPercentage: data.irpfPercentage,
        irpfSource: data.irpfSource,
        manualIrpfRate: data.manualRate,
        aeatIrpfRate: data.aeatRate,
        irpfDiffers: data.differs,
        irpfSaving: false,
      })
    } catch {
      onUpdate(emp.id, { irpfSaving: false })
    }
  }

  return (
    <div className={cn(DASHBOARD_CARD, emp.calcError && 'border-red-200')}>
      <div className="flex items-center gap-3 p-3">
        <input
          type="checkbox"
          checked={emp.selected}
          onChange={(e) => onUpdate(emp.id, { selected: e.target.checked })}
          className="h-4.5 w-4.5 shrink-0 accent-vacly-gold"
        />
        <button onClick={onToggle} className="flex-1 flex items-center justify-between text-left">
          <div>
            <div className="font-medium text-vacly-navy flex items-center gap-2 flex-wrap">
              {emp.name || 'Sin nombre'}
              {!emp.hasActiveContract && <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 text-[10px]">Sin contrato</Badge>}
              {emp.generated && <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px]">Generada</Badge>}
              <Badge variant="outline" className={cn('text-[10px]', emp.irpfSource === 'manual' ? 'border-vacly-gold/40 bg-vacly-gold/10 text-vacly-navy' : 'border-vacly-navy/15 text-vacly-slate')}>
                {irpfSourceLabel(emp.irpfSource)} {emp.irpfPercentage}%
              </Badge>
              {emp.irpfDiffers && emp.aeatIrpfRate != null && (
                <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800">
                  AEAT {emp.aeatIrpfRate}%
                </Badge>
              )}
            </div>
            <div className="text-xs text-vacly-slate">{emp.nif} · Grupo {emp.cotizationGroup}</div>
          </div>
          <div className="flex items-center gap-4">
            {emp.calcError ? (
              <span className="text-xs text-red-600">{emp.calcError}</span>
            ) : (
              <div className="text-right">
                <div className="text-xs text-vacly-slate">Líquido</div>
                <div className="font-semibold text-vacly-navy">{formatCurrency(emp.netSalary)}</div>
              </div>
            )}
            <ChevronDownIcon className={cn('h-4.5 w-4.5 shrink-0 text-vacly-slate transition-transform', expanded && 'rotate-180')} />
          </div>
        </button>
      </div>

      {emp.motorWarnings.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {emp.motorWarnings.slice(0, 3).map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="border-t border-[#1B2A41]/8 bg-[#F6F8FA]/40 p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className={DASHBOARD_EYEBROW}>Variables del mes</h4>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Días trabajados" value={emp.workedDays} onChange={(v) => onUpdate(emp.id, { workedDays: v })} />
              <NumField label="Vacaciones" value={emp.vacationDays} onChange={(v) => onUpdate(emp.id, { vacationDays: v })} />
              <div>
                <Label className="text-xs text-vacly-slate">Horas extra</Label>
                <Input
                  type="number"
                  step={0.25}
                  value={emp.overtimeHours}
                  onChange={(e) =>
                    onUpdate(emp.id, {
                      overtimeHours: Number(e.target.value),
                      overtimeSource: 'manual',
                      overtimeHoursExplicit: true,
                    })
                  }
                  className={cn('mt-1 h-9', DASHBOARD_INPUT_MD)}
                />
                {emp.overtimeSource === 'fichajes' && emp.autoOvertimeHours > 0 && (
                  <span className="text-[10px] text-vacly-slate mt-1 block">
                    Desde fichajes ({emp.autoOvertimeDays} día{emp.autoOvertimeDays !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
              <NumField label="Comisiones" value={emp.commissions} onChange={(v) => onUpdate(emp.id, { commissions: v })} suffix="€" />
              <NumField label="Anticipos" value={emp.advances} onChange={(v) => onUpdate(emp.id, { advances: v })} suffix="€" />
            </div>

            <div className="rounded-xl border border-[#1B2A41]/10 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-vacly-slate">IRPF %</Label>
                <div className="flex gap-2">
                  <button type="button" disabled={emp.irpfSaving} onClick={saveIrpfManual} className={DASHBOARD_OUTLINE_BTN}>
                    Guardar manual
                  </button>
                  <button type="button" disabled={emp.irpfSaving} onClick={recalcIrpfAeat} className={DASHBOARD_OUTLINE_BTN}>
                    Recalcular AEAT
                  </button>
                </div>
              </div>
              <Input
                type="number"
                step={0.01}
                value={emp.irpfPercentage}
                onChange={(e) =>
                  onUpdate(emp.id, {
                    irpfPercentage: Number(e.target.value),
                    irpfSource: 'manual',
                  })
                }
                className={cn('h-9', DASHBOARD_INPUT_MD)}
              />
              {emp.irpfDiffers && emp.aeatIrpfRate != null && (
                <p className="text-[11px] text-amber-700">
                  El % manual ({emp.irpfPercentage}%) difiere del AEAT ({emp.aeatIrpfRate}%).
                </p>
              )}
            </div>

            {emp.complementLines.length > 0 && (
              <div className="rounded-xl border border-[#1B2A41]/10 bg-white p-3">
                <h5 className="text-xs font-semibold text-vacly-navy mb-2">Complementos fijos</h5>
                <div className="space-y-1.5">
                  {emp.complementLines.map((line, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-vacly-slate">{line.concept}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[10px]', line.cotizesSS ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-600')}>
                          {line.cotizesSS ? 'Cotiza' : 'No cotiza'}
                        </Badge>
                        <span className="font-medium text-vacly-navy">{formatCurrency(line.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <details className="rounded-xl border border-[#1B2A41]/10 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-vacly-slate">Conceptos avanzados (especie, embargo, ERTE)</summary>
              <div className="p-3 space-y-4 border-t">
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="Salario en especie" value={emp.inKind.amount} onChange={(v) => onUpdate(emp.id, { inKind: { ...emp.inKind, amount: v } })} suffix="€" />
                  <NumField label="Bonificación cuota empresa" value={emp.bonifications} onChange={(v) => onUpdate(emp.id, { bonifications: v })} suffix="€" />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={emp.garnishment.active} onChange={(e) => onUpdate(emp.id, { garnishment: { ...emp.garnishment, active: e.target.checked } })} className="accent-[#C6A664]" />
                    Embargo judicial (Art. 607 LEC)
                  </label>
                  {emp.garnishment.active && (
                    <div className="grid grid-cols-3 gap-3">
                      <NumField label="Reducción cargas %" value={emp.garnishment.familyReductionPercent} onChange={(v) => onUpdate(emp.id, { garnishment: { ...emp.garnishment, familyReductionPercent: v } })} suffix="%" />
                      <NumField label="Pensión alimentos" value={emp.garnishment.pensionAlimentos} onChange={(v) => onUpdate(emp.id, { garnishment: { ...emp.garnishment, pensionAlimentos: v } })} suffix="€" />
                      <NumField label="Importe fijo" value={emp.garnishment.fixedAmount ?? 0} onChange={(v) => onUpdate(emp.id, { garnishment: { ...emp.garnishment, fixedAmount: v || undefined } })} suffix="€" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!emp.erte}
                      onChange={(e) => onUpdate(emp.id, { erte: e.target.checked ? { type: 'SUSPENSION', affectedDays: 0, reductionPercent: 0, exemptionPercent: 0 } : null })}
                      className="accent-[#C6A664]"
                    />
                    ERTE en el mes
                  </label>
                  {emp.erte && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-slate-500">Tipo</Label>
                        <select
                          value={emp.erte.type}
                          onChange={(e) => onUpdate(emp.id, { erte: { ...emp.erte!, type: e.target.value as 'SUSPENSION' | 'REDUCCION' } })}
                          className="mt-1 w-full border rounded-md px-2 py-2 text-sm h-9"
                        >
                          <option value="SUSPENSION">Suspensión</option>
                          <option value="REDUCCION">Reducción jornada</option>
                        </select>
                      </div>
                      {emp.erte.type === 'SUSPENSION' ? (
                        <NumField label="Días afectados" value={emp.erte.affectedDays} onChange={(v) => onUpdate(emp.id, { erte: { ...emp.erte!, affectedDays: v } })} />
                      ) : (
                        <NumField label="Reducción %" value={emp.erte.reductionPercent} onChange={(v) => onUpdate(emp.id, { erte: { ...emp.erte!, reductionPercent: v } })} suffix="%" />
                      )}
                      <NumField label="Exoneración cuota %" value={emp.erte.exemptionPercent} onChange={(v) => onUpdate(emp.id, { erte: { ...emp.erte!, exemptionPercent: v } })} suffix="%" />
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>

          {/* Desglose en vivo */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">Desglose en vivo</h4>
            {p ? (
              <div className="rounded-lg border bg-white divide-y text-sm">
                <BreakdownLine label="Total devengado" value={p.accruals.totalAccruals} strong />
                <BreakdownLine label="Salario base" value={p.accruals.baseSalary} sub />
                {p.accruals.fixedComplements > 0 && <BreakdownLine label="Complementos" value={p.accruals.fixedComplements} sub />}
                {p.accruals.inKind > 0 && <BreakdownLine label="Salario en especie" value={p.accruals.inKind} sub />}
                {p.accruals.overtimeNormal > 0 && <BreakdownLine label="Horas extra" value={p.accruals.overtimeNormal} sub />}
                <BreakdownLine label="SS trabajador" value={-p.workerDeductions.totalSS} />
                {p.workerDeductions.solidaridad > 0 && <BreakdownLine label="· Solidaridad" value={-p.workerDeductions.solidaridad} sub />}
                <BreakdownLine label="IRPF" value={-p.workerDeductions.irpf} />
                {p.workerDeductions.garnishment > 0 && <BreakdownLine label="Embargo" value={-p.workerDeductions.garnishment} />}
                {p.workerDeductions.inKindValue > 0 && <BreakdownLine label="Valor especie" value={-p.workerDeductions.inKindValue} sub />}
                <BreakdownLine label="Líquido a percibir" value={p.netSalary} strong />
                <BreakdownLine label="Coste empresa" value={p.totalCostCompany} muted />
              </div>
            ) : (
              <div className="text-sm text-red-600">{emp.calcError}</div>
            )}
            {p && p.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 space-y-1">
                {p.warnings.slice(0, 4).map((w, i) => (
                  <div key={i} className="flex items-start gap-1"><ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {w}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BreakdownLine({ label, value, strong, sub, muted }: { label: string; value: number; strong?: boolean; sub?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between px-3 py-2', sub && 'pl-6 text-slate-500', muted && 'text-slate-400')}>
      <span className={cn(strong && 'font-semibold text-[#1B2A41]')}>{label}</span>
      <span className={cn(strong && 'font-semibold', value < 0 ? 'text-red-600' : 'text-slate-700')}>{formatCurrency(value)}</span>
    </div>
  )
}

export default function GeneracionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">Cargando asistente…</div>}>
      <WizardInner />
    </Suspense>
  )
}
