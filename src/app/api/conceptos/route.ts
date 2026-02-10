/**
 * API de Conceptos Salariales - CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

// GET - Obtener conceptos salariales por company_id
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    const type = searchParams.get('type')
    const active = searchParams.get('active')
    const search = searchParams.get('search')

    if (!companyId) {
      return NextResponse.json({
        success: false,
        error: 'company_id es requerido'
      }, { status: 400 })
    }

    let query = supabase
      .from('salary_concepts')
      .select('*')
      .eq('company_id', companyId)

    // Filtro por tipo
    if (type) {
      query = query.eq('type', type)
    }

    // Filtro por estado activo
    if (active !== null && active !== undefined && active !== '') {
      query = query.eq('active', active === 'true')
    }

    // Búsqueda por nombre o código
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    const { data: concepts, error } = await query.order('code', { ascending: true })

    if (error) {
      console.error('[API CONCEPTOS] Error Supabase:', error)
      return NextResponse.json({
        success: false,
        error: 'Error al obtener conceptos salariales',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      concepts: concepts || [],
      total: (concepts || []).length
    })

  } catch (error) {
    console.error('[API CONCEPTOS] ERROR en GET:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al obtener conceptos salariales',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}

// POST - Crear concepto salarial
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const {
      company_id,
      code,
      name,
      description,
      type,
      cotizes_ss,
      tributes_irpf,
      calculation_formula,
      agreement_id,
      active,
      educational_tooltip
    } = body

    if (!company_id || !code || !name || !type) {
      return NextResponse.json({
        success: false,
        error: 'company_id, code, name y type son requeridos'
      }, { status: 400 })
    }

    if (!['salary', 'non_salary'].includes(type)) {
      return NextResponse.json({
        success: false,
        error: 'type debe ser "salary" o "non_salary"'
      }, { status: 400 })
    }

    const conceptData = {
      company_id,
      code,
      name,
      description: description || null,
      type,
      cotizes_ss: cotizes_ss !== undefined ? cotizes_ss : true,
      tributes_irpf: tributes_irpf !== undefined ? tributes_irpf : true,
      calculation_formula: calculation_formula || null,
      agreement_id: agreement_id || null,
      active: active !== undefined ? active : true,
      educational_tooltip: educational_tooltip || null
    }

    const { data, error } = await supabase
      .from('salary_concepts')
      .insert([conceptData])
      .select()

    if (error) {
      console.error('[API CONCEPTOS] Error Supabase insert:', error)
      return NextResponse.json({
        success: false,
        error: 'Error al crear concepto salarial',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      concept: data?.[0] || null,
      message: 'Concepto salarial creado exitosamente'
    })

  } catch (error) {
    console.error('[API CONCEPTOS] ERROR en POST:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al crear concepto salarial',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}

// PUT - Actualizar concepto salarial
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const { id, company_id, ...updateFields } = body

    if (!id || !company_id) {
      return NextResponse.json({
        success: false,
        error: 'id y company_id son requeridos'
      }, { status: 400 })
    }

    // Verificar que el concepto pertenece a la company
    const { data: existing } = await supabase
      .from('salary_concepts')
      .select('id, company_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Concepto salarial no encontrado'
      }, { status: 404 })
    }

    if (existing.company_id !== company_id) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permiso para modificar este concepto'
      }, { status: 403 })
    }

    // Preparar datos de actualización
    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'code', 'name', 'description', 'type',
      'cotizes_ss', 'tributes_irpf', 'calculation_formula',
      'agreement_id', 'active', 'educational_tooltip'
    ]

    for (const field of allowedFields) {
      if (updateFields[field] !== undefined) {
        // Campos que pueden ser null si están vacíos
        if (['description', 'calculation_formula', 'agreement_id', 'educational_tooltip'].includes(field)) {
          updateData[field] = updateFields[field] || null
        } else {
          updateData[field] = updateFields[field]
        }
      }
    }

    // Validar type si se incluye
    if (updateData.type && !['salary', 'non_salary'].includes(updateData.type as string)) {
      return NextResponse.json({
        success: false,
        error: 'type debe ser "salary" o "non_salary"'
      }, { status: 400 })
    }

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('salary_concepts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', company_id)
      .select()

    if (error) {
      console.error('[API CONCEPTOS] Error Supabase update:', error)
      return NextResponse.json({
        success: false,
        error: 'Error al actualizar concepto salarial',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      concept: data?.[0] || null,
      message: 'Concepto salarial actualizado exitosamente'
    })

  } catch (error) {
    console.error('[API CONCEPTOS] ERROR en PUT:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al actualizar concepto salarial',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}

// DELETE - Eliminar concepto salarial
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const companyId = searchParams.get('company_id')

    if (!id || !companyId) {
      return NextResponse.json({
        success: false,
        error: 'id y company_id son requeridos'
      }, { status: 400 })
    }

    // Verificar que el concepto pertenece a la company
    const { data: existing } = await supabase
      .from('salary_concepts')
      .select('id, company_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Concepto salarial no encontrado'
      }, { status: 404 })
    }

    if (existing.company_id !== companyId) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permiso para eliminar este concepto'
      }, { status: 403 })
    }

    const { error } = await supabase
      .from('salary_concepts')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('[API CONCEPTOS] Error Supabase delete:', error)
      return NextResponse.json({
        success: false,
        error: 'Error al eliminar concepto salarial',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Concepto salarial eliminado exitosamente'
    })

  } catch (error) {
    console.error('[API CONCEPTOS] ERROR en DELETE:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al eliminar concepto salarial',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}
