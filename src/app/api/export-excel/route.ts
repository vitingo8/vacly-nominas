import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { documents } = body

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 })
    }

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // 1. Resumen General
    const summaryData = documents.map((doc: any) => ({
      'Empleado': doc.nominaData?.employee?.name || 'N/A',
      'DNI': doc.nominaData?.employee?.dni || 'N/A',
      'Empresa': doc.nominaData?.company?.name || 'N/A',
      'Período': `${doc.nominaData?.period_start || 'N/A'} - ${doc.nominaData?.period_end || 'N/A'}`,
      'Salario Bruto': doc.nominaData?.gross_salary || 0,
      'Salario Neto': doc.nominaData?.net_pay || 0,
      'Coste Empresa': doc.nominaData?.cost_empresa || 0,
      'Base SS': doc.nominaData?.base_ss || 0,
    }))
    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen')

    // 2. Percepciones
    const perceptionsData: any[] = []
    documents.forEach((doc: any, index: number) => {
      const employeeName = doc.nominaData?.employee?.name || `Empleado ${index + 1}`
      const perceptions = doc.nominaData?.perceptions || []
      perceptions.forEach((p: any) => {
        perceptionsData.push({
          'Empleado': employeeName,
          'Concepto': p.concept || 'N/A',
          'Código': p.code || '-',
          'Importe': p.amount || 0,
        })
      })
    })
    if (perceptionsData.length > 0) {
      const perceptionsSheet = XLSX.utils.json_to_sheet(perceptionsData)
      XLSX.utils.book_append_sheet(workbook, perceptionsSheet, 'Percepciones')
    }

    // 3. Deducciones
    const deductionsData: any[] = []
    documents.forEach((doc: any, index: number) => {
      const employeeName = doc.nominaData?.employee?.name || `Empleado ${index + 1}`
      const deductions = doc.nominaData?.deductions || []
      deductions.forEach((d: any) => {
        deductionsData.push({
          'Empleado': employeeName,
          'Concepto': d.concept || 'N/A',
          'Código': d.code || '-',
          'Importe': d.amount || 0,
        })
      })
    })
    if (deductionsData.length > 0) {
      const deductionsSheet = XLSX.utils.json_to_sheet(deductionsData)
      XLSX.utils.book_append_sheet(workbook, deductionsSheet, 'Deducciones')
    }

    // 4. Contribuciones
    const contributionsData: any[] = []
    documents.forEach((doc: any, index: number) => {
      const employeeName = doc.nominaData?.employee?.name || `Empleado ${index + 1}`
      const contributions = doc.nominaData?.contributions || []
      contributions.forEach((c: any) => {
        contributionsData.push({
          'Empleado': employeeName,
          'Concepto': c.concept || 'N/A',
          'Base': c.base || 0,
          'Tasa %': c.rate ? (c.rate * 100).toFixed(2) : '0',
          'Contribución Empresa': c.employer_contribution || 0,
        })
      })
    })
    if (contributionsData.length > 0) {
      const contributionsSheet = XLSX.utils.json_to_sheet(contributionsData)
      XLSX.utils.book_append_sheet(workbook, contributionsSheet, 'Contribuciones')
    }

    // 5. Análisis y KPIs
    const kpisData = documents.map((doc: any) => ({
      'Empleado': doc.nominaData?.employee?.name || 'N/A',
      'Empresa': doc.nominaData?.company?.name || 'N/A',
      'Retención IRPF (%)': calculateTax(doc.nominaData?.gross_salary || 0, doc.nominaData?.deductions || []),
      'Desempeño Coste/Salario': ((doc.nominaData?.cost_empresa || 0) / (doc.nominaData?.gross_salary || 1)).toFixed(2),
      'Aportación SS Empresa (%)': calculateSSPercentage(doc.nominaData?.cost_empresa || 0, doc.nominaData?.gross_salary || 1),
      'Neto/Bruto (%)': ((doc.nominaData?.net_pay || 0) / (doc.nominaData?.gross_salary || 1) * 100).toFixed(2),
    }))
    const kpisSheet = XLSX.utils.json_to_sheet(kpisData)
    XLSX.utils.book_append_sheet(workbook, kpisSheet, 'KPIs')

    // Write to buffer
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })

    // Return as response
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="nominas-${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error exporting Excel:', error)
    return NextResponse.json({
      error: 'Error exporting Excel',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Helper functions
function calculateTax(grossSalary: number, deductions: any[]): string {
  const irpf = deductions.find(d => d.concept?.includes('IRPF'))
  if (!irpf || !grossSalary) return '0'
  return ((irpf.amount / grossSalary) * 100).toFixed(2)
}

function calculateSSPercentage(costEmpresa: number, grossSalary: number): string {
  if (!grossSalary) return '0'
  const ssPercentage = ((costEmpresa - grossSalary) / grossSalary) * 100
  return ssPercentage.toFixed(2)
}
