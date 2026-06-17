import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import {
  applyNominaListFilters,
  applyNominaListSort,
  parseNominaEstadoFilter,
  parseNominaSortColumn,
  parseNominaSortDir,
} from '@/lib/nomina-list-query'

async function enrichWithAvatars(
  supabase: ReturnType<typeof getSupabaseClient>,
  nominas: Array<Record<string, unknown>>,
) {
  return Promise.all(
    nominas.map(async (nomina) => {
      const employee = nomina.employee as { dni?: string } | null | undefined
      const dni = (nomina.dni as string) || employee?.dni
      const companyId = nomina.company_id as string

      if (!dni || !companyId) {
        return { ...nomina, employee_avatar: null }
      }

      const dniLimpio = dni.trim().toUpperCase()
      const { data: employeeRow } = await supabase
        .from('employees')
        .select('image_url')
        .eq('nif', dniLimpio)
        .eq('company_id', companyId)
        .maybeSingle()

      return {
        ...nomina,
        employee_avatar: employeeRow?.image_url || null,
      }
    }),
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '25', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const companyId = searchParams.get('company_id')

    if (!companyId) {
      return NextResponse.json({
        error: 'company_id es requerido',
        success: false,
      }, { status: 400 })
    }

    const periods = (searchParams.get('periods') || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => /^\d{4}-\d{2}$/.test(p))

    const filters = {
      employeeId: searchParams.get('employee_id'),
      dni: searchParams.get('dni'),
      search: searchParams.get('search'),
      periods,
      dateFrom: searchParams.get('date_from'),
      dateTo: searchParams.get('date_to'),
      employeeName: searchParams.get('col_employee'),
      companyName: searchParams.get('col_company'),
      estado: parseNominaEstadoFilter(searchParams.get('col_estado')),
    }

    const sortBy = parseNominaSortColumn(searchParams.get('sort_by'))
    const sortDir = parseNominaSortDir(searchParams.get('sort_dir'))

    let query = supabase
      .from('nominas')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)

    query = applyNominaListFilters(query, filters)
    query = applyNominaListSort(query, sortBy, sortDir)

    const { data: nominas, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      console.error('Supabase fetch error:', error)
      return NextResponse.json({
        error: 'Failed to fetch nominas',
        details: error.message,
      }, { status: 500 })
    }

    const nominasConAvatar = await enrichWithAvatars(supabase, nominas || [])

    return NextResponse.json({
      success: true,
      data: nominasConAvatar,
      total: count,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Fetch error:', error)
    return NextResponse.json({
      error: 'Failed to fetch nominas',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('nominas')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Supabase delete error:', error)
      return NextResponse.json({
        error: 'Failed to delete nomina',
        details: error.message,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Nomina deleted successfully',
    })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({
      error: 'Failed to delete nomina',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
