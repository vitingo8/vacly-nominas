/**
 * API de Contratos - CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

// GET - Obtener contratos con join a empleados
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    const employeeName = searchParams.get('employee_name')
    const contractType = searchParams.get('contract_type')
    const status = searchParams.get('status')
    const expiringDays = searchParams.get('expiring_days')

    if (!companyId) {
      return NextResponse.json({
        success: false,
        error: 'company_id es requerido'
      }, { status: 400 })
    }

    // Query contratos con join a empleados (FK explícito para evitar PGRST201)
    let query = supabase
      .from('contracts')
      .select(`
        *,
        employees!contracts_employee_id_fkey (
          id,
          first_name,
          last_name,
          nif,
          status
        )
      `)
      .eq('company_id', companyId)

    // Filtro por tipo de contrato
    if (contractType) {
      query = query.eq('contract_type', contractType)
    }

    // Filtro por estado
    if (status) {
      query = query.eq('status', status)
    }

    const { data: contracts, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[API CONTRATOS] Error Supabase:', error)
      // Devolver 200 con listas vacías para que la UI muestre estado vacío, no error
      return NextResponse.json({
        success: true,
        contracts: [],
        expiring: [],
        total: 0
      })
    }

    let filteredContracts = contracts || []

    // Filtro por nombre de empleado (client-side ya que es un join)
    if (employeeName) {
      const search = employeeName.toLowerCase()
      filteredContracts = filteredContracts.filter((c: any) => {
        const fullName = `${c.employees?.first_name || ''} ${c.employees?.last_name || ''}`.toLowerCase()
        return fullName.includes(search)
      })
    }

    // Contratos que expiran pronto
    let expiringContracts: any[] = []
    if (expiringDays) {
      const days = parseInt(expiringDays)
      const now = new Date()
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + days)

      expiringContracts = (contracts || []).filter((c: any) => {
        if (!c.end_date || c.status !== 'active') return false
        const endDate = new Date(c.end_date)
        return endDate >= now && endDate <= futureDate
      })
    }

    return NextResponse.json({
      success: true,
      contracts: filteredContracts,
      expiring: expiringContracts,
      total: filteredContracts.length
    })

  } catch (error) {
    console.error('[API CONTRATOS] ERROR en GET:', error)
    // Devolver 200 con listas vacías para que la página cargue (estado vacío)
    return NextResponse.json({
      success: true,
      contracts: [],
      expiring: [],
      total: 0
    })
  }
}

// POST - Crear contrato
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const {
      company_id,
      employee_id,
      contract_type,
      start_date,
      end_date,
      cotization_group,
      professional_category,
      occupation_code,
      agreement_id,
      full_time,
      workday_percentage,
      weekly_hours,
      shift_type,
      agreed_base_salary,
      status,
      signed_pdf_url,
      notes
    } = body

    if (!company_id || !employee_id || !contract_type || !start_date) {
      return NextResponse.json({
        success: false,
        error: 'company_id, employee_id, contract_type y start_date son requeridos'
      }, { status: 400 })
    }

    const contractData = {
      company_id,
      employee_id,
      contract_type,
      start_date,
      end_date: end_date || null,
      cotization_group: cotization_group ? parseInt(cotization_group) : null,
      professional_category: professional_category || null,
      occupation_code: occupation_code || null,
      agreement_id: agreement_id || null,
      full_time: full_time !== undefined ? full_time : true,
      workday_percentage: workday_percentage ? parseFloat(workday_percentage) : 100,
      weekly_hours: weekly_hours ? parseFloat(weekly_hours) : 40,
      shift_type: shift_type || 'continuous',
      agreed_base_salary: agreed_base_salary ? parseFloat(agreed_base_salary) : 0,
      status: status || 'active',
      signed_pdf_url: signed_pdf_url || null,
      notes: notes || null
    }

    const { data, error } = await supabase
      .from('contracts')
      .insert([contractData])
      .select(`
        *,
        employees (
          id,
          first_name,
          last_name,
          nif,
          status
        )
      `)

    if (error) {
      console.error('[API CONTRATOS] Error Supabase insert:', error)
      return NextResponse.json({
        success: false,
        error: 'Error al crear contrato',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      contract: data?.[0] || null,
      message: 'Contrato creado exitosamente'
    })

  } catch (error) {
    console.error('[API CONTRATOS] ERROR en POST:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al crear contrato',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}

// PUT - Actualizar contrato
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

    // Verificar que el contrato pertenece a la company
    const { data: existing } = await supabase
      .from('contracts')
      .select('id, company_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Contrato no encontrado'
      }, { status: 404 })
    }

    if (existing.company_id !== company_id) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permiso para modificar este contrato'
      }, { status: 403 })
    }

    // Preparar datos de actualización
    const updateData: any = {}
    const allowedFields = [
      'employee_id', 'contract_type', 'start_date', 'end_date',
      'cotization_group', 'professional_category', 'occupation_code',
      'agreement_id', 'full_time', 'workday_percentage', 'weekly_hours',
      'shift_type', 'agreed_base_salary', 'status', 'signed_pdf_url', 'notes'
    ]

    for (const field of allowedFields) {
      if (updateFields[field] !== undefined) {
        if (field === 'cotization_group' && updateFields[field]) {
          updateData[field] = parseInt(updateFields[field])
        } else if (['workday_percentage', 'weekly_hours', 'agreed_base_salary'].includes(field) && updateFields[field]) {
          updateData[field] = parseFloat(updateFields[field])
        } else if (field === 'end_date' && updateFields[field] === '') {
          updateData[field] = null
        } else {
          updateData[field] = updateFields[field]
        }
      }
    }

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('contracts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', company_id)
      .select(`
        *,
        employees (
          id,
          first_name,
          last_name,
          nif,
          status
        )
      `)

    if (error) {
      console.error('[API CONTRATOS] Error Supabase update:', error)
      return NextResponse.json({
        success: false,
        error: 'Error al actualizar contrato',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      contract: data?.[0] || null,
      message: 'Contrato actualizado exitosamente'
    })

  } catch (error) {
    console.error('[API CONTRATOS] ERROR en PUT:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al actualizar contrato',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}

// DELETE - Eliminar contrato
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

    // Verificar que el contrato pertenece a la company
    const { data: existing } = await supabase
      .from('contracts')
      .select('id, company_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Contrato no encontrado'
      }, { status: 404 })
    }

    if (existing.company_id !== companyId) {
      return NextResponse.json({
        success: false,
        error: 'No tienes permiso para eliminar este contrato'
      }, { status: 403 })
    }

    const { error } = await supabase
      .from('contracts')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('[API CONTRATOS] Error Supabase delete:', error)
      return NextResponse.json({
        success: false,
        error: 'Error al eliminar contrato',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Contrato eliminado exitosamente'
    })

  } catch (error) {
    console.error('[API CONTRATOS] ERROR en DELETE:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al eliminar contrato',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
}
