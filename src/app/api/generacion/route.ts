import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import {
  calculatePayslip,
  DEFAULT_CONFIG_2025,
  TipoContrato,
  TipoJornada,
} from '@/lib/calculadora'
import type {
  EmployeePayrollInput,
  MonthlyVariablesInput,
  PayrollConfigInput,
  PayslipResult,
  GrupoCotizacion,
} from '@/lib/calculadora'

// ─── GET: List generated nominas with filters ─────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const employeeId = searchParams.get('employee_id')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'company_id es requerido' },
        { status: 400 }
      )
    }

    // Handle load_employees action
    const action = searchParams.get('action')
    if (action === 'load_employees') {
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select(`
          id, first_name, last_name, nif, social_security_number, iban, compensation, status,
          contracts (id, contract_type, full_time, workday_percentage, agreed_base_salary, cotization_group, status)
        `)
        .eq('company_id', companyId)
        .eq('status', 'active')

      if (empError) {
        console.error('Error fetching employees:', empError)
        return NextResponse.json(
          { success: false, error: 'Error al cargar empleados', details: empError.message },
          { status: 500 }
        )
      }

      // Only include employees with active contracts
      const filtered = (employees || []).map((emp: any) => ({
        ...emp,
        contracts: (emp.contracts || []).filter((c: any) => c.status === 'active')
      })).filter((emp: any) => emp.contracts.length > 0)

      return NextResponse.json({
        success: true,
        employees: filtered,
      })
    }

    let query = supabase
      .from('nominas')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    // Filter by period (month/year) using period_start
    if (year && month) {
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
      const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
      query = query.gte('period_start', periodStart).lte('period_start', periodEnd)
    } else if (year) {
      query = query.gte('period_start', `${year}-01-01`).lte('period_start', `${year}-12-31`)
    }

    if (employeeId) {
      query = query.eq('employee_id', employeeId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    query = query.range(offset, offset + limit - 1)

    const { data: nominas, error, count } = await query

    if (error) {
      console.error('Error fetching nominas:', error)
      return NextResponse.json(
        { success: false, error: 'Error al obtener nóminas', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: nominas || [],
      total: count,
      limit,
      offset,
    })
  } catch (error) {
    console.error('GET /api/generacion error:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// ─── POST: Generate payslips ──────────────────────────────────────────

interface EmployeeGenerationInput {
  employeeId: string
  employeeName: string
  dni: string
  ssNumber: string
  iban: string
  baseSalaryMonthly: number
  cotizationGroup: number
  irpfPercentage: number
  fixedComplements: number
  proratedBonuses: number
  numberOfBonuses: number
  contractType: string
  fullTime: boolean
  workdayPercentage: number
  variables: {
    workedDays: number
    overtimeHours: number
    vacationDays: number
    itDays: number
    commissions: number
    advances: number
    incentives: number
  }
}

interface GenerationRequest {
  companyId: string
  companyData?: Record<string, unknown>
  month: number
  year: number
  employees: EmployeeGenerationInput[]
}

function mapContractType(type: string): TipoContrato {
  const map: Record<string, TipoContrato> = {
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
  return map[type] || TipoContrato.INDEFINIDO
}

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body: GenerationRequest = await request.json()

    const { companyId, companyData, month, year, employees } = body

    if (!companyId || !month || !year || !employees || employees.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: companyId, month, year, employees' },
        { status: 400 }
      )
    }

    // Load payroll config for the company (if exists)
    const { data: payrollConfig } = await supabase
      .from('payroll_config')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()

    // Build config from payroll_config or use defaults
    let config: PayrollConfigInput = { ...DEFAULT_CONFIG_2025 }
    if (payrollConfig?.annual_parameters) {
      config = { ...config, ...payrollConfig.annual_parameters }
    }
    if (payrollConfig?.at_ep_rate) {
      config = {
        ...config,
        companyRates: {
          ...config.companyRates,
          atEp: payrollConfig.at_ep_rate,
        },
      }
    }

    const calendarDays = getDaysInMonth(month, year)
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${calendarDays}`

    const results: Array<{
      employeeId: string
      employeeName: string
      success: boolean
      nominaId?: string
      result?: PayslipResult
      error?: string
    }> = []

    for (const emp of employees) {
      try {
        // Build EmployeePayrollInput
        const employeeInput: EmployeePayrollInput = {
          baseSalaryMonthly: emp.baseSalaryMonthly,
          cotizationGroup: (emp.cotizationGroup || 7) as GrupoCotizacion,
          irpfPercentage: emp.irpfPercentage || 0,
          fixedComplements: emp.fixedComplements || 0,
          proratedBonuses: emp.proratedBonuses || (emp.baseSalaryMonthly * 2) / 12,
          numberOfBonuses: emp.numberOfBonuses || 2,
          contractType: mapContractType(emp.contractType),
          workdayType: emp.fullTime ? TipoJornada.COMPLETA : TipoJornada.PARCIAL,
          partTimeCoefficient: emp.fullTime ? 1 : (emp.workdayPercentage || 100) / 100,
        }

        // Build MonthlyVariablesInput
        const vars = emp.variables
        const monthlyVars: MonthlyVariablesInput = {
          calendarDaysInMonth: calendarDays,
          workedDays: vars.workedDays ?? 30,
          overtimeHours: vars.overtimeHours || 0,
          overtimeAmount: (vars.overtimeHours || 0) * (emp.baseSalaryMonthly / 30 / 8) * 1.25,
          overtimeForceMajeureHours: 0,
          overtimeForceMajeureAmount: 0,
          accumulatedOvertimeHoursYear: 0,
          vacationDays: vars.vacationDays || 0,
          commissions: vars.commissions || 0,
          incentives: vars.incentives || 0,
          bonusPayment: 0,
          advances: vars.advances || 0,
          otherSalaryAccruals: 0,
          otherNonSalaryAccruals: 0,
          otherDeductions: 0,
        }

        // Handle IT (temporary disability)
        if (vars.itDays && vars.itDays > 0) {
          monthlyVars.temporaryDisability = {
            active: true,
            contingencyType: 'ENFERMEDAD_COMUN' as any,
            startDay: 1,
            endDay: vars.itDays,
            absoluteDaysSinceStart: vars.itDays,
          }
        }

        // Calculate payslip
        const payslipResult = calculatePayslip(employeeInput, monthlyVars, config, month)

        // Build perceptions array
        const perceptions = [
          { concept: 'Salario Base', amount: payslipResult.accruals.baseSalary },
          ...(payslipResult.accruals.fixedComplements > 0
            ? [{ concept: 'Complementos Salariales', amount: payslipResult.accruals.fixedComplements }]
            : []),
          ...(payslipResult.accruals.commissions > 0
            ? [{ concept: 'Comisiones', amount: payslipResult.accruals.commissions }]
            : []),
          ...(payslipResult.accruals.overtimeNormal > 0
            ? [{ concept: 'Horas Extraordinarias', amount: payslipResult.accruals.overtimeNormal }]
            : []),
          ...(payslipResult.accruals.itCompanyBenefit > 0
            ? [{ concept: 'IT Empresa', amount: payslipResult.accruals.itCompanyBenefit }]
            : []),
          ...(payslipResult.accruals.itSSBenefit > 0
            ? [{ concept: 'IT Seg. Social', amount: payslipResult.accruals.itSSBenefit }]
            : []),
        ]

        // Build deductions array
        const deductions = [
          { concept: 'Contingencias Comunes', rate: config.workerRates.contingenciasComunes, amount: payslipResult.workerDeductions.contingenciasComunes },
          { concept: 'Desempleo', amount: payslipResult.workerDeductions.desempleo },
          { concept: 'Formación Profesional', rate: config.workerRates.formacionProfesional, amount: payslipResult.workerDeductions.formacionProfesional },
          { concept: 'MEI', rate: config.workerRates.mei, amount: payslipResult.workerDeductions.mei },
          { concept: 'IRPF', rate: emp.irpfPercentage, amount: payslipResult.workerDeductions.irpf },
          ...(payslipResult.workerDeductions.advances > 0
            ? [{ concept: 'Anticipos', amount: payslipResult.workerDeductions.advances }]
            : []),
        ]

        // Build contributions array
        const contributions = [
          { concept: 'Contingencias Comunes', base: payslipResult.bases.baseCC, rate: config.companyRates.contingenciasComunes, amount: payslipResult.companyDeductions.contingenciasComunes },
          { concept: 'AT/EP', base: payslipResult.bases.baseCP, rate: config.companyRates.atEp, amount: payslipResult.companyDeductions.atEp },
          { concept: 'Desempleo', base: payslipResult.bases.baseCP, amount: payslipResult.companyDeductions.desempleo },
          { concept: 'FOGASA', base: payslipResult.bases.baseCP, rate: config.companyRates.fogasa, amount: payslipResult.companyDeductions.fogasa },
          { concept: 'Formación Profesional', base: payslipResult.bases.baseCP, rate: config.companyRates.formacionProfesional, amount: payslipResult.companyDeductions.formacionProfesional },
          { concept: 'MEI', base: payslipResult.bases.baseCP, rate: config.companyRates.mei, amount: payslipResult.companyDeductions.mei },
        ]

        // Save nomina to database
        const nominaRecord = {
          company_id: companyId,
          employee_id: emp.employeeId,
          period_start: periodStart,
          period_end: periodEnd,
          employee: {
            name: emp.employeeName,
            dni: emp.dni,
            social_security_number: emp.ssNumber,
          },
          company: companyData || {},
          perceptions,
          deductions,
          contributions,
          gross_salary: payslipResult.accruals.totalAccruals,
          net_pay: payslipResult.netSalary,
          base_ss: payslipResult.bases.baseCC,
          cost_empresa: payslipResult.totalCostCompany,
          total_contributions: payslipResult.companyDeductions.totalCompanySS,
          status: 'generated',
          company_cotizations: payslipResult.companyDeductions,
          calculation_details: {
            accruals: payslipResult.accruals,
            bases: payslipResult.bases,
            workerDeductions: payslipResult.workerDeductions,
            companyDeductions: payslipResult.companyDeductions,
            itDetail: payslipResult.itDetail,
            warnings: payslipResult.warnings,
          },
          dni: emp.dni,
          document_name: `Nomina_${emp.employeeName.replace(/\s+/g, '_')}_${String(month).padStart(2, '0')}_${year}`,
        }

        const { data: savedNomina, error: saveError } = await supabase
          .from('nominas')
          .insert(nominaRecord)
          .select('id')
          .single()

        if (saveError) {
          throw new Error(`Error guardando nómina: ${saveError.message}`)
        }

        // Save monthly variables
        const monthlyVarsRecord = {
          employee_id: emp.employeeId,
          company_id: companyId,
          month,
          year,
          worked_days: vars.workedDays,
          overtime: {
            hours: vars.overtimeHours || 0,
            amount: monthlyVars.overtimeAmount,
          },
          vacation_days: vars.vacationDays || 0,
          temporary_disability: vars.itDays > 0
            ? { days: vars.itDays, type: 'ENFERMEDAD_COMUN' }
            : null,
          commissions: vars.commissions || 0,
          incentives: vars.incentives || 0,
          bonuses: 0,
          advances: vars.advances || 0,
          status: 'generated',
        }

        await supabase.from('monthly_variables').upsert(monthlyVarsRecord, {
          onConflict: 'employee_id,company_id,month,year',
        })

        results.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          success: true,
          nominaId: savedNomina?.id,
          result: payslipResult,
        })
      } catch (err) {
        console.error(`Error generating payslip for ${emp.employeeName}:`, err)
        results.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          success: false,
          error: err instanceof Error ? err.message : 'Error desconocido',
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const errorCount = results.filter((r) => !r.success).length

    return NextResponse.json({
      success: errorCount === 0,
      message: `${successCount} nómina(s) generada(s) correctamente${errorCount > 0 ? `, ${errorCount} error(es)` : ''}`,
      results,
      summary: {
        total: employees.length,
        success: successCount,
        errors: errorCount,
      },
    })
  } catch (error) {
    console.error('POST /api/generacion error:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
