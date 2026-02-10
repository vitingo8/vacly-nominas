import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { generateREDFile } from '@/lib/generadores'
import type { REDFileData, REDEmployeeRecord, REDCompanyInfo } from '@/lib/generadores'

// ─── POST: Generate RED file for Social Security ─────────────────────
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
    if (!companyData.ccc || !companyData.companyName || !companyData.cif) {
      return NextResponse.json(
        { success: false, error: 'Faltan datos de la empresa: ccc, companyName, cif' },
        { status: 400 }
      )
    }

    // Fetch all generated nominas for the period
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data: nominas, error } = await supabase
      .from('nominas')
      .select('id, employee_id, employee, calculation_details, company_cotizations')
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

    // Fetch employee details (contract types, etc.)
    const employeeIds = nominas.map(n => n.employee_id)
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, social_security_number, nif, compensation')
      .in('id', employeeIds)

    if (empError) {
      console.error('Error fetching employees:', empError)
      return NextResponse.json(
        { success: false, error: 'Error al obtener datos de empleados', details: empError.message },
        { status: 500 }
      )
    }

    // Create employee data map
    const employeeDataMap = new Map<string, any>()
    employees?.forEach(emp => {
      employeeDataMap.set(emp.id, emp)
    })

    // Fetch contracts for contract type
    const { data: contracts } = await supabase
      .from('contracts')
      .select('employee_id, contract_type, cotization_group')
      .in('employee_id', employeeIds)
      .eq('status', 'active')

    const contractMap = new Map<string, any>()
    contracts?.forEach(contract => {
      contractMap.set(contract.employee_id, contract)
    })

    // Prepare RED employee records
    const employeeRecords: REDEmployeeRecord[] = []
    const missingData: string[] = []

    nominas.forEach(nomina => {
      const employeeData = employeeDataMap.get(nomina.employee_id)
      const contract = contractMap.get(nomina.employee_id)
      
      if (!employeeData?.social_security_number || !nomina.employee?.dni) {
        missingData.push(nomina.employee?.name || nomina.employee_id)
        return
      }

      const calcDetails = nomina.calculation_details
      const companyCotizations = nomina.company_cotizations

      // Map contract type to RED code
      const contractTypeMap: Record<string, string> = {
        'permanent': '100', // Indefinido ordinario
        'temporary': '200', // Temporal
        'training': '420', // Formación
        'internship': '421', // Prácticas
      }

      const contractTypeCode = contractTypeMap[contract?.contract_type || 'permanent'] || '100'

      // Extract bases from calculation details
      const bases = calcDetails?.bases || {}
      const workerDed = calcDetails?.workerDeductions || {}
      const companyDed = calcDetails?.companyDeductions || {}

      // Convert euros to cents
      const toCents = (amount: number) => Math.round(amount * 100)

      employeeRecords.push({
        nss: employeeData.social_security_number.replace(/\s/g, ''),
        nif: nomina.employee.dni || employeeData.nif,
        fullName: nomina.employee.name || 'EMPLEADO',
        cotizationGroup: contract?.cotization_group || employeeData.compensation?.cotizationGroup || 7,
        contractType: contractTypeCode,
        baseCC: toCents(bases.baseCC || 0),
        baseATEP: toCents(bases.baseCP || 0),
        baseOvertimeNormal: toCents(bases.baseHE || 0),
        baseOvertimeForceMajeure: 0,
        workedDays: calcDetails?.workedDays || 30,
        totalDays: calcDetails?.calendarDays || 30,
        workerCCAmount: toCents(workerDed.contingenciasComunes || 0),
        workerUnemploymentAmount: toCents(workerDed.desempleo || 0),
        workerTrainingAmount: toCents(workerDed.formacionProfesional || 0),
        workerMEIAmount: toCents(workerDed.mei || 0),
        workerOvertimeNormalAmount: 0,
        workerOvertimeFMAmount: 0,
        companyCCAmount: toCents(companyDed.contingenciasComunes || 0),
        companyATEPAmount: toCents(companyDed.atEp || 0),
        companyUnemploymentAmount: toCents(companyDed.desempleo || 0),
        companyFOGASAAmount: toCents(companyDed.fogasa || 0),
        companyTrainingAmount: toCents(companyDed.formacionProfesional || 0),
        companyMEIAmount: toCents(companyDed.mei || 0),
        employmentStatus: 'A',
      })
    })

    if (missingData.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Los siguientes empleados no tienen NSS o NIF configurado: ${missingData.join(', ')}`,
          missingData,
        },
        { status: 400 }
      )
    }

    if (employeeRecords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay registros válidos para generar' },
        { status: 400 }
      )
    }

    // Prepare RED company info
    const redCompanyInfo: REDCompanyInfo = {
      ccc: companyData.ccc,
      companyName: companyData.companyName,
      cif: companyData.cif,
      cnae: companyData.cnae || '0000',
    }

    // Prepare RED file data
    const redFileData: REDFileData = {
      company: redCompanyInfo,
      month: parseInt(month),
      year: parseInt(year),
      employees: employeeRecords,
      liquidationType: 'L00', // Normal liquidation
    }

    // Generate RED file
    const redContent = generateREDFile(redFileData)

    // Return as downloadable file
    const filename = `RED_${companyData.ccc}_${year}${String(month).padStart(2, '0')}.txt`

    return new NextResponse(redContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(Buffer.byteLength(redContent, 'utf8')),
      },
    })
  } catch (error) {
    console.error('POST /api/red error:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
