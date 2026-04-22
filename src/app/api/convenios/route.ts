/**
 * API de Convenios - Catálogo de convenios colectivos disponibles.
 *
 * Devuelve los convenios asignados a la empresa (vía `company_agreement_assignments`)
 * y, opcionalmente, todos los convenios del catálogo global (`agreement_registry`).
 *
 * Este endpoint alimenta el selector de "Convenio Colectivo" en la creación/edición
 * de contratos, de forma que `contracts.agreement_ref_id` apunte siempre a un registro
 * real del catálogo y no a un string arbitrario.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

type AgreementRow = {
  id: string
  code: string | null
  name: string
  provinces: string[] | null
  effective_from: string | null
  effective_to: string | null
  status: string | null
  ultraactive: boolean | null
  requires_review: boolean | null
  assigned: boolean
  priority: number | null
  default_province: string | null
  assignment_effective_from: string | null
  assignment_effective_to: string | null
}

/**
 * POST — Asigna un convenio a una empresa (idempotente).
 * Body: { company_id: uuid, agreement_id: uuid, priority?: int, default_province?: string,
 *         effective_from?: date, effective_to?: date }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const {
      company_id,
      agreement_id,
      priority,
      default_province,
      effective_from,
      effective_to,
    } = body || {}

    if (!company_id || !agreement_id) {
      return NextResponse.json(
        { success: false, error: 'company_id y agreement_id son requeridos' },
        { status: 400 },
      )
    }

    const { data: reg, error: regErr } = await supabase
      .from('agreement_registry')
      .select('id')
      .eq('id', agreement_id)
      .single()
    if (regErr || !reg) {
      return NextResponse.json(
        { success: false, error: 'El convenio indicado no existe en el catálogo' },
        { status: 404 },
      )
    }

    const { data: existing } = await supabase
      .from('company_agreement_assignments')
      .select('id')
      .eq('company_id', company_id)
      .eq('agreement_id', agreement_id)
      .maybeSingle()

    const payload: Record<string, unknown> = {
      company_id,
      agreement_id,
      priority: typeof priority === 'number' ? priority : 10,
      default_province: default_province || null,
      effective_from: effective_from || null,
      effective_to: effective_to || null,
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { error } = await supabase
        .from('company_agreement_assignments')
        .update(payload)
        .eq('id', existing.id)
      if (error) {
        console.error('[API CONVENIOS] update assignment error:', error)
        return NextResponse.json(
          { success: false, error: 'No se pudo actualizar la asignación', details: error.message },
          { status: 500 },
        )
      }
      return NextResponse.json({ success: true, assignment_id: existing.id, updated: true })
    }

    const { data: inserted, error } = await supabase
      .from('company_agreement_assignments')
      .insert([payload])
      .select('id')
      .single()
    if (error) {
      console.error('[API CONVENIOS] insert assignment error:', error)
      return NextResponse.json(
        { success: false, error: 'No se pudo crear la asignación', details: error.message },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true, assignment_id: inserted?.id, created: true })
  } catch (err) {
    console.error('[API CONVENIOS] ERROR POST:', err)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al asignar convenio',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}

/**
 * DELETE — Elimina la asignación (?company_id=&agreement_id=).
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    const agreementId = searchParams.get('agreement_id')
    if (!companyId || !agreementId) {
      return NextResponse.json(
        { success: false, error: 'company_id y agreement_id son requeridos' },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('company_agreement_assignments')
      .delete()
      .eq('company_id', companyId)
      .eq('agreement_id', agreementId)

    if (error) {
      console.error('[API CONVENIOS] delete assignment error:', error)
      return NextResponse.json(
        { success: false, error: 'No se pudo eliminar la asignación', details: error.message },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API CONVENIOS] ERROR DELETE:', err)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al eliminar asignación',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    const includeAll = searchParams.get('include_all') === 'true'

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'company_id es requerido' },
        { status: 400 },
      )
    }

    const { data: assignments, error: assignErr } = await supabase
      .from('company_agreement_assignments')
      .select(
        `
        agreement_id,
        default_province,
        priority,
        effective_from,
        effective_to,
        agreement_registry:agreement_registry!company_agreement_assignments_agreement_id_fkey (
          id, code, name, provinces, effective_from, effective_to,
          status, ultraactive, requires_review
        )
      `,
      )
      .eq('company_id', companyId)
      .order('priority', { ascending: false })

    if (assignErr) {
      console.error('[API CONVENIOS] assignments error:', assignErr)
    }

    const assigned: AgreementRow[] = (assignments || [])
      .map((a: any) => {
        const reg = a.agreement_registry
        if (!reg) return null
        return {
          id: reg.id,
          code: reg.code,
          name: reg.name,
          provinces: reg.provinces,
          effective_from: reg.effective_from,
          effective_to: reg.effective_to,
          status: reg.status,
          ultraactive: reg.ultraactive,
          requires_review: reg.requires_review,
          assigned: true,
          priority: a.priority,
          default_province: a.default_province,
          assignment_effective_from: a.effective_from,
          assignment_effective_to: a.effective_to,
        } as AgreementRow
      })
      .filter((x: AgreementRow | null): x is AgreementRow => Boolean(x))

    const assignedIds = new Set(assigned.map((a) => a.id))

    let catalog: AgreementRow[] = []
    if (includeAll) {
      const { data: all, error: allErr } = await supabase
        .from('agreement_registry')
        .select(
          'id, code, name, provinces, effective_from, effective_to, status, ultraactive, requires_review',
        )
        .order('name', { ascending: true })

      if (allErr) {
        console.error('[API CONVENIOS] registry error:', allErr)
      } else {
        catalog = (all || [])
          .filter((r: any) => !assignedIds.has(r.id))
          .map(
            (r: any): AgreementRow => ({
              id: r.id,
              code: r.code,
              name: r.name,
              provinces: r.provinces,
              effective_from: r.effective_from,
              effective_to: r.effective_to,
              status: r.status,
              ultraactive: r.ultraactive,
              requires_review: r.requires_review,
              assigned: false,
              priority: null,
              default_province: null,
              assignment_effective_from: null,
              assignment_effective_to: null,
            }),
          )
      }
    }

    return NextResponse.json({
      success: true,
      assigned,
      catalog,
      total: assigned.length + catalog.length,
    })
  } catch (err) {
    console.error('[API CONVENIOS] ERROR GET:', err)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al listar convenios',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
