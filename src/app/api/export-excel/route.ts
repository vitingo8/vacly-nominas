import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

interface Employee {
  name?: string
  dni?: string
  nss?: string
  category?: string
  code?: string
}

interface Company {
  name?: string
  cif?: string
  address?: string
  center_code?: string
}

interface PerceptionDeduction {
  code?: string
  concept?: string
  amount?: number
}

interface Contribution {
  concept?: string
  base?: number
  rate?: number
  employer_contribution?: number
}

interface NominaData {
  id?: string
  nominaId?: string
  period_start?: string
  period_end?: string
  employee?: Employee
  company?: Company
  perceptions?: PerceptionDeduction[]
  deductions?: PerceptionDeduction[]
  contributions?: Contribution[]
  base_ss?: number
  net_pay?: number
  iban?: string
  swift_bic?: string
  cost_empresa?: number
  signed?: boolean
}

interface ProcessedDocument {
  filename: string
  pageNumber: number
  nominaData: NominaData
}

interface Nomina {
  id: string
  created_at: string
  period_start: string
  period_end: string
  employee: Employee
  company: Company
  perceptions: PerceptionDeduction[]
  deductions: PerceptionDeduction[]
  contributions: Contribution[]
  base_ss: number
  net_pay: number
  iban?: string
  swift_bic?: string
  cost_empresa: number
  signed: boolean
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateExcelFromData(data: ProcessedDocument[] | Nomina[]) {
  // Check if it's processed documents or database nominas
  const isProcessedDocs = data.length > 0 && 'filename' in data[0]
  
  // Create workbook
  const workbook = XLSX.utils.book_new()
  
  // ========== HOJA 1: RESUMEN PRINCIPAL ==========
  let summaryData: Record<string, string | number>[]
  
  if (isProcessedDocs) {
    // Handle processed documents from frontend
    summaryData = (data as ProcessedDocument[]).map((doc, index) => {
      const nomina = doc.nominaData
      const employee = nomina?.employee || {}
      const company = nomina?.company || {}
      
      // Calculate totals
      const totalPerceptions = (nomina?.perceptions || []).reduce((sum: number, p: PerceptionDeduction) => sum + (p.amount || 0), 0)
      const totalDeductions = (nomina?.deductions || []).reduce((sum: number, p: PerceptionDeduction) => sum + (p.amount || 0), 0)
      const totalContributions = (nomina?.contributions || []).reduce((sum: number, p: Contribution) => sum + (p.employer_contribution || 0), 0)
      const grossSalary = totalPerceptions

      return {
        // Basic Info
        'Nº': index + 1,
        'Archivo': doc.filename,
        'Página': doc.pageNumber,
        'ID Nómina': nomina?.nominaId || nomina?.id || '',
        'Período Inicio': nomina?.period_start || '',
        'Período Fin': nomina?.period_end || '',
        
        // Employee Info
        'Empleado': employee.name || '',
        'DNI': employee.dni || '',
        'NSS': employee.nss || '',
        'Categoría': employee.category || '',
        'Código Empleado': employee.code || '',
        
        // Company Info
        'Empresa': company.name || '',
        'CIF': company.cif || '',
        'Dirección': company.address || '',
        'Código Centro': company.center_code || '',
        
        // Financial Summary
        'Salario Bruto €': grossSalary,
        'Base Cotización SS €': nomina?.base_ss || 0,
        'Total Percepciones €': totalPerceptions,
        'Total Deducciones €': totalDeductions,
        'Salario Neto €': nomina?.net_pay || 0,
        'Contribuciones Empresa €': totalContributions,
        'Coste Total Empresa €': nomina?.cost_empresa || 0,
        
        // Bank Info
        'IBAN': nomina?.iban || '',
        'SWIFT/BIC': nomina?.swift_bic || '',
        
        // Status
        'Estado': nomina?.signed ? 'Firmado' : 'Pendiente'
      }
    })
  } else {
    // Handle database nominas
    summaryData = (data as Nomina[]).map((nomina, index) => {
      const employee = nomina.employee || {}
      const company = nomina.company || {}
      
      // Calculate totals
      const totalPerceptions = (nomina.perceptions || []).reduce((sum: number, p: PerceptionDeduction) => sum + (p.amount || 0), 0)
      const totalDeductions = (nomina.deductions || []).reduce((sum: number, p: PerceptionDeduction) => sum + (p.amount || 0), 0)
      const totalContributions = (nomina.contributions || []).reduce((sum: number, p: Contribution) => sum + (p.employer_contribution || 0), 0)

      return {
        // Basic Info
        'Nº': index + 1,
        'ID Nómina': nomina.id,
        'Fecha Creación': new Date(nomina.created_at).toLocaleDateString('es-ES'),
        'Período Inicio': nomina.period_start,
        'Período Fin': nomina.period_end,
        
        // Employee Info
        'Empleado': employee.name || '',
        'DNI': employee.dni || '',
        'NSS': employee.nss || '',
        'Categoría': employee.category || '',
        'Código Empleado': employee.code || '',
        
        // Company Info
        'Empresa': company.name || '',
        'CIF': company.cif || '',
        'Dirección': company.address || '',
        'Código Centro': company.center_code || '',
        
        // Financial Summary
        'Salario Bruto €': totalPerceptions,
        'Base Cotización SS €': nomina.base_ss || 0,
        'Total Percepciones €': totalPerceptions,
        'Total Deducciones €': totalDeductions,
        'Salario Neto €': nomina.net_pay || 0,
        'Contribuciones Empresa €': totalContributions,
        'Coste Total Empresa €': nomina.cost_empresa || 0,
        
        // Bank Info
        'IBAN': nomina.iban || '',
        'SWIFT/BIC': nomina.swift_bic || '',
        
        // Status
        'Estado': nomina.signed ? 'Firmado' : 'Pendiente'
      }
    })
  }

  // Create main summary sheet
  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  
  // Set column widths for better readability
  const summaryColWidths = [
    { wch: 5 }, { wch: 20 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
    { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
    { wch: 25 }, { wch: 12 }, { wch: 30 }, { wch: 15 },
    { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 18 },
    { wch: 25 }, { wch: 12 }, { wch: 12 }
  ]
  summarySheet['!cols'] = summaryColWidths
  
  XLSX.utils.book_append_sheet(workbook, summarySheet, '📊 Resumen General')

  // ========== HOJA 2: DETALLE PERCEPCIONES ==========
  const perceptionsData: any[] = []
  
  const sourceData = isProcessedDocs ? (data as ProcessedDocument[]) : (data as Nomina[])
  
  sourceData.forEach((item, index) => {
    const nomina = isProcessedDocs ? (item as ProcessedDocument).nominaData : (item as Nomina)
    const employee = nomina?.employee || {}
    const perceptions = nomina?.perceptions || []
    
    perceptions.forEach((perception, pIndex) => {
      perceptionsData.push({
        'Nº Nómina': index + 1,
        'ID Nómina': isProcessedDocs ? nomina?.nominaId || nomina?.id : (item as Nomina).id,
        'Empleado': employee.name || '',
        'DNI': employee.dni || '',
        'Nº Percepción': pIndex + 1,
        'Código': perception.code || '',
        'Concepto': perception.concept || '',
        'Importe €': perception.amount || 0
      })
    })
  })

  if (perceptionsData.length > 0) {
    const perceptionsSheet = XLSX.utils.json_to_sheet(perceptionsData)
    perceptionsSheet['!cols'] = [
      { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 },
      { wch: 10 }, { wch: 30 }, { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(workbook, perceptionsSheet, '💰 Percepciones Detalle')
  }

  // ========== HOJA 3: DETALLE DEDUCCIONES ==========
  const deductionsData: any[] = []
  
  sourceData.forEach((item, index) => {
    const nomina = isProcessedDocs ? (item as ProcessedDocument).nominaData : (item as Nomina)
    const employee = nomina?.employee || {}
    const deductions = nomina?.deductions || []
    
    deductions.forEach((deduction, dIndex) => {
      deductionsData.push({
        'Nº Nómina': index + 1,
        'ID Nómina': isProcessedDocs ? nomina?.nominaId || nomina?.id : (item as Nomina).id,
        'Empleado': employee.name || '',
        'DNI': employee.dni || '',
        'Nº Deducción': dIndex + 1,
        'Código': deduction.code || '',
        'Concepto': deduction.concept || '',
        'Importe €': deduction.amount || 0
      })
    })
  })

  if (deductionsData.length > 0) {
    const deductionsSheet = XLSX.utils.json_to_sheet(deductionsData)
    deductionsSheet['!cols'] = [
      { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 },
      { wch: 10 }, { wch: 30 }, { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(workbook, deductionsSheet, '📉 Deducciones Detalle')
  }

  // ========== HOJA 4: DETALLE CONTRIBUCIONES SOCIALES ==========
  const contributionsData: any[] = []
  
  sourceData.forEach((item, index) => {
    const nomina = isProcessedDocs ? (item as ProcessedDocument).nominaData : (item as Nomina)
    const employee = nomina?.employee || {}
    const contributions = nomina?.contributions || []
    
    contributions.forEach((contribution, cIndex) => {
      contributionsData.push({
        'Nº Nómina': index + 1,
        'ID Nómina': isProcessedDocs ? nomina?.nominaId || nomina?.id : (item as Nomina).id,
        'Empleado': employee.name || '',
        'DNI': employee.dni || '',
        'Nº Contribución': cIndex + 1,
        'Concepto': contribution.concept || '',
        'Base €': contribution.base || 0,
        'Tipo %': contribution.rate ? (contribution.rate * 100).toFixed(2) : '0.00',
        'Contribución Empresa €': contribution.employer_contribution || 0
      })
    })
  })

  if (contributionsData.length > 0) {
    const contributionsSheet = XLSX.utils.json_to_sheet(contributionsData)
    contributionsSheet['!cols'] = [
      { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 15 },
      { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 18 }
    ]
    XLSX.utils.book_append_sheet(workbook, contributionsSheet, '🏛️ Contribuciones SS')
  }

  // ========== HOJA 5: ANÁLISIS Y ESTADÍSTICAS ==========
  const totalNominas = summaryData.length
  const totalSalariosBrutos = summaryData.reduce((sum, item) => sum + Number(item['Salario Bruto €'] || 0), 0)
  const totalSalariosNetos = summaryData.reduce((sum, item) => sum + Number(item['Salario Neto €'] || 0), 0)
  const totalCosteEmpresa = summaryData.reduce((sum, item) => sum + Number(item['Coste Total Empresa €'] || 0), 0)
  const totalContribucionesEmpresa = summaryData.reduce((sum, item) => sum + Number(item['Contribuciones Empresa €'] || 0), 0)
  const totalDeducciones = summaryData.reduce((sum, item) => sum + Number(item['Total Deducciones €'] || 0), 0)

  // Get unique companies and employees
  const uniqueCompanies = [...new Set(summaryData.map(item => item['Empresa']).filter(Boolean))]
  const uniqueEmployees = [...new Set(summaryData.map(item => item['Empleado']).filter(Boolean))]

  const analyticsData = [
    { 'Métrica': '📊 ESTADÍSTICAS GENERALES', 'Valor': '', 'Detalle': '' },
    { 'Métrica': 'Total de Nóminas Procesadas', 'Valor': totalNominas, 'Detalle': 'Documentos' },
    { 'Métrica': 'Empresas Distintas', 'Valor': uniqueCompanies.length, 'Detalle': uniqueCompanies.slice(0, 3).join(', ') + (uniqueCompanies.length > 3 ? '...' : '') },
    { 'Métrica': 'Empleados Distintos', 'Valor': uniqueEmployees.length, 'Detalle': uniqueEmployees.slice(0, 3).join(', ') + (uniqueEmployees.length > 3 ? '...' : '') },
    { 'Métrica': '', 'Valor': '', 'Detalle': '' },
    { 'Métrica': '💰 ANÁLISIS FINANCIERO', 'Valor': '', 'Detalle': '' },
    { 'Métrica': 'Suma Total Salarios Brutos', 'Valor': `${totalSalariosBrutos.toFixed(2)} €`, 'Detalle': 'Antes de deducciones' },
    { 'Métrica': 'Suma Total Salarios Netos', 'Valor': `${totalSalariosNetos.toFixed(2)} €`, 'Detalle': 'A pagar a empleados' },
    { 'Métrica': 'Suma Total Deducciones', 'Valor': `${totalDeducciones.toFixed(2)} €`, 'Detalle': 'IRPF + Seg. Social empleado' },
    { 'Métrica': 'Suma Contribuciones Empresa', 'Valor': `${totalContribucionesEmpresa.toFixed(2)} €`, 'Detalle': 'Seg. Social a cargo empresa' },
    { 'Métrica': 'Coste Total para Empresas', 'Valor': `${totalCosteEmpresa.toFixed(2)} €`, 'Detalle': 'Bruto + Contribuciones' },
    { 'Métrica': '', 'Valor': '', 'Detalle': '' },
    { 'Métrica': '📈 PROMEDIOS', 'Valor': '', 'Detalle': '' },
    { 'Métrica': 'Salario Bruto Promedio', 'Valor': `${(totalSalariosBrutos / totalNominas).toFixed(2)} €`, 'Detalle': 'Por nómina' },
    { 'Métrica': 'Salario Neto Promedio', 'Valor': `${(totalSalariosNetos / totalNominas).toFixed(2)} €`, 'Detalle': 'Por nómina' },
    { 'Métrica': 'Coste Empresa Promedio', 'Valor': `${(totalCosteEmpresa / totalNominas).toFixed(2)} €`, 'Detalle': 'Por nómina' },
    { 'Métrica': 'Retención Promedio', 'Valor': `${(((totalSalariosBrutos - totalSalariosNetos) / totalSalariosBrutos) * 100).toFixed(2)}%`, 'Detalle': 'Deducciones vs Bruto' },
    { 'Métrica': '', 'Valor': '', 'Detalle': '' },
    { 'Métrica': '📅 INFORMACIÓN DEL REPORTE', 'Valor': '', 'Detalle': '' },
    { 'Métrica': 'Fecha de Generación', 'Valor': new Date().toLocaleDateString('es-ES'), 'Detalle': new Date().toLocaleTimeString('es-ES') },
    { 'Métrica': 'Sistema', 'Valor': 'Vacly Nóminas', 'Detalle': 'Procesamiento IA con Claude 3.5' }
  ]

  const analyticsSheet = XLSX.utils.json_to_sheet(analyticsData)
  analyticsSheet['!cols'] = [
    { wch: 30 }, { wch: 20 }, { wch: 40 }
  ]
  XLSX.utils.book_append_sheet(workbook, analyticsSheet, '📈 Análisis y KPIs')

  // Generate Excel buffer
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  
  return excelBuffer
}

export async function POST(request: NextRequest) {
  try {
    const { documents } = await request.json()
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ 
        error: 'No documents provided for export'
      }, { status: 400 })
    }

    // Generate Excel from processed documents
    const excelBuffer = generateExcelFromData(documents)
    
    // Return the Excel file
    const fileName = `nominas_procesadas_${new Date().toISOString().split('T')[0]}.xlsx`
    
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': excelBuffer.length.toString(),
      },
    })

  } catch (error) {
    console.error('Excel export error:', error)
    return NextResponse.json({ 
      error: 'Failed to export to Excel',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Fetch all nominas from Supabase
    const { data: nominas, error } = await supabase
      .from('nominas')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase fetch error:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch nominas',
        details: error.message
      }, { status: 500 })
    }

    if (!nominas || nominas.length === 0) {
      return NextResponse.json({ 
        error: 'No nominas found to export'
      }, { status: 404 })
    }

    // Generate Excel from database nominas
    const excelBuffer = generateExcelFromData(nominas as Nomina[])
    
    // Return the Excel file
    const fileName = `nominas_export_${new Date().toISOString().split('T')[0]}.xlsx`
    
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': excelBuffer.length.toString(),
      },
    })

  } catch (error) {
    console.error('Excel export error:', error)
    return NextResponse.json({ 
      error: 'Failed to export to Excel',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 