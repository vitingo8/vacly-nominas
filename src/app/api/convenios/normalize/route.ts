/**
 * POST /api/convenios/normalize
 * Re-materializa las tablas canónicas (agreement_salary_tables, agreement_pluses,
 * agreement_extra_pays, agreement_scalar_inputs, agreement_groups) desde las
 * extracciones crudas v3_rrhh_* para el convenio indicado. Las filas con
 * source_kind = 'manual' u 'override' se preservan; solo se refrescan las
 * 'extracted'.
 *
 * Body: { agreement_id?: uuid, company_id?: uuid }
 *  - si se envía agreement_id → refresca ese convenio.
 *  - si se envía company_id    → resuelve el convenio activo de la empresa
 *    vía fn_agreement_for_company y refresca ese.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json().catch(() => ({}))
    let { agreement_id, company_id } = body as {
      agreement_id?: string
      company_id?: string
    }

    if (!agreement_id && !company_id) {
      return NextResponse.json(
        { success: false, error: 'Debe indicarse agreement_id o company_id' },
        { status: 400 },
      )
    }

    if (!agreement_id && company_id) {
      const { data: resolved, error: resolveErr } = await supabase.rpc(
        'fn_agreement_for_company',
        {
          p_company_id: company_id,
          p_on_date: new Date().toISOString().slice(0, 10),
        },
      )
      if (resolveErr) {
        console.error('[API normalize] resolver error:', resolveErr)
        return NextResponse.json(
          {
            success: false,
            error: 'No se pudo resolver el convenio activo para la empresa',
            details: resolveErr.message,
          },
          { status: 500 },
        )
      }
      const row = Array.isArray(resolved) ? resolved[0] : resolved
      agreement_id = row?.agreement_id || row?.id
      if (!agreement_id) {
        return NextResponse.json(
          {
            success: false,
            error: 'La empresa no tiene convenio asignado o está fuera de vigencia',
          },
          { status: 404 },
        )
      }
    }

    const { data, error } = await supabase.rpc('fn_normalize_agreement', {
      p_agreement_id: agreement_id,
    })
    if (error) {
      console.error('[API normalize] normalize error:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Error al normalizar tablas canónicas',
          details: error.message,
        },
        { status: 500 },
      )
    }

    const report = (data || []) as Array<{ target: string; inserted: number }>
    const totalInserted = report.reduce((acc, r) => acc + (r.inserted || 0), 0)

    return NextResponse.json({
      success: true,
      agreement_id,
      totalInserted,
      report,
    })
  } catch (err) {
    console.error('[API normalize] ERROR POST:', err)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al normalizar',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
