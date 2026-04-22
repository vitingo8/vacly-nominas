/**
 * POST /api/conceptos/seed-from-agreement
 *
 * Puebla `salary_concepts` de una empresa con los conceptos base + los pluses
 * reales extraídos del convenio colectivo asignado. Reemplaza el flujo antiguo
 * donde la empresa arrancaba sin conceptos o con datos mock.
 *
 * Body: { companyId: string }
 *   - companyId: empresa destino (derivada del JWT en producción).
 *
 * Flujo:
 *   1. Resolver agreement_id vía fn_agreement_for_company(company_id, today).
 *   2. Llamar a public.fn_seed_salary_concepts_from_agreement(company_id, agreement_id).
 *   3. Devolver el catálogo resultante (antes/después) para auditoría.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json().catch(() => ({}))
    const companyId = body?.companyId as string | undefined

    if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) {
      return NextResponse.json(
        { success: false, error: 'companyId (UUID) requerido' },
        { status: 400 },
      )
    }

    const today = new Date().toISOString().slice(0, 10)

    const { data: lookupRows, error: luErr } = await supabase.rpc('fn_agreement_for_company', {
      p_company_id: companyId,
      p_on_date: today,
    })
    if (luErr) {
      console.error('[seed-from-agreement] fn_agreement_for_company error:', luErr)
      return NextResponse.json(
        { success: false, error: 'No se pudo resolver el convenio de la empresa.' },
        { status: 500 },
      )
    }
    if (!lookupRows || lookupRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'La empresa no tiene convenio asignado.' },
        { status: 404 },
      )
    }
    const lookup = lookupRows[0]
    if (!lookup.in_force) {
      return NextResponse.json(
        {
          success: false,
          error: `Convenio fuera de vigencia (${lookup.effective_from} → ${lookup.effective_to}).`,
          detail: lookup,
        },
        { status: 409 },
      )
    }

    const { data: seedRows, error: seedErr } = await supabase.rpc(
      'fn_seed_salary_concepts_from_agreement',
      { p_company_id: companyId, p_agreement_id: lookup.agreement_id },
    )
    if (seedErr) {
      console.error('[seed-from-agreement] fn_seed_salary_concepts_from_agreement error:', seedErr)
      return NextResponse.json(
        {
          success: false,
          error: 'No se pudieron sembrar los conceptos salariales.',
          detail: seedErr.message,
        },
        { status: 500 },
      )
    }

    const { data: concepts } = await supabase
      .from('salary_concepts')
      .select('id, code, name, type, cotizes_ss, tributes_irpf, agreement_id, active')
      .eq('company_id', companyId)
      .order('code', { ascending: true })

    return NextResponse.json({
      success: true,
      agreementId: lookup.agreement_id,
      seededCount: (seedRows as any[] | null)?.length ?? 0,
      concepts,
    })
  } catch (error) {
    console.error('[seed-from-agreement] ❌ Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 },
    )
  }
}
