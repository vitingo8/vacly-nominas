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
import { generatePayslipPDF } from '@/lib/generadores'
import type { PayslipPDFData } from '@/lib/generadores'
import {
  resolveAgreementContext,
  computeSeniorityAmount,
  getExtraPaysForMonth,
  computeProratedBonuses,
  AgreementOutOfForceError,
  AgreementNotAssignedError,
  type AgreementContext,
} from '@/lib/convenio'

// ─── GET: List generated nominas with filters ─────────────────────────
export async function GET(request: NextRequest) {
  try {
    console.log('[GET /api/generacion] Starting request')
    
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const employeeId = searchParams.get('employee_id')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    console.log('[GET /api/generacion] Query params:', {
      companyId,
      month,
      year,
      employeeId,
      status,
      limit,
      offset,
    })

    if (!companyId) {
      console.warn('[GET /api/generacion] Missing company_id')
      return NextResponse.json(
        { success: false, error: 'company_id es requerido' },
        { status: 400 }
      )
    }

    // Handle load_employees action
    const action = searchParams.get('action')
    if (action === 'load_employees') {
      console.log(`[load_employees] Fetching for company_id: ${companyId}`)
      
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select(`
          id, first_name, last_name, nif, social_security_number, iban, compensation, status, image_url,
          position, sede, address, entry_date,
          contracts!contracts_employee_id_fkey (
            id, contract_type, full_time, workday_percentage, agreed_base_salary,
            cotization_group, status, agreement_ref_id, professional_category,
            start_date, work_center_address, occupation_code, weekly_hours,
            trial_period_months
          )
        `)
        .eq('company_id', companyId)
        .eq('status', 'Activo')

      if (empError) {
        console.error('[load_employees] Supabase error:', {
          code: empError.code,
          message: empError.message,
          details: empError.details,
          hint: empError.hint,
        })
        return NextResponse.json(
          {
            success: false,
            error: 'Error al cargar empleados',
            details: empError.message,
            code: empError.code,
            fullError: empError,
          },
          { status: 500 }
        )
      }

      console.log(`[load_employees] Loaded ${employees?.length || 0} employees`)

      // Resuelve el convenio activo de la empresa para poder completar datos
      // de empleados sin contrato (sin mocks: sólo si hay convenio asignado).
      let companyAgreementId: string | null = null
      let companyAgreementDefaults: any = null
      let agreementDefaultBase = 0
      try {
        const { data: agrRows } = await (supabase as any).rpc('fn_agreement_for_company', {
          p_company_id: companyId,
          p_on_date: new Date().toISOString().slice(0, 10),
        })
        companyAgreementId = (Array.isArray(agrRows) ? agrRows[0]?.agreement_id : agrRows?.agreement_id) || null
        if (companyAgreementId) {
          const { data: defRows } = await (supabase as any).rpc('fn_agreement_defaults', {
            p_agreement_id: companyAgreementId,
          })
          companyAgreementDefaults = Array.isArray(defRows) ? defRows[0] : defRows
          // Base salarial orientativa (para preview client-side) a partir de la
          // categoría y grupo por defecto del convenio. Se recalcula realmente
          // en POST con fn_resolve_salary_base + parcialidad.
          try {
            const { data: baseVal } = await (supabase as any).rpc('fn_resolve_salary_base', {
              p_agreement_id: companyAgreementId,
              p_province: companyAgreementDefaults?.province ?? null,
              p_year: new Date().getFullYear(),
              p_grupo: companyAgreementDefaults?.default_cotization_group
                ? `Grupo ${companyAgreementDefaults.default_cotization_group}`
                : null,
              p_nivel: null,
              p_categoria: companyAgreementDefaults?.default_professional_category ?? null,
            })
            agreementDefaultBase = Number(baseVal ?? 0) || 0
          } catch (_) {
            // no-op: el preview mostrará 0 pero la generación real lo resolverá.
          }
        }
      } catch (agrErr) {
        console.warn('[load_employees] Could not resolve company agreement:', agrErr)
      }

      // Todos los empleados aparecen en la tabla: el flag hasActiveContract
      // avisa al frontend de qué filas usarán el contrato virtual derivado del
      // convenio. Sin mocks: si no hay convenio ni contrato, se marcará error
      // al generar.
      const processed = (employees || []).map((emp: any) => {
        const activeContracts = (emp.contracts || []).filter((c: any) => c.status === 'active')
        const comp = { ...(emp.compensation || {}) }
        const hasActiveContract = activeContracts.length > 0
        // Pre-rellena el salario base desde el convenio si el empleado no tiene
        // contrato ni compensation.baseSalaryMonthly. Esto sólo afecta al
        // preview de la UI; la generación real se hace con fn_resolve_salary_base.
        if (!hasActiveContract && !comp.baseSalaryMonthly && agreementDefaultBase > 0) {
          comp.baseSalaryMonthly = agreementDefaultBase
        }
        return {
          ...emp,
          compensation: comp,
          contracts: activeContracts,
          hasActiveContract,
          hasAgreedBaseSalary:
            activeContracts[0]?.agreed_base_salary > 0 || comp.baseSalaryMonthly > 0,
        }
      })

      console.log(
        `[load_employees] ${processed.length} total — with contract: ${processed.filter(e => e.hasActiveContract).length}, without: ${processed.filter(e => !e.hasActiveContract).length}`,
      )

      return NextResponse.json({
        success: true,
        employees: processed,
        // Para compatibilidad con consumidores anteriores que separaban listas.
        employeesWithoutContract: processed.filter((e: any) => !e.hasActiveContract),
        companyAgreement: companyAgreementId
          ? { agreement_id: companyAgreementId, defaults: companyAgreementDefaults }
          : null,
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
  // Opcional: permite override del contrato/centro
  contractId?: string
  province?: string
  professionalCategory?: string
  professionalGroup?: string
  professionalLevel?: string
  contractStartDate?: string
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

type BonusMode = 'prorated' | 'integral'

interface AgreementDerived {
  context: AgreementContext
  bonusMode: BonusMode
  baseSalaryMonthly: number       // ajustado por parcialidad
  seniorityAmount: number         // ajustado por parcialidad
  seniorityPeriods: number
  seniorityPercent: number
  yearsOfService: number
  // Modo 'prorated': suma mensual que entra como devengo salarial (otherSalaryAccruals)
  // Modo 'integral': 0 siempre; la paga íntegra entra como bonusPayment en su mes
  monthlyProratedBonuses: number
  // Solo en modo 'integral' y solo si el mes coincide con la fecha de pago del convenio
  integralBonusThisMonth: number
  // Para base CC: solo se usa en modo 'integral' cuando no es mes de pago
  bonusBaseCC: number
  extraPayNames: string[]         // nombres de pagas que tocan este mes
  allExtraPayNames: string[]      // nombres de todas las pagas del año (para modo prorrateado)
  numberOfBonuses: number
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function yearsBetween(startIso: string | null | undefined, refIso: string): number {
  if (!startIso) return 0
  const start = new Date(startIso)
  const ref = new Date(refIso)
  if (isNaN(start.getTime()) || isNaN(ref.getTime())) return 0
  let years = ref.getFullYear() - start.getFullYear()
  const m = ref.getMonth() - start.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < start.getDate())) years--
  return Math.max(0, years)
}

/**
 * A partir del contrato activo (real o virtual derivado del convenio), resuelve
 * el contexto del convenio colectivo y deriva los importes concretos (base,
 * antigüedad, prorrateo, paga extra del mes) ajustados por parcialidad.
 * Devuelve null si no hay forma de resolver convenio (sin agreement_ref_id y
 * sin convenio asignado a la empresa).
 */
async function deriveAgreementForContract(
  supabase: ReturnType<typeof getSupabaseClient>,
  params: {
    companyId: string
    contract: any
    partTimeCoefficient: number
    periodStartIso: string
    year: number
    month: number
    bonusMode: BonusMode
  },
): Promise<AgreementDerived | null> {
  const contract = params.contract
  if (!contract) return null
  // Si no hay agreement_ref_id en el contrato, dejamos que resolveAgreementContext
  // resuelva el convenio activo de la empresa (flujo sin contrato explícito).

  const province = contract.work_center_address
    ? contract.work_center_address.split(',').slice(-1)[0].trim() || null
    : null

  const context = await resolveAgreementContext(supabase, {
    companyId: params.companyId,
    onDate: params.periodStartIso,
    province: province ?? undefined,
    year: params.year,
    grupo: contract.cotization_group
      ? `Grupo ${contract.cotization_group}`
      : null,
    nivel: null,
    categoria: contract.professional_category ?? null,
  })

  const ftBase = context.salarioBaseMes ?? Number(contract.agreed_base_salary ?? 0)
  const years = yearsBetween(contract.start_date, params.periodStartIso)
  const sen = computeSeniorityAmount(context, years, ftBase)

  const ftMonthlyBase = ftBase + sen.amount
  // Prorrata anual / 12 (modo prorrateado); o prorrata para base CC en meses sin paga (modo íntegro)
  const ftProratedMonthly = computeProratedBonuses(context, ftMonthlyBase)

  const paysInMonth = getExtraPaysForMonth(context, params.month)
  // Importe íntegro el mes declarado (base+antigüedad por cada paga)
  const ftIntegralThisMonth = paysInMonth.length * ftMonthlyBase

  const coef = Math.max(0, Math.min(1, params.partTimeCoefficient))
  const isProrated = params.bonusMode === 'prorated'

  return {
    context,
    bonusMode: params.bonusMode,
    baseSalaryMonthly: round2(ftBase * coef),
    seniorityAmount: round2(sen.amount * coef),
    seniorityPeriods: sen.periodsCompleted,
    seniorityPercent: sen.percentApplied,
    yearsOfService: years,
    monthlyProratedBonuses: isProrated ? round2(ftProratedMonthly * coef) : 0,
    integralBonusThisMonth: !isProrated ? round2(ftIntegralThisMonth * coef) : 0,
    // En modo íntegro, base CC incluye prorrata solo en meses SIN paga
    bonusBaseCC:
      !isProrated && paysInMonth.length === 0 ? round2(ftProratedMonthly * coef) : 0,
    extraPayNames: paysInMonth.map((p) => p.name),
    allExtraPayNames: context.extraPays.map((p) => p.name),
    numberOfBonuses: context.numberOfBonuses,
  }
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

    // Cargar datos reales de la empresa desde `companies` (company_id/company/cif/…)
    // para que las nóminas y PDFs muestren el nombre/CIF correctos.
    const { data: companyRow } = await supabase
      .from('companies')
      .select('company, cif, address, logo_url, phone, email')
      .eq('company_id', companyId)
      .maybeSingle()
    const resolvedCompany = {
      name:
        (payrollConfig as any)?.company_legal_name
        || (companyRow as any)?.company
        || (companyData as any)?.name
        || 'Empresa',
      cif:
        (payrollConfig as any)?.company_tax_id
        || (companyRow as any)?.cif
        || (companyData as any)?.cif
        || '',
      ccc: (payrollConfig as any)?.ss_account_code || (companyData as any)?.ccc || '',
      address: (companyRow as any)?.address || (companyData as any)?.address || '',
      phone: (companyRow as any)?.phone || (companyData as any)?.phone || '',
      email: (companyRow as any)?.email || (companyData as any)?.email || '',
      logo_url: (companyRow as any)?.logo_url || (companyData as any)?.logo_url || '',
    }

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
        const partTimeCoefficient = emp.fullTime
          ? 1
          : (emp.workdayPercentage || 100) / 100

        // Cargar contrato activo (agreement_ref_id, professional_category, start_date, …)
        let activeContract: any = null
        if (emp.contractId) {
          const { data: c } = await supabase
            .from('contracts')
            .select(
              'id, agreement_ref_id, cotization_group, professional_category, start_date, work_center_address, agreed_base_salary, occupation_code',
            )
            .eq('id', emp.contractId)
            .maybeSingle()
          activeContract = c
        } else {
          const { data: c } = await supabase
            .from('contracts')
            .select(
              'id, agreement_ref_id, cotization_group, professional_category, start_date, work_center_address, agreed_base_salary, occupation_code',
            )
            .eq('employee_id', emp.employeeId)
            .eq('status', 'active')
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle()
          activeContract = c
        }

        // Contrato virtual: si el empleado no tiene contrato real activo, sintetizamos
        // uno a partir del convenio asignado a la empresa + datos del empleado (no
        // hay mocks: si no existe convenio, se cae al flujo legacy con inputs).
        let isVirtualContract = false
        if (!activeContract) {
          try {
            const { data: agrRows } = await (supabase as any).rpc('fn_agreement_for_company', {
              p_company_id: companyId,
              p_on_date: periodStart,
            })
            const agreementId = (Array.isArray(agrRows) ? agrRows[0]?.agreement_id : agrRows?.agreement_id) || null
            if (agreementId) {
              const { data: defRows } = await (supabase as any).rpc('fn_agreement_defaults', {
                p_agreement_id: agreementId,
              })
              const defaults = Array.isArray(defRows) ? defRows[0] : defRows
              // Datos del empleado (position / sede / entry_date) para no caer en valores por defecto.
              const { data: empRow } = await supabase
                .from('employees')
                .select('position, sede, address, entry_date, compensation')
                .eq('id', emp.employeeId)
                .maybeSingle()
              const comp: any = (empRow?.compensation as any) || {}
              activeContract = {
                id: null,
                agreement_ref_id: agreementId,
                cotization_group: comp.cotizationGroup
                  ?? emp.cotizationGroup
                  ?? defaults?.default_cotization_group
                  ?? 7,
                professional_category:
                  emp.professionalCategory
                  ?? empRow?.position
                  ?? defaults?.default_professional_category
                  ?? null,
                start_date: emp.contractStartDate
                  ?? empRow?.entry_date
                  ?? periodStart,
                work_center_address: empRow?.sede
                  ?? empRow?.address
                  ?? defaults?.province
                  ?? null,
                agreed_base_salary: comp.baseSalaryMonthly ?? emp.baseSalaryMonthly ?? 0,
                occupation_code: null,
              }
              isVirtualContract = true
              console.log(
                `[generacion] Virtual contract from convenio for ${emp.employeeName} (agreement=${agreementId})`,
              )
            }
          } catch (virtErr) {
            console.warn('[generacion] Could not synthesize virtual contract:', virtErr)
          }
        }

        // Override desde el input si el caller lo pasa explícitamente
        if (emp.province && activeContract) activeContract.work_center_address = `${activeContract.work_center_address ?? ''}, ${emp.province}`
        if (emp.professionalCategory && activeContract) activeContract.professional_category = emp.professionalCategory
        if (emp.contractStartDate && activeContract) activeContract.start_date = emp.contractStartDate

        // Modo de pagas extra: por ahora se infiere de la configuración de la empresa/contrato
        // o se asume 'prorated' (modalidad más frecuente en España). Expuesto en payroll_config.
        const bonusMode: BonusMode =
          (payrollConfig?.annual_parameters as any)?.bonusMode === 'integral'
            ? 'integral'
            : 'prorated'

        // Derivar del convenio (contrato real o virtual basado en convenio)
        let derived: AgreementDerived | null = null
        try {
          if (activeContract?.agreement_ref_id) {
            derived = await deriveAgreementForContract(supabase, {
              companyId,
              contract: activeContract,
              partTimeCoefficient,
              periodStartIso: periodStart,
              year,
              month,
              bonusMode,
            })
          }
        } catch (convErr) {
          if (convErr instanceof AgreementOutOfForceError) {
            throw new Error(
              `Convenio fuera de vigencia: ${convErr.message}. ` +
              `Política ultraactividad = bloqueo. Revise fechas o asigne convenio vigente.`,
            )
          }
          if (convErr instanceof AgreementNotAssignedError) {
            // No bloquear: seguir con flujo legacy pero advertir
            console.warn(`[generacion] ${convErr.message} → flujo legacy`)
          } else {
            throw convErr
          }
        }

        // Valores efectivos (convenio prevalece sobre input manual)
        const effectiveBase = derived?.baseSalaryMonthly ?? emp.baseSalaryMonthly
        const effectiveFixed =
          (emp.fixedComplements || 0) + (derived?.seniorityAmount ?? 0)
        // Prorrata a base CC:
        //  - Modo prorrateado: 0 (ya va como devengo mensual en otherSalaryAccruals)
        //  - Modo íntegro: prorrata solo los meses sin paga (bonusBaseCC)
        //  - Legacy sin convenio: usa lo que venga en input o cálculo por defecto
        const effectiveProratedForCC = derived
          ? derived.bonusBaseCC
          : (emp.proratedBonuses || (emp.baseSalaryMonthly * 2) / 12)
        const effectiveNumberOfBonuses =
          derived?.numberOfBonuses ?? emp.numberOfBonuses ?? 2
        // Devengo mensual de pagas extra (modo prorrateado)
        const monthlyBonusAccrual = derived?.monthlyProratedBonuses ?? 0
        // Pago íntegro este mes (modo íntegro)
        const integralBonusPayment = derived?.integralBonusThisMonth ?? 0

        // Build EmployeePayrollInput
        const employeeInput: EmployeePayrollInput = {
          baseSalaryMonthly: effectiveBase,
          cotizationGroup: (emp.cotizationGroup || 7) as GrupoCotizacion,
          irpfPercentage: emp.irpfPercentage || 0,
          fixedComplements: effectiveFixed,
          proratedBonuses: effectiveProratedForCC,
          numberOfBonuses: effectiveNumberOfBonuses,
          contractType: mapContractType(emp.contractType),
          workdayType: emp.fullTime ? TipoJornada.COMPLETA : TipoJornada.PARCIAL,
          partTimeCoefficient,
        }

        // Build MonthlyVariablesInput
        const vars = emp.variables
        const monthlyVars: MonthlyVariablesInput = {
          calendarDaysInMonth: calendarDays,
          workedDays: vars.workedDays ?? calendarDays,
          overtimeHours: vars.overtimeHours || 0,
          overtimeAmount: (vars.overtimeHours || 0) * (effectiveBase / 30 / 8) * 1.25,
          overtimeForceMajeureHours: 0,
          overtimeForceMajeureAmount: 0,
          accumulatedOvertimeHoursYear: 0,
          vacationDays: vars.vacationDays || 0,
          commissions: vars.commissions || 0,
          incentives: vars.incentives || 0,
          // Pago íntegro de paga extra este mes (modo íntegro)
          bonusPayment: integralBonusPayment,
          advances: vars.advances || 0,
          // Prorrata mensual de pagas (modo prorrateado): entra como devengo salarial
          otherSalaryAccruals: monthlyBonusAccrual,
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

        // Build perceptions array (desglose línea a línea dirigido por convenio)
        const manualFixedComplements = round2(
          payslipResult.accruals.fixedComplements - (derived?.seniorityAmount ?? 0),
        )
        const perceptions: Array<{ concept: string; amount: number }> = [
          { concept: 'Salario Base', amount: payslipResult.accruals.baseSalary },
        ]
        if ((derived?.seniorityAmount ?? 0) > 0) {
          perceptions.push({
            concept: `Antigüedad (${derived!.seniorityPeriods}×${derived!.context.seniority?.periodYears ?? 3}a · ${derived!.seniorityPercent}%)`,
            amount: derived!.seniorityAmount,
          })
        }
        if (manualFixedComplements > 0) {
          perceptions.push({ concept: 'Complementos Salariales', amount: manualFixedComplements })
        }
        if (payslipResult.accruals.commissions > 0) {
          perceptions.push({ concept: 'Comisiones', amount: payslipResult.accruals.commissions })
        }
        if (payslipResult.accruals.overtimeNormal > 0) {
          perceptions.push({ concept: 'Horas Extraordinarias', amount: payslipResult.accruals.overtimeNormal })
        }
        if (derived && derived.bonusMode === 'prorated' && derived.monthlyProratedBonuses > 0 && derived.allExtraPayNames.length > 0) {
          // Prorrateo mensual: una línea por cada paga, todas con el mismo importe
          const perPay = round2(derived.monthlyProratedBonuses / derived.allExtraPayNames.length)
          for (const name of derived.allExtraPayNames) {
            perceptions.push({ concept: `EX.${name.toUpperCase()}`, amount: perPay })
          }
        } else if (derived && derived.bonusMode === 'integral' && derived.integralBonusThisMonth > 0 && derived.extraPayNames.length > 0) {
          // Pago íntegro este mes
          const perPay = round2(derived.integralBonusThisMonth / derived.extraPayNames.length)
          for (const name of derived.extraPayNames) {
            perceptions.push({ concept: `Paga Extraordinaria ${name}`, amount: perPay })
          }
        } else if (payslipResult.accruals.bonusPayment > 0) {
          perceptions.push({ concept: 'Paga Extraordinaria', amount: payslipResult.accruals.bonusPayment })
        }
        if (payslipResult.accruals.itCompanyBenefit > 0) {
          perceptions.push({ concept: 'IT Empresa', amount: payslipResult.accruals.itCompanyBenefit })
        }
        if (payslipResult.accruals.itSSBenefit > 0) {
          perceptions.push({ concept: 'IT Seg. Social', amount: payslipResult.accruals.itSSBenefit })
        }

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
          company: { ...(companyData || {}), ...resolvedCompany },
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
            warnings: [
              ...payslipResult.warnings,
              ...(derived?.context.warnings ?? []),
            ],
            virtual_contract: isVirtualContract,
            contract_id: activeContract?.id ?? null,
            agreement: derived
              ? {
                  agreement_id: derived.context.lookup.agreementId,
                  province: derived.context.province,
                  effective_from: derived.context.lookup.effectiveFrom,
                  effective_to: derived.context.lookup.effectiveTo,
                  full_time_base: derived.context.salarioBaseMes,
                  part_time_coef: partTimeCoefficient,
                  bonus_mode: derived.bonusMode,
                  seniority: {
                    period_years: derived.context.seniority?.periodYears ?? null,
                    percent_per_period: derived.context.seniority?.percent ?? null,
                    years_of_service: derived.yearsOfService,
                    periods_completed: derived.seniorityPeriods,
                    percent_applied: derived.seniorityPercent,
                  },
                  extra_pays_year: derived.context.extraPays,
                  number_of_bonuses: derived.numberOfBonuses,
                  extra_pays_this_month: derived.extraPayNames,
                  monthly_prorated_bonuses: derived.monthlyProratedBonuses,
                  integral_bonus_this_month: derived.integralBonusThisMonth,
                }
              : null,
          },
          dni: emp.dni,
          // document_name se define tras la inserción con la ruta real del PDF en Storage
        }

        const { data: savedNomina, error: saveError } = await supabase
          .from('nominas')
          .insert(nominaRecord)
          .select('id')
          .single()

        if (saveError) {
          throw new Error(`Error guardando nómina: ${saveError.message}`)
        }

        // Generate PDF payslip
        try {
          // Extraer código IBAN en "entidad + cuenta" estilo español (BBBB CCCC DD NNNNNNNNNN)
          const rawIban = (emp.iban || '').replace(/\s+/g, '')
          const bankEntity = rawIban.length >= 8 ? rawIban.slice(4, 8) : ''
          const bankAccount = rawIban.length >= 24 ? rawIban.slice(10) : rawIban

          // Prepare data for PDF generator
          const pdfData: PayslipPDFData = {
            company: {
              name: resolvedCompany.name,
              cif: resolvedCompany.cif,
              ccc: resolvedCompany.ccc,
              address: resolvedCompany.address,
            },
            employee: {
              name: emp.employeeName,
              nif: emp.dni,
              nss: emp.ssNumber,
              category: activeContract?.professional_category
                ?? derived?.context.province
                ?? 'Empleado',
              cotizationGroup: emp.cotizationGroup,
              startDate: activeContract?.start_date ?? undefined,
              address: undefined, // no tenemos domicilio del empleado en el POST
              job: activeContract?.professional_category ?? undefined,
              cnoCode: activeContract?.occupation_code ?? undefined,
            },
            periodStart,
            periodEnd,
            workedDays: vars.workedDays ?? calendarDays,
            totalDays: calendarDays,
            salaryAccruals: perceptions.map((p, idx) => ({
              code: String(idx + 1).padStart(3, '0'),
              concept: p.concept,
              amount: p.amount,
            })),
            nonSalaryAccruals: [],
            deductions: deductions.map((d, idx) => ({
              code: String(idx + 1).padStart(3, '0'),
              concept: d.concept,
              base: d.rate ? (d.amount / (d.rate / 100)) : 0,
              rate: d.rate || 0,
              amount: d.amount,
            })),
            companyContributions: contributions.map(c => ({
              concept: c.concept,
              base: c.base || 0,
              rate: c.rate || 0,
              amount: c.amount,
            })),
            totalAccruals: payslipResult.accruals.totalAccruals,
            totalDeductions: payslipResult.workerDeductions.totalDeductions,
            netPay: payslipResult.netSalary,
            baseCC: payslipResult.bases.baseCC,
            baseCP: payslipResult.bases.baseCP,
            baseIRPF: payslipResult.accruals.totalAccruals,
            irpfRate: emp.irpfPercentage,
            // Desglose de la base CC para la sección "Determinación bases"
            remuneracionMensualCC:
              payslipResult.bases.baseCC - (effectiveProratedForCC + monthlyBonusAccrual),
            prorrataPagasCC: effectiveProratedForCC + monthlyBonusAccrual,
            iban: rawIban,
            bankEntity,
            bankAccount,
            issueDate: new Date().toISOString().split('T')[0],
            issuePlace: (resolvedCompany.address || '').split(',').slice(-1)[0]?.trim() || undefined,
          }

          // Generate PDF
          const pdfBytes = await generatePayslipPDF(pdfData)

          // Upload to Supabase Storage — bucket unificado 'Nominas' (coherente
          // con app/page.tsx y api/upload). La ruta del objeto coincide con
          // document_name para que createSignedUrl(document_name) funcione.
          const safeName = emp.employeeName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
          const pdfObjectPath = `${companyId}/${year}/${String(month).padStart(2, '0')}/Nomina_${safeName}_${String(month).padStart(2, '0')}_${year}_${savedNomina.id}.pdf`

          const { error: uploadError } = await supabase.storage
            .from('Nominas')
            .upload(pdfObjectPath, pdfBytes, {
              contentType: 'application/pdf',
              upsert: true,
            })

          if (uploadError) {
            console.error('Error uploading PDF:', uploadError)
          } else {
            // La tabla `nominas` guarda únicamente `document_name` (ruta en Storage).
            // La URL firmada se genera on-demand en /api/download-pdfs y en la UI.
            const { error: docErr } = await supabase
              .from('nominas')
              .update({ document_name: pdfObjectPath })
              .eq('id', savedNomina.id)
            if (docErr) {
              console.error('Error updating nomina.document_name:', docErr)
            }
          }
        } catch (pdfError) {
          console.error('Error generating PDF:', pdfError)
          // Don't fail the entire process if PDF generation fails
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
