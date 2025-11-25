/**
 * API de Gastos - CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

// GET - Obtener gastos
export async function GET(request: NextRequest) {
  const timestamp = new Date().toISOString()
    
    try {
      const supabase = getSupabaseClient()
      const { searchParams } = new URL(request.url)
      const limit = searchParams.get('limit') || '20'
      const offset = searchParams.get('offset') || '0'
      const companyId = searchParams.get('company_id')
      const employeeId = searchParams.get('employee_id')
      const department = searchParams.get('department')
      const year = searchParams.get('year')
      const month = searchParams.get('month')

    if (!companyId) {
      console.error(`[${timestamp}] [API EXPENSES] ❌ company_id no proporcionado`)
      return NextResponse.json({ 
        success: false,
        error: 'company_id es requerido'
      }, { status: 400 })
    }

    let query = supabase
      .from('expenses')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
    
    // Aplicar filtros
    if (employeeId) {
      query = query.eq('employee_id', employeeId)
    }
    
    if (department) {
      // Buscar empleados del departamento y filtrar por sus IDs
      const { data: employeesInDept } = await supabase
        .from('employees')
        .select('id')
        .eq('company_id', companyId)
        .eq('department', department)
      
      if (employeesInDept && employeesInDept.length > 0) {
        const employeeIds = employeesInDept.map(emp => emp.id)
        query = query.in('employee_id', employeeIds)
      } else {
        // Si no hay empleados en el departamento, devolver vacío
        query = query.eq('employee_id', '00000000-0000-0000-0000-000000000000') // UUID imposible
      }
    }
    
    if (year && month) {
      const startDate = `${year}-${month.padStart(2, '0')}-01`
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]
      query = query.gte('expense_date', startDate).lte('expense_date', endDate)
    }
    
    const { data: expenses, error, count } = await query
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (error) {
      console.error(`[${timestamp}] [API EXPENSES] ❌ Error Supabase:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json({ 
        success: false,
        error: 'Failed to fetch expenses',
        details: error.message
      }, { status: 500 })
    }


    // Calcular estadísticas
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    const allExpenses = expenses || []
    const totalGastos = allExpenses.reduce((sum, exp) => sum + parseFloat(String(exp.amount || 0)), 0)
    
    const gastosEsteMes = allExpenses.filter(exp => {
      if (!exp.expense_date) return false
      const expDate = new Date(exp.expense_date)
      return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear
    })
    const totalEsteMes = gastosEsteMes.reduce((sum, exp) => sum + parseFloat(String(exp.amount || 0)), 0)

    // Obtener todos los avatares de empleados de una vez (evitar N+1 queries)
    const employeeIds = [...new Set(allExpenses.map((exp: any) => exp.employee_id).filter(Boolean))]
    const avatarsMap = new Map<string, string | null>()
    
    if (employeeIds.length > 0) {
      const { data: employees } = await supabase
        .from('employees')
        .select('id, image_url')
        .eq('company_id', companyId)
        .in('id', employeeIds)
      
      if (employees) {
        employees.forEach((emp: any) => {
          avatarsMap.set(emp.id, emp.image_url || null)
        })
      }
    }

    // Transformar gastos para compatibilidad con el frontend
    const transformedExpenses = allExpenses.map((exp: any) => {
      // Intentar parsear description si es JSON
      let parsedDesc: any = {}
      try {
        if (exp.description && exp.description.startsWith('{')) {
          parsedDesc = JSON.parse(exp.description)
        } else {
          parsedDesc = { text: exp.description }
        }
      } catch {
        parsedDesc = { text: exp.description }
      }

      return {
        ...exp,
        // Campos compatibles con el frontend
        date: exp.expense_date,
        concept: parsedDesc.text || exp.description || '',
        category: parsedDesc.category || 'Gasto',
        subcategory: parsedDesc.subcategory || 'Otro',
        method: parsedDesc.method || 'Efectivo',
        notes: parsedDesc.notes || null,
        image: exp.receipt_url || null,
        conceptos: exp.conceptos || null,
        employee_avatar: exp.employee_id ? (avatarsMap.get(exp.employee_id) || null) : null
      }
    })

    // Obtener meses únicos con gastos para el filtro (optimizado: solo si hay gastos)
    let availableMonths: string[] = []
    if (count && count > 0) {
      const { data: allExpensesForMonths } = await supabase
        .from('expenses')
        .select('expense_date')
        .eq('company_id', companyId)
        .not('expense_date', 'is', null)
      
      const uniqueMonths = new Set<string>()
      if (allExpensesForMonths) {
        allExpensesForMonths.forEach((exp: any) => {
          if (exp.expense_date) {
            const date = new Date(exp.expense_date)
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            uniqueMonths.add(`${year}-${month}`)
          }
        })
      }
      
      availableMonths = Array.from(uniqueMonths).sort((a, b) => {
        return b.localeCompare(a)
      })
    }

    return NextResponse.json({
      success: true,
      expenses: transformedExpenses,
      total: count,
      stats: {
        totalGastos,
        gastosEsteMes: totalEsteMes,
        cantidadTotal: allExpenses.length,
        cantidadEsteMes: gastosEsteMes.length
      },
      availableMonths, // Nuevo campo con meses disponibles
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

  } catch (error) {
    const errorTimestamp = new Date().toISOString()
    console.error(`[${errorTimestamp}] [API EXPENSES] ❌ ERROR en GET:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch expenses',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST - Crear gasto
export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [API EXPENSES] 📥 POST - Nueva petición de creación`)
  
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    console.log(`[${timestamp}] [API EXPENSES] 📦 Body recibido:`, {
      company_id: body.company_id,
      date: body.date,
      concept: body.concept?.substring(0, 50),
      category: body.category,
      subcategory: body.subcategory,
      amount: body.amount,
      method: body.method,
      hasImage: !!body.image,
      hasNotes: !!body.notes,
      employee_id: body.employee_id,
      category_id: body.category_id
    })

    const { company_id, date, concept, category, subcategory, amount, method, image, notes, employee_id, category_id, conceptos } = body

    if (!company_id || !concept || amount === undefined) {
      console.error(`[${timestamp}] [API EXPENSES] ❌ Validación fallida:`, {
        hasCompanyId: !!company_id,
        hasConcept: !!concept,
        hasAmount: amount !== undefined
      })
      return NextResponse.json({ 
        success: false,
        error: 'company_id, concept y amount son requeridos'
      }, { status: 400 })
    }

    // La tabla expenses usa expense_date, description, receipt_url
    // Y no tiene campos category, subcategory, method, notes directamente
    // Guardamos datos adicionales en description o en un campo JSON si existe
    const expenseData: any = {
      company_id,
      expense_date: date || new Date().toISOString().split('T')[0],
      description: concept,
      amount: parseFloat(amount) || 0,
      receipt_url: image || null,
      status: 'pending',
      employee_id: employee_id || null,
      category_id: category_id || null,
      conceptos: conceptos ? (typeof conceptos === 'object' ? conceptos : null) : null
    }
    
    console.log(`[${timestamp}] [API EXPENSES] 📦 Conceptos a guardar:`, {
      hasConceptos: !!conceptos,
      isObject: typeof conceptos === 'object',
      itemsCount: conceptos && typeof conceptos === 'object' && !Array.isArray(conceptos) ? (conceptos.items?.length || 0) : 0,
      hasTaxes: conceptos && typeof conceptos === 'object' && !Array.isArray(conceptos) ? !!conceptos.taxes : false
    })

    // Si hay datos adicionales (subcategory, method, notes), los guardamos en description como JSON
    const extraData: any = { text: concept }
    if (subcategory) extraData.subcategory = subcategory
    if (method) extraData.method = method
    if (notes) extraData.notes = notes
    if (category) extraData.category = category
    
    // Guardar description como JSON con todos los datos
    expenseData.description = JSON.stringify(extraData)

    console.log(`[${timestamp}] [API EXPENSES] 💾 Datos a insertar:`, {
      company_id: expenseData.company_id,
      expense_date: expenseData.expense_date,
      description: expenseData.description.substring(0, 100),
      amount: expenseData.amount,
      receipt_url: expenseData.receipt_url ? 'presente' : 'null',
      status: expenseData.status,
      employee_id: expenseData.employee_id,
      category_id: expenseData.category_id,
      conceptos: expenseData.conceptos 
        ? (typeof expenseData.conceptos === 'object' && !Array.isArray(expenseData.conceptos)
          ? `${expenseData.conceptos.items?.length || 0} items, ${expenseData.conceptos.taxes ? 'con taxes' : 'sin taxes'}`
          : 'formato incorrecto')
        : 'null'
    })

    console.log(`[${timestamp}] [API EXPENSES] 🔍 Insertando en Supabase...`)
    const { data, error } = await supabase
      .from('expenses')
      .insert([expenseData])
      .select()

    if (error) {
      console.error(`[${timestamp}] [API EXPENSES] ❌ Error Supabase insert:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json({ 
        success: false,
        error: 'Failed to create expense',
        details: error.message
      }, { status: 500 })
    }

    console.log(`[${timestamp}] [API EXPENSES] ✅ Gasto insertado exitosamente:`, {
      id: data?.[0]?.id,
      expense_date: data?.[0]?.expense_date,
      amount: data?.[0]?.amount
    })

    // Transformar el gasto creado para compatibilidad con el frontend
    const createdExpense = data?.[0]
    if (createdExpense) {
      let parsedDesc: any = {}
      try {
        if (createdExpense.description && createdExpense.description.startsWith('{')) {
          parsedDesc = JSON.parse(createdExpense.description)
        } else {
          parsedDesc = { text: createdExpense.description }
        }
      } catch {
        parsedDesc = { text: createdExpense.description }
      }

      const transformedExpense = {
        ...createdExpense,
        date: createdExpense.expense_date,
        concept: parsedDesc.text || createdExpense.description || '',
        category: parsedDesc.category || 'Gasto',
        subcategory: parsedDesc.subcategory || 'Otro',
        method: parsedDesc.method || 'Efectivo',
        notes: parsedDesc.notes || null,
        image: createdExpense.receipt_url || null
      }

      return NextResponse.json({
        success: true,
        expense: transformedExpense,
        message: 'Gasto creado exitosamente'
      })
    }

    return NextResponse.json({
      success: true,
      expense: null,
      message: 'Gasto creado exitosamente'
    })

  } catch (error) {
    const errorTimestamp = new Date().toISOString()
    console.error(`[${errorTimestamp}] [API EXPENSES] ❌ ERROR en POST:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return NextResponse.json({ 
      success: false,
      error: 'Failed to create expense',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// DELETE - Eliminar gasto
export async function DELETE(request: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [API EXPENSES] 📥 DELETE - Nueva petición`)
  
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    console.log(`[${timestamp}] [API EXPENSES] 🗑️ Eliminando gasto con ID:`, id)

    if (!id) {
      console.error(`[${timestamp}] [API EXPENSES] ❌ ID no proporcionado`)
      return NextResponse.json({ 
        success: false,
        error: 'ID es requerido'
      }, { status: 400 })
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)

    if (error) {
      console.error(`[${timestamp}] [API EXPENSES] ❌ Error Supabase delete:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json({ 
        success: false,
        error: 'Failed to delete expense',
        details: error.message
      }, { status: 500 })
    }

    console.log(`[${timestamp}] [API EXPENSES] ✅ Gasto eliminado exitosamente`)
    return NextResponse.json({
      success: true,
      message: 'Gasto eliminado exitosamente'
    })

  } catch (error) {
    const errorTimestamp = new Date().toISOString()
    console.error(`[${errorTimestamp}] [API EXPENSES] ❌ ERROR en DELETE:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return NextResponse.json({ 
      success: false,
      error: 'Failed to delete expense',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

