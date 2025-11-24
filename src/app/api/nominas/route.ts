import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') || '10'
    const offset = searchParams.get('offset') || '0'

    const { data: nominas, error, count } = await supabase
      .from('nominas')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (error) {
      console.error('Supabase fetch error:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch nominas',
        details: error.message
      }, { status: 500 })
    }

    // Buscar avatares de empleados por DNI en employees.nif
    const nominasConAvatar = await Promise.all(
      (nominas || []).map(async (nomina) => {
        const dni = nomina.dni || nomina.employee?.dni
        if (dni) {
          // Buscar empleado por nif (DNI)
          const { data: employee } = await supabase
            .from('employees')
            .select('avatar_url, image_url')
            .eq('nif', dni)
            .single()
          
          // Usar avatar_url si existe, sino image_url como fallback
          const avatarUrl = employee?.avatar_url || employee?.image_url || null
          
          return {
            ...nomina,
            employee_avatar: avatarUrl
          }
        }
        return { ...nomina, employee_avatar: null }
      })
    )

    return NextResponse.json({
      success: true,
      data: nominasConAvatar,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

  } catch (error) {
    console.error('Fetch error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch nominas',
      details: error instanceof Error ? error.message : 'Unknown error'
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
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Nomina deleted successfully'
    })

  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ 
      error: 'Failed to delete nomina',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 