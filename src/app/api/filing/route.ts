// ============================================================================
// API /api/filing — Generación de presentaciones oficiales (Modelo 111 / 190)
// ----------------------------------------------------------------------------
// POST: genera el modelo a partir de las nóminas del periodo y lo persiste en
//       filing_submissions.
// GET:  lista las presentaciones de la empresa.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import {
  generateModelo111,
  generateModelo190,
  type Modelo111Perceptor,
  type Modelo190Perceptor,
} from '@/lib/generadores'
import { signSubmission } from '@/lib/admin-integrations'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

interface NominaRow {
  employee_id?: string | null
  dni?: string | null
  employee?: any
  gross_salary?: number | null
  calculation_details?: any
  deductions?: any
  period_start?: string | null
}

function quarterRange(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const endDay = new Date(year, endMonth, 0).getDate()
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${endDay}`,
  }
}

function extractPerceptor(row: NominaRow): {
  nif: string
  nombre: string
  percepcionesDinerarias: number
  retencionesDinerarias: number
  percepcionesEspecie: number
  ingresosACuentaEspecie: number
} {
  const cd = row.calculation_details || {}
  const accruals = cd.accruals || {}
  const worker = cd.workerDeductions || {}
  const company = cd.companyDeductions || {}

  const inKind = num(accruals.inKind)
  const totalSalary = num(accruals.totalSalaryAccruals) || num(row.gross_salary)
  const percepcionesDinerarias = round2(totalSalary - inKind)

  // Retención IRPF: de calculation_details o de las líneas de deducción.
  let irpf = num(worker.irpf)
  if (!irpf && Array.isArray(row.deductions)) {
    const line = row.deductions.find((d: any) =>
      String(d?.concept ?? '').toUpperCase().includes('IRPF'),
    )
    irpf = num(line?.amount)
  }

  const ingresosACuenta = round2(num(worker.inKindIngresoACuenta) + num(company.inKindIngresoACuenta))

  const emp = row.employee || {}
  const nif = String(emp.dni ?? emp.nif ?? row.dni ?? '').trim()
  const nombre = String(emp.name ?? emp.nombre ?? `${emp.last_name ?? ''} ${emp.first_name ?? ''}`).trim()

  return {
    nif,
    nombre,
    percepcionesDinerarias,
    retencionesDinerarias: round2(irpf),
    percepcionesEspecie: inKind,
    ingresosACuentaEspecie: ingresosACuenta,
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const { companyId, kind, year } = body as {
      companyId?: string
      kind?: string
      year?: number
    }
    const quarter = body.quarter ? Number(body.quarter) : undefined
    const month = body.month ? Number(body.month) : undefined

    if (!companyId || !kind || !year) {
      return NextResponse.json(
        { success: false, error: 'companyId, kind y year son obligatorios' },
        { status: 400 },
      )
    }

    // Datos de empresa.
    const { data: companyRow } = await supabase
      .from('companies')
      .select('company, cif')
      .eq('company_id', companyId)
      .maybeSingle()
    const { data: payrollConfig } = await supabase
      .from('payroll_config')
      .select('company_legal_name, company_tax_id')
      .eq('company_id', companyId)
      .maybeSingle()
    const empresa = {
      nif: (payrollConfig as any)?.company_tax_id || (companyRow as any)?.cif || '',
      nombre: (payrollConfig as any)?.company_legal_name || (companyRow as any)?.company || 'Empresa',
    }

    // Rango de fechas.
    let start: string
    let end: string
    let periodType: string
    let periodLabel: string
    if (kind === 'modelo_190') {
      start = `${year}-01-01`
      end = `${year}-12-31`
      periodType = 'annual'
      periodLabel = String(year)
    } else if (month) {
      const endDay = new Date(year, month, 0).getDate()
      start = `${year}-${String(month).padStart(2, '0')}-01`
      end = `${year}-${String(month).padStart(2, '0')}-${endDay}`
      periodType = 'monthly'
      periodLabel = String(month).padStart(2, '0')
    } else {
      const q = quarter ?? 1
      const range = quarterRange(year, q)
      start = range.start
      end = range.end
      periodType = 'quarterly'
      periodLabel = `${q}T`
    }

    const { data: nominas, error } = await supabase
      .from('nominas')
      .select('employee_id, dni, employee, gross_salary, calculation_details, deductions, period_start')
      .eq('company_id', companyId)
      .gte('period_start', start)
      .lte('period_start', end)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const rows = (nominas ?? []) as NominaRow[]
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay nóminas en el periodo seleccionado.' },
        { status: 404 },
      )
    }

    const perceptores = rows.map(extractPerceptor).filter((p) => p.nif)

    let result: any
    let fileName: string
    let totalBase = 0
    let totalWithholdings = 0

    if (kind === 'modelo_190') {
      const m190Perceptores: Modelo190Perceptor[] = perceptores.map((p) => ({
        nif: p.nif,
        nombre: p.nombre,
        clave: 'A',
        subclave: '01',
        percepcionesIntegras: p.percepcionesDinerarias,
        retenciones: p.retencionesDinerarias,
        percepcionesEspecie: p.percepcionesEspecie,
        ingresosACuentaEspecie: p.ingresosACuentaEspecie,
      }))
      result = generateModelo190({ ejercicio: year, empresa, perceptores: m190Perceptores })
      fileName = `modelo190_${year}.csv`
      totalBase = result.totalPercepcionesIntegras
      totalWithholdings = result.totalRetenciones
    } else {
      const m111Perceptores: Modelo111Perceptor[] = perceptores
      result = generateModelo111({ ejercicio: year, periodo: periodLabel, empresa, perceptores: m111Perceptores })
      fileName = `modelo111_${year}_${periodLabel}.csv`
      totalBase = result.basePercepcionesDinerarias
      totalWithholdings = result.totalAIngresar
    }

    // Persistencia (best-effort).
    let submissionId: string | null = null
    try {
      const { data: inserted } = await supabase
        .from('filing_submissions')
        .insert({
          company_id: companyId,
          kind,
          period_type: periodType,
          period_year: year,
          period_quarter: kind === 'modelo_190' ? null : quarter ?? null,
          period_month: month ?? null,
          total_base: totalBase,
          total_withholdings: totalWithholdings,
          employee_count: perceptores.length,
          payload: result,
          file_content: result.csv,
          file_name: fileName,
          status: 'generated',
        })
        .select('id')
        .maybeSingle()
      submissionId = (inserted as any)?.id ?? null
    } catch (persistErr) {
      console.warn('[filing] No se pudo persistir filing_submissions:', persistErr)
    }

    // Firma opcional con certificado digital (AEAT).
    let signature: Awaited<ReturnType<typeof signSubmission>> | null = null
    if (body.certificateId && typeof result?.csv === 'string') {
      signature = await signSubmission(supabase, {
        companyId,
        provider: 'aeat',
        procedureCode: kind === 'modelo_190' ? `190_${year}` : `111_${year}_${periodLabel}`,
        certificateId: body.certificateId,
        content: Buffer.from(result.csv, 'utf8'),
        subjectType: 'filing_submission',
        subjectId: submissionId ?? undefined,
        actorUserId: body.actorUserId,
      })
    }

    return NextResponse.json({
      success: true,
      submissionId,
      result,
      fileName,
      signature: signature
        ? {
            transactionId: signature.transactionId,
            format: signature.format,
            contentSha256: signature.contentSha256,
            signedAt: signature.signedAt,
          }
        : null,
    })
  } catch (err) {
    console.error('[POST /api/filing] Error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id')
    if (!companyId) {
      return NextResponse.json({ success: false, error: 'company_id requerido' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('filing_submissions')
      .select('id, kind, period_type, period_year, period_quarter, period_month, total_base, total_withholdings, employee_count, file_name, status, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, submissions: data ?? [] })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
