// ============================================================================
// API /api/finiquito — Cálculo y persistencia de finiquitos / indemnizaciones
// ----------------------------------------------------------------------------
// POST: calcula la liquidación de fin de contrato (salario días trabajados,
//       pagas proporcionales, vacaciones no disfrutadas e indemnización) y la
//       guarda en la tabla settlements.
// GET:  lista los finiquitos de la empresa.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import {
  calculateSettlement,
  CausaCese,
  computeAccruedVacationDays,
  type SettlementInput,
} from '@/lib/calculadora'

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function yearsBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return (b - a) / (365.25 * 86_400_000)
}

const CAUSA_VALUES = new Set(Object.values(CausaCese) as string[])

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const {
      companyId,
      employeeId,
      causa,
      terminationDate,
    } = body as {
      companyId?: string
      employeeId?: string
      causa?: string
      terminationDate?: string
    }

    if (!companyId || !employeeId || !causa || !terminationDate) {
      return NextResponse.json(
        { success: false, error: 'companyId, employeeId, causa y terminationDate son obligatorios' },
        { status: 400 },
      )
    }
    if (!CAUSA_VALUES.has(causa)) {
      return NextResponse.json(
        { success: false, error: `causa inválida. Valores: ${Array.from(CAUSA_VALUES).join(', ')}` },
        { status: 400 },
      )
    }

    // Datos del contrato/empleado para derivar valores por defecto.
    const { data: contract } = await supabase
      .from('contracts')
      .select('agreed_base_salary, start_date, full_time, workday_percentage')
      .eq('employee_id', employeeId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: employee } = await supabase
      .from('employees')
      .select('first_name, last_name, nif, compensation, entry_date')
      .eq('id', employeeId)
      .maybeSingle()

    const comp: any = (employee as any)?.compensation || {}
    const monthlySalary = num(
      body.monthlySalary ??
        (contract as any)?.agreed_base_salary ??
        comp.baseSalaryMonthly,
    )
    const numberOfBonuses = num(body.numberOfBonuses ?? comp.numberOfBonuses ?? 2, 2)
    const startDate =
      body.contractStartDate ||
      (contract as any)?.start_date ||
      (employee as any)?.entry_date ||
      terminationDate
    const yearsOfService = body.yearsOfService != null
      ? num(body.yearsOfService)
      : yearsBetween(startDate, terminationDate)

    const calendarDaysInMonth = new Date(
      Number(terminationDate.slice(0, 4)),
      Number(terminationDate.slice(5, 7)),
      0,
    ).getDate()
    const daysWorkedThisMonth = body.daysWorkedThisMonth != null
      ? num(body.daysWorkedThisMonth)
      : Number(terminationDate.slice(8, 10))

    // Vacaciones devengadas no disfrutadas.
    const annualVacationDays = num(body.annualVacationDays ?? 30, 30)
    const yearStart = `${terminationDate.slice(0, 4)}-01-01`
    const daysWorkedInYear =
      (new Date(`${terminationDate}T00:00:00Z`).getTime() -
        new Date(`${yearStart}T00:00:00Z`).getTime()) /
        86_400_000 +
      1
    const accruedVacation = computeAccruedVacationDays(annualVacationDays, daysWorkedInYear)
    const usedVacationDays = num(body.usedVacationDays ?? 0)
    const pendingVacationDays = body.pendingVacationDays != null
      ? num(body.pendingVacationDays)
      : Math.max(0, Math.round((accruedVacation - usedVacationDays) * 100) / 100)

    const input: SettlementInput = {
      causa: causa as CausaCese,
      monthlySalary,
      numberOfBonuses,
      yearsOfService,
      daysWorkedThisMonth,
      calendarDaysInMonth,
      pendingVacationDays,
      bonusAccrualMonths: num(body.bonusAccrualMonths ?? 6, 6),
      dailySalaryForSeverance: body.dailySalaryForSeverance != null
        ? num(body.dailySalaryForSeverance)
        : undefined,
    }

    const result = calculateSettlement(input)

    let settlementId: string | null = null
    try {
      const { data: inserted } = await supabase
        .from('settlements')
        .insert({
          company_id: companyId,
          employee_id: employeeId,
          causa,
          termination_date: terminationDate,
          years_of_service: yearsOfService,
          monthly_salary: monthlySalary,
          number_of_bonuses: numberOfBonuses,
          pending_vacation_days: pendingVacationDays,
          salary_days_worked: result.salaryDaysWorked,
          prorated_bonuses: result.proratedBonuses,
          vacation_settlement: result.vacationSettlement,
          severance: result.severance,
          taxable_total: result.taxableTotal,
          total: result.total,
          calculation_details: { input, result, accruedVacation },
          status: 'generated',
        })
        .select('id')
        .maybeSingle()
      settlementId = (inserted as any)?.id ?? null
    } catch (persistErr) {
      console.warn('[finiquito] No se pudo persistir settlement:', persistErr)
    }

    return NextResponse.json({ success: true, settlementId, input, result, accruedVacation })
  } catch (err) {
    console.error('[POST /api/finiquito] Error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    if (!companyId) {
      return NextResponse.json({ success: false, error: 'company_id requerido' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, settlements: data ?? [] })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
