import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { generateSEPAFile } from '@/lib/generadores'
import type { SEPATransfer, SEPACompanyData } from '@/lib/generadores'

// ─── POST: Generate SEPA file for payroll transfers ──────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const { companyId, month, year, companyData } = body

    if (!companyId || !month || !year || !companyData) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: companyId, month, year, companyData' },
        { status: 400 }
      )
    }

    // Validate company data
    if (!companyData.companyName || !companyData.companyIBAN || !companyData.companyBIC) {
      return NextResponse.json(
        { success: false, error: 'Faltan datos de la empresa: companyName, companyIBAN, companyBIC' },
        { status: 400 }
      )
    }

    // Fetch all generated nominas for the period
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data: nominas, error } = await supabase
      .from('nominas')
      .select('id, employee_id, net_pay, employee')
      .eq('company_id', companyId)
      .gte('period_start', periodStart)
      .lte('period_start', periodEnd)
      .eq('status', 'generated')

    if (error) {
      console.error('Error fetching nominas:', error)
      return NextResponse.json(
        { success: false, error: 'Error al obtener nóminas', details: error.message },
        { status: 500 }
      )
    }

    if (!nominas || nominas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se encontraron nóminas generadas para este período' },
        { status: 404 }
      )
    }

    // Fetch employee IBANs
    const employeeIds = nominas.map(n => n.employee_id)
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, iban')
      .in('id', employeeIds)

    if (empError) {
      console.error('Error fetching employees:', empError)
      return NextResponse.json(
        { success: false, error: 'Error al obtener datos de empleados', details: empError.message },
        { status: 500 }
      )
    }

    // Create employee IBAN map
    const employeeIBANMap = new Map<string, string>()
    employees?.forEach(emp => {
      if (emp.iban) {
        employeeIBANMap.set(emp.id, emp.iban)
      }
    })

    // Prepare SEPA transfers
    const transfers: SEPATransfer[] = []
    const missingIBAN: string[] = []

    nominas.forEach(nomina => {
      const iban = employeeIBANMap.get(nomina.employee_id)
      if (!iban) {
        missingIBAN.push(nomina.employee?.name || nomina.employee_id)
        return
      }

      const monthName = new Date(year, month - 1).toLocaleString('es-ES', { month: 'short' }).toUpperCase()
      
      transfers.push({
        employeeName: nomina.employee?.name || 'Empleado',
        employeeIBAN: iban,
        amount: nomina.net_pay,
        reference: `NOMINA ${(nomina.employee?.name || '').substring(0, 20)} ${monthName}${year}`,
      })
    })

    if (missingIBAN.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Los siguientes empleados no tienen IBAN configurado: ${missingIBAN.join(', ')}`,
          missingIBAN,
        },
        { status: 400 }
      )
    }

    if (transfers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay transferencias válidas para generar' },
        { status: 400 }
      )
    }

    // Prepare SEPA company data
    const executionDate = body.executionDate || new Date().toISOString().split('T')[0]
    const sepaCompanyData: SEPACompanyData = {
      companyName: companyData.companyName,
      companyIBAN: companyData.companyIBAN,
      companyBIC: companyData.companyBIC,
      executionDate,
      companyCIF: companyData.companyCIF,
    }

    // Generate SEPA XML
    const sepaXML = generateSEPAFile(transfers, sepaCompanyData)

    // Return XML as downloadable file
    const filename = `SEPA_Nominas_${year}${String(month).padStart(2, '0')}.xml`

    return new NextResponse(sepaXML, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(Buffer.byteLength(sepaXML, 'utf8')),
      },
    })
  } catch (error) {
    console.error('POST /api/sepa error:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
