import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

type EmployeeOption = { id: string; name: string; nif?: string; hire_date?: string | null }

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'company_id es requerido' }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    const { data: employees, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, nif, entry_date')
      .eq('company_id', companyId)
      .order('first_name')
      .order('last_name')

    if (error) {
      console.error('[nominas/employees] Error:', error)
      return NextResponse.json({ success: false, error: 'Error al cargar empleados' }, { status: 500 })
    }

    // Fecha de alta = fecha del contrato más antiguo (con fallback a entry_date).
    const earliestContractByEmployee = new Map<string, string>()
    const { data: contracts } = await supabase
      .from('contracts')
      .select('employee_id, start_date')
      .eq('company_id', companyId)
      .not('start_date', 'is', null)

    for (const c of contracts || []) {
      const empId = c.employee_id as string
      const start = c.start_date as string
      if (!empId || !start) continue
      const current = earliestContractByEmployee.get(empId)
      if (!current || start < current) {
        earliestContractByEmployee.set(empId, start)
      }
    }

    const byId = new Map<string, EmployeeOption>()

    for (const emp of employees || []) {
      byId.set(emp.id, {
        id: emp.id,
        name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Sin nombre',
        nif: emp.nif || undefined,
        hire_date:
          earliestContractByEmployee.get(emp.id) ||
          ((emp as { entry_date?: string | null }).entry_date ?? null),
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
