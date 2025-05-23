import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
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

    // Transform data for Excel export
    const excelData = nominas.map((nomina, index) => {
      const employee = nomina.employee || {}
      const company = nomina.company || {}
      
      // Calculate totals
      const totalPerceptions = (nomina.perceptions || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
      const totalDeductions = (nomina.deductions || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
      const totalContributions = (nomina.contributions || []).reduce((sum: number, p: any) => sum + (p.employer_contribution || 0), 0)

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
    const perceptionsData: any[] = []
    nominas.forEach((nomina) => {
      const employee = nomina.employee || {}
      ;(nomina.perceptions || []).forEach((perception: any) => {
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
    const deductionsData: any[] = []
    nominas.forEach((nomina) => {
      const employee = nomina.employee || {}
      ;(nomina.deductions || []).forEach((deduction: any) => {
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