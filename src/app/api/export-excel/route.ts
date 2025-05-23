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

export async function GET() {
  try {
    // Fetch all nominas from Supabase
    const { data: nominas, error, count } = await supabase
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

    // Transform data for Excel export
    const excelData = (nominas as Nomina[]).map((nomina, index) => {
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
        'Empleado - Nombre': employee.name || '',
        'Empleado - DNI': employee.dni || '',
        'Empleado - NSS': employee.nss || '',
        'Empleado - Categoría': employee.category || '',
        'Empleado - Código': employee.code || '',
        
        // Company Info
        'Empresa - Nombre': company.name || '',
        'Empresa - CIF': company.cif || '',
        'Empresa - Dirección': company.address || '',
        'Empresa - Código Centro': company.center_code || '',
        
        // Financial Info
        'Base Cotización SS': nomina.base_ss || 0,
        'Salario Neto': nomina.net_pay || 0,
        'Coste Empresa': nomina.cost_empresa || 0,
        'Total Percepciones': totalPerceptions,
        'Total Deducciones': totalDeductions,
        'Total Contribuciones': totalContributions,
        
        // Bank Info
        'IBAN': nomina.iban || '',
        'SWIFT/BIC': nomina.swift_bic || '',
        
        // Status
        'Firmado': nomina.signed ? 'Sí' : 'No'
      }
    })

    // Create detailed sheets
    const workbook = XLSX.utils.book_new()
    
    // Main summary sheet
    const summarySheet = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen Nóminas')

    // Detailed perceptions sheet
    const perceptionsData: Record<string, string | number>[] = []
    nominas.forEach((nomina: Nomina) => {
      const employee = nomina.employee || {}
      ;(nomina.perceptions || []).forEach((perception: PerceptionDeduction) => {
        perceptionsData.push({
          'ID Nómina': nomina.id,
          'Empleado': employee.name || '',
          'DNI': employee.dni || '',
          'Período': `${nomina.period_start} - ${nomina.period_end}`,
          'Código': perception.code || '',
          'Concepto': perception.concept || '',
          'Importe': perception.amount || 0
        })
      })
    })
    
    if (perceptionsData.length > 0) {
      const perceptionsSheet = XLSX.utils.json_to_sheet(perceptionsData)
      XLSX.utils.book_append_sheet(workbook, perceptionsSheet, 'Percepciones')
    }

    // Detailed deductions sheet
    const deductionsData: Record<string, string | number>[] = []
    nominas.forEach((nomina: Nomina) => {
      const employee = nomina.employee || {}
      ;(nomina.deductions || []).forEach((deduction: PerceptionDeduction) => {
        deductionsData.push({
          'ID Nómina': nomina.id,
          'Empleado': employee.name || '',
          'DNI': employee.dni || '',
          'Período': `${nomina.period_start} - ${nomina.period_end}`,
          'Código': deduction.code || '',
          'Concepto': deduction.concept || '',
          'Importe': deduction.amount || 0
        })
      })
    })
    
    if (deductionsData.length > 0) {
      const deductionsSheet = XLSX.utils.json_to_sheet(deductionsData)
      XLSX.utils.book_append_sheet(workbook, deductionsSheet, 'Deducciones')
    }

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    
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