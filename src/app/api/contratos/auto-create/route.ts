/**
 * POST /api/contratos/auto-create
 *
 * Crea un contrato "mínimo viable" para un empleado tomando todos los valores
 * por defecto del convenio colectivo asignado a la empresa (NO hay mocks: si
 * la empresa no tiene convenio asignado, devolvemos 409).
 *
 * Entradas:
 *   - companyId   (uuid, obligatorio)
 *   - employeeId  (uuid, obligatorio)
 *   - overrides?  ({ professional_category?, cotization_group?, start_date?,
 *                    work_center_address?, full_time?, workday_percentage?,
 *                    agreed_base_salary? })   – opcionales
 *
 * Salidas:
 *   - contract (objeto insertado, incluye agreement_ref_id y
 *     agreed_base_salary resuelto vía fn_resolve_salary_base)
 *   - agreement (resumen del convenio aplicado)
 *
 * Seguridad:
 *   - Service role client, pero se validan FKs contra company_id / employee_id
 *     para evitar IDs arbitrarios.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

interface AutoCreateBody {
  companyId: string
  employeeId: string
  overrides?: {
    professional_category?: string | null
    cotization_group?: number | null
    start_date?: string | null
    work_center_address?: string | null
    full_time?: boolean | null
    workday_percentage?: number | null
    agreed_base_salary?: number | null
    contract_type?: string | null
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = (await request.json()) as AutoCreateBody
    const { companyId, employeeId, overrides } = body

    if (!companyId || !employeeId) {
      return NextResponse.json(
        { success: false, error: 'companyId y employeeId son obligatorios' },
        { status: 400 },
      )
    }

    // Verifica que empleado pertenece a la empresa (RLS auxiliar)
    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, company_id, position, sede, address, entry_date, compensation')
      .eq('id', employeeId)
      .maybeSingle()

    if (empErr || !employee) {
      return NextResponse.json(
        { success: false, error: 'Empleado no encontrado' },
        { status: 404 },
      )
    }
    if (employee.company_id !== companyId) {
      return NextResponse.json(
        { success: false, error: 'El empleado no pertenece a la empresa indicada' },
        { status: 403 },
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    const startDate = overrides?.start_date ?? (employee as any).entry_date ?? today

    // 1. Resuelve convenio activo de la empresa
    const { data: agrRows, error: agrErr } = await (supabase as any).rpc(
      'fn_agreement_for_company',
      { p_company_id: companyId, p_on_date: startDate },
    )
    if (agrErr) {
      return NextResponse.json(
        { success: false, error: 'Error resolviendo convenio', details: agrErr.message },
        { status: 500 },
      )
    }
    const agreementRow = Array.isArray(agrRows) ? agrRows[0] : agrRows
    const agreementId: string | null = agreementRow?.agreement_id ?? null
    if (!agreementId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'La empresa no tiene ningún convenio colectivo asignado y vigente. ' +
            'Asigna uno en la pestaña de Convenios antes de auto-crear el contrato.',
        },
        { status: 409 },
      )
    }

    // 2. Trae defaults canónicos del convenio
    const { data: defRows, error: defErr } = await (supabase as any).rpc(
      'fn_agreement_defaults',
      { p_agreement_id: agreementId },
    )
    if (defErr) {
      return NextResponse.json(
        { success: false, error: 'Error obteniendo defaults del convenio', details: defErr.message },
        { status: 500 },
      )
    }
    const defaults = Array.isArray(defRows) ? defRows[0] : defRows

    const comp: any = (employee as any).compensation || {}

    const professionalCategory =
      overrides?.professional_category
      ?? (employee as any).position
      ?? defaults?.default_professional_category
      ?? null
    const cotizationGroup =
      overrides?.cotization_group
      ?? comp.cotizationGroup
      ?? defaults?.default_cotization_group
      ?? 7
    const province =
      defaults?.province
      ?? null
    const workCenter =
      overrides?.work_center_address
      ?? (employee as any).sede
      ?? (employee as any).address
      ?? (province ? `${province}` : null)
    const weeklyHours = Number(defaults?.weekly_hours ?? 40)
    const trialMonths = Number(defaults?.trial_period_months ?? 2)
    const vacationDays = Number(defaults?.vacation_days_per_year ?? 30)
    const fullTime = overrides?.full_time ?? true
    const workdayPct = overrides?.workday_percentage ?? 100
    const contractType = overrides?.contract_type ?? 'permanent'

    // 3. Resuelve salario base vía fn_resolve_salary_base (canonical tables).
    //    Si el caller pasa override explícito, lo respetamos.
    let agreedBase = overrides?.agreed_base_salary ?? null
    if (agreedBase == null) {
      const { data: baseVal } = await (supabase as any).rpc('fn_resolve_salary_base', {
        p_agreement_id: agreementId,
        p_province: province,
        p_year: new Date(startDate).getFullYear(),
        p_grupo: `Grupo ${cotizationGroup}`,
        p_nivel: null,
        p_categoria: professionalCategory,
      })
      agreedBase = Number(baseVal ?? 0) || 0
    }

    // 4. Insertar contrato
    const contractRecord: any = {
      employee_id: employeeId,
      company_id: companyId,
      contract_type: contractType,
      start_date: startDate,
      end_date: null,
      cotization_group: cotizationGroup,
      professional_category: professionalCategory,
      occupation_code: null,
      agreement_id: null,              // legacy text (se queda null)
      agreement_ref_id: agreementId,   // canónico
      full_time: fullTime,
      workday_percentage: fullTime ? 100 : workdayPct,
      weekly_hours: fullTime ? weeklyHours : (weeklyHours * workdayPct) / 100,
      shift_type: null,
      agreed_base_salary: agreedBase,
      status: 'active',
      trial_period_months: trialMonths,
      vacation_days_per_year: vacationDays,
      work_center_address: workCenter,
      job_description: null,
      notes: 'Contrato creado automáticamente a partir del convenio colectivo',
    }

    const { data: newContract, error: insErr } = await supabase
      .from('contracts')
      .insert(contractRecord)
      .select('*')
      .single()

    if (insErr) {
      return NextResponse.json(
        { success: false, error: 'Error insertando contrato', details: insErr.message },
        { status: 500 },
      )
    }

    // 5. Sincronizar current_contract_id en employees (si no había uno).
    await supabase
      .from('employees')
      .update({ current_contract_id: newContract.id })
      .eq('id', employeeId)

    return NextResponse.json({
      success: true,
      contract: newContract,
      agreement: {
        id: agreementId,
        defaults,
      },
    })
  } catch (error) {
    console.error('POST /api/contratos/auto-create error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    )
  }
}
