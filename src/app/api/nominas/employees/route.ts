import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

type EmployeeOption = { id: string; name: string; nif?: string }

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'company_id es requerido' }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    const { data: employees, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, nif')
      .eq('company_id', companyId)
      .order('first_name')
      .order('last_name')

    if (error) {
      console.error('[nominas/employees] Error:', error)
      return NextResponse.json({ success: false, error: 'Error al cargar empleados' }, { status: 500 })
    }

    const byId = new Map<string, EmployeeOption>()

    for (const emp of employees || []) {
      byId.set(emp.id, {
        id: emp.id,
        name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Sin nombre',
        nif: emp.nif || undefined,
      })
    }

    // Incluir empleados referenciados en nóminas aunque ya no estén en la tabla employees
    const { data: nominasRefs } = await supabase
      .from('nominas')
      .select('employee_id, employee, dni')
      .eq('company_id', companyId)
      .not('employee_id', 'is', null)

    for (const row of nominasRefs || []) {
      const id = row.employee_id as string
      if (!id || byId.has(id)) continue
      const employee = row.employee as { name?: string; dni?: string } | null
      byId.set(id, {
        id,
        name: employee?.name?.trim() || 'Sin nombre',
        nif: (row.dni as string) || employee?.dni || undefined,
      })
    }

    const list = Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    )

    return NextResponse.json({ success: true, data: list })
  } catch (error) {
    console.error('[nominas/employees] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
