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
    console.log(`[NOMINAS_API] Total nóminas a procesar: ${nominas?.length || 0}`)
    const nominasConAvatar = await Promise.all(
      (nominas || []).map(async (nomina, index) => {
        const dni = nomina.dni || nomina.employee?.dni
        const companyId = nomina.company_id
        console.log(`[NOMINAS_API] Nómina ${index + 1}:`, {
          id: nomina.id,
          dni: dni,
          company_id: companyId,
          dniFromNomina: nomina.dni,
          dniFromEmployee: nomina.employee?.dni,
          employeeName: nomina.employee?.name
        })
        
        if (dni && companyId) {
          // Limpiar DNI: quitar espacios y convertir a mayúsculas
          const dniLimpio = dni.trim().toUpperCase()
          console.log(`[NOMINAS_API] 🔍 Buscando avatar para DNI: "${dni}" -> "${dniLimpio}" en company_id: "${companyId}"`)
          
          // Buscar empleado por nif (DNI) Y company_id para evitar duplicados
          const { data: employee, error } = await supabase
            .from('employees')
            .select('nif, image_url, company_id')
            .eq('nif', dniLimpio)
            .eq('company_id', companyId)
            .maybeSingle()
          
          console.log(`[NOMINAS_API] Resultado búsqueda empleado:`, {
            dniOriginal: dni,
            dniLimpio: dniLimpio,
            companyId: companyId,
            encontrado: !!employee,
            employeeNif: employee?.nif,
            employeeCompanyId: employee?.company_id,
            imageUrl: employee?.image_url,
            error: error?.message,
            errorCode: error?.code,
            errorDetails: error
          })
          
          // Si no se encuentra, intentar buscar todos los empleados con ese DNI para debug
          if (!employee && !error) {
            const { data: allEmployees } = await supabase
              .from('employees')
              .select('nif, image_url, company_id')
              .eq('nif', dniLimpio)
            console.log(`[NOMINAS_API] 🔍 Búsqueda alternativa (sin company_id):`, allEmployees)
          }
          
          if (error) {
            console.error(`[NOMINAS_API] ❌ Error buscando empleado:`, error)
          } else if (employee) {
            console.log(`[NOMINAS_API] ✅ Empleado encontrado:`, {
              nif: employee.nif,
              image_url: employee.image_url,
              tieneAvatar: !!employee.image_url
            })
          } else {
            console.warn(`[NOMINAS_API] ⚠️ No se encontró empleado con nif: "${dniLimpio}"`)
          }
          
          const avatarUrl = employee?.image_url || null
          console.log(`[NOMINAS_API] Avatar URL asignado:`, avatarUrl)
          
          return {
            ...nomina,
            employee_avatar: avatarUrl
          }
        } else {
          if (!dni) {
            console.warn(`[NOMINAS_API] ⚠️ Nómina ${index + 1} sin DNI disponible`)
          }
          if (!companyId) {
            console.warn(`[NOMINAS_API] ⚠️ Nómina ${index + 1} sin company_id disponible`)
          }
          return { ...nomina, employee_avatar: null }
        }
      })
    )
    
    console.log(`[NOMINAS_API] Nóminas con avatar procesadas:`, nominasConAvatar.map(n => ({
      id: n.id,
      dni: n.dni || n.employee?.dni,
      tieneAvatar: !!n.employee_avatar,
      avatarUrl: n.employee_avatar
    })))

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