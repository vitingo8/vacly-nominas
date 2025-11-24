/**
 * API para obtener avatar de empleado
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [API EMPLOYEE AVATAR] 📥 GET - Nueva petición`)
  
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employee_id')

    console.log(`[${timestamp}] [API EMPLOYEE AVATAR] 📋 Employee ID:`, employeeId)

    if (!employeeId) {
      console.error(`[${timestamp}] [API EMPLOYEE AVATAR] ❌ employee_id no proporcionado`)
      return NextResponse.json({ 
        success: false,
        error: 'employee_id es requerido'
      }, { status: 400 })
    }

    console.log(`[${timestamp}] [API EMPLOYEE AVATAR] 🔍 Buscando empleado...`)
    const { data: employee, error } = await supabase
      .from('employees')
      .select('id, image_url')
      .eq('id', employeeId)
      .maybeSingle()

    if (error) {
      console.error(`[${timestamp}] [API EMPLOYEE AVATAR] ❌ Error Supabase:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json({ 
        success: false,
        error: 'Failed to fetch employee',
        details: error.message
      }, { status: 500 })
    }

    if (!employee) {
      console.log(`[${timestamp}] [API EMPLOYEE AVATAR] ⚠️ Empleado no encontrado`)
      return NextResponse.json({
        success: true,
        avatar_url: null,
        message: 'Employee not found'
      })
    }

    console.log(`[${timestamp}] [API EMPLOYEE AVATAR] ✅ Avatar encontrado:`, {
      hasAvatar: !!employee.image_url
    })

    return NextResponse.json({
      success: true,
      avatar_url: employee.image_url || null
    })

  } catch (error) {
    const errorTimestamp = new Date().toISOString()
    console.error(`[${errorTimestamp}] [API EMPLOYEE AVATAR] ❌ ERROR:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch employee avatar',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

