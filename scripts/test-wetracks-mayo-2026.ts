/**
 * Prueba local del motor de generación de nóminas — WETRACKS mayo 2026
 *
 * - Lee datos reales de Supabase (empleados, contratos, vacaciones, ausencias)
 * - Ejecuta runPayrollGeneration con dryRun=true (sin escrituras)
 * - Guarda PDFs + JSON + informe en ../testing_nominas/wetracks_mayo_2026/
 *
 * Ejecución (desde vacly-nominas):
 *   npx tsx scripts/test-wetracks-mayo-2026.ts
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPayrollGeneration } from '../src/app/api/generacion/generacion-service'
import { resolveMonthAbsences } from '../src/lib/payroll-absence-engine'
import { resolveApprovedITAbsence } from '../src/lib/payroll-it-engine'
import { resolveMonthOvertimeHours } from '../src/lib/payroll-overtime-engine'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, '..', '..', 'testing_nominas', 'wetracks_mayo_2026')

const COMPANY_ID = 'a92fef9d-34d6-40ac-8870-c5bc688cbf11'
const MONTH = 5
const YEAR = 2026

const TARGET_EMPLOYEE_IDS = new Set([
  '2a4c9c33-f8d0-4427-9915-3d58f3b69ac1',
  'a30e3c0d-4e89-494a-8916-ce5144c02e12',
  'ccf64480-bf39-41b0-876f-6bed0c9d7ad4',
  '0a19fad9-3c29-4092-b60f-d552bec655ff',
  '7c8a970b-75ec-4257-8bd5-f111c21c27c4',
  'c158554d-061e-4a3d-a8e4-05bc70fa45ee',
  '5d47e93e-7c26-4e92-a2a9-75bbb831af64',
])

function loadEnv() {
  const candidates = [resolve(__dirname, '..', '.env.local'), resolve(__dirname, '..', '.env')]
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue
    for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
      if (!m || process.env[m[1]]) continue
      let value = m[2]
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      process.env[m[1]] = value
    }
  }
}

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate()
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function nearEq(a: number, b: number, tol = 0.05) {
  return Math.abs(a - b) <= tol
}

function normalizeName(value: string) {
  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveWorkdayCoefficient(fullTime: unknown, workdayPercentage: unknown) {
  const pct = Number(workdayPercentage)
  if (Number.isFinite(pct) && pct > 0 && pct <= 100) return pct / 100
  return 1
}

function safeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function numericOrBoot(primary: unknown, bootValue: number | undefined, fallback = 0) {
  if (typeof primary === 'number' && Number.isFinite(primary) && primary > 0) return primary
  if (typeof bootValue === 'number' && bootValue > 0) return bootValue
  return fallback
}

function complementsTotal(value: unknown, bootValue: number | undefined) {
  if (Array.isArray(value) && value.length > 0) {
    return round2(value.reduce((sum, item: any) => sum + (Number(item?.amount ?? item) || 0), 0))
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  return bootValue ?? 0
}

function parseCotizationGroup(category: string | null | undefined, fallback = 7) {
  const m = String(category ?? '').match(/grupo\s*(\d{1,2})/i)
  return m ? Number(m[1]) : fallback
}

async function downloadReferencePdfs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: import('@supabase/supabase-js').SupabaseClient<any, 'public', any>,
  referenceNominas: Array<{ document_name?: string | null; employee?: { name?: string } }>,
) {
  const gestoriaDir = resolve(OUTPUT_DIR, 'pdfs', 'gestoria')
  mkdirSync(gestoriaDir, { recursive: true })

  const downloads: Array<{
    document: string
    savedAs: string
    ok: boolean
    bytes?: number
    error?: string
  }> = []

  for (const nom of referenceNominas) {
    const documentName = nom.document_name?.trim()
    if (!documentName) continue

    const { data, error } = await supabase.storage.from('Nominas').download(documentName)
    const dest = resolve(gestoriaDir, documentName)

    if (error || !data) {
      downloads.push({
        document: documentName,
        savedAs: dest,
        ok: false,
        error: error?.message ?? 'Archivo no encontrado en Storage',
      })
      continue
    }

    const buf = Buffer.from(await data.arrayBuffer())
    try {
      writeFileSync(dest, buf)
      downloads.push({
        document: documentName,
        savedAs: dest,
        ok: true,
        bytes: buf.length,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('EBUSY')) throw err
      downloads.push({
        document: documentName,
        savedAs: dest,
        ok: true,
        bytes: buf.length,
        error: 'Archivo ya existente y en uso (EBUSY); se mantiene la copia previa en disco.',
      })
    }
  }

  writeFileSync(resolve(OUTPUT_DIR, 'json', 'reference_downloads.json'), JSON.stringify(downloads, null, 2))
  return downloads
}

function bootstrapComplementLines(
  perceptions: Array<{ concept: string; amount: number }> | undefined,
): Array<{ conceptName: string; amount: number }> {
  if (!perceptions?.length) return []
  const skipPatterns = [
    'SALARIO BASE',
    'PAGA EXTRA',
    'EX.',
    'HORAS EXTRA',
    'GRATIFICACIONES',
    'ANTIGUEDAD',
    'A CTA CONVENIO',
  ]
  return perceptions
    .filter((p) => {
      const c = normalizeName(p.concept)
      return Number(p.amount) > 0 && !skipPatterns.some((s) => c.includes(s))
    })
    .map((p) => ({ conceptName: p.concept, amount: Number(p.amount) }))
}

function bootstrapFromReferenceNomina(ref: any, comp: any) {
  const perceptions = (ref?.perceptions ?? []) as Array<{ concept: string; amount: number }>
  const norm = (s: string) =>
    s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  let baseSalaryMonthly = 0
  let proratedBonuses = 0
  let fixedComplements = 0

  for (const p of perceptions) {
    const c = norm(p.concept)
    const amount = Number(p.amount) || 0
    if (c.includes('SALARIO BASE')) baseSalaryMonthly += amount
    else if (c.includes('PAGA EXTRA') || c.startsWith('EX.')) proratedBonuses += amount
    else fixedComplements += amount
  }

  const irpfLine = ((ref?.deductions ?? []) as Array<{ concept: string; amount: number }>).find((d) =>
    norm(d.concept).includes('IRPF'),
  )
  const irpfFromRef =
    irpfLine && ref?.gross_salary
      ? round2((Number(irpfLine.amount) / Number(ref.gross_salary)) * 100)
      : null

  return {
    baseSalaryMonthly: baseSalaryMonthly || Number(comp.baseSalaryMonthly) || 0,
    proratedBonuses,
    fixedComplements: bootstrapComplementLines(perceptions),
    cotizationGroup: parseCotizationGroup(ref?.employee?.category, Number(comp.cotizationGroup) || 7),
    irpfPercentage: Number(comp.irpfPercentage) || irpfFromRef || 0,
    professionalCategory: ref?.employee?.category ?? undefined,
    numberOfBonuses: Number(comp.numberOfBonuses) || 2,
  }
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en vacly-nominas/.env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const calendarDays = getDaysInMonth(MONTH, YEAR)
  const periodStart = `${YEAR}-${String(MONTH).padStart(2, '0')}-01`
  const periodEnd = `${YEAR}-${String(MONTH).padStart(2, '0')}-${calendarDays}`

  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(resolve(OUTPUT_DIR, 'pdfs'), { recursive: true })
  mkdirSync(resolve(OUTPUT_DIR, 'json'), { recursive: true })

  console.log('\n📋 WETRACKS — prueba motor nóminas mayo 2026 (dry-run)\n')

  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select(`
      id, first_name, last_name, nif, social_security_number, iban, compensation, irpf_data, status, user_id,
      contracts!contracts_employee_id_fkey (
        id, contract_type, full_time, workday_percentage, agreed_base_salary,
        cotization_group, status, professional_category, start_date, weekly_hours
      )
    `)
    .eq('company_id', COMPANY_ID)
    .eq('status', 'Activo')

  if (empErr) throw new Error(`Error cargando empleados: ${empErr.message}`)

  const selected = (employees ?? []).filter((e: any) => TARGET_EMPLOYEE_IDS.has(e.id))
  if (selected.length === 0) throw new Error('No se encontraron empleados objetivo')

  const { data: referenceNominas } = await supabase
    .from('nominas')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('period_start', periodStart)

  const refByEmployeeId = new Map<string, any>()
  for (const nom of referenceNominas ?? []) {
    if (nom.employee_id) refByEmployeeId.set(nom.employee_id, nom)
  }

  const referenceDownloads = await downloadReferencePdfs(supabase, referenceNominas ?? [])
  const downloadedRefs = referenceDownloads.filter((d) => d.ok).length
  console.log(`📥 Nóminas reales (gestoría): ${downloadedRefs}/${referenceDownloads.length} descargadas`)

  const absenceContext: Record<string, unknown> = {}
  const overtimeContext: Record<string, { overtimeHours: number; daysWithOvertime: number; totalWorkedHours: number }> = {}
  for (const emp of selected) {
    const activeContract = (emp.contracts ?? []).find((c: any) => c.status === 'active') as any
    const weeklyHours = Number(activeContract?.weekly_hours) || 40
    const dailyStandardHours = round2(weeklyHours / 5)

    const [absences, itAbsence, overtime] = await Promise.all([
      resolveMonthAbsences(supabase as any, {
        companyId: COMPANY_ID,
        employeeId: emp.id,
        periodStart,
        periodEnd,
      }),
      resolveApprovedITAbsence(supabase as any, {
        companyId: COMPANY_ID,
        employeeId: emp.id,
        periodStart,
        periodEnd,
      }),
      resolveMonthOvertimeHours(supabase as any, {
        companyId: COMPANY_ID,
        employeeId: emp.id,
        periodStart,
        periodEnd,
        dailyStandardHours,
      }),
    ])
    absenceContext[emp.id] = { absences, itAbsence }
    overtimeContext[emp.id] = overtime
  }

  const totalOvertimeHours = Object.values(overtimeContext).reduce((sum, o) => sum + o.overtimeHours, 0)
  console.log(
    `⏱️  Horas extra detectadas en fichajes (mayo 2026): ${fmt(totalOvertimeHours)} h en total sobre ${selected.length} empleados`,
  )

  writeFileSync(
    resolve(OUTPUT_DIR, 'json', 'input_context.json'),
    JSON.stringify({ periodStart, periodEnd, absenceContext, overtimeContext, employeeCount: selected.length }, null, 2),
  )

  const generationEmployees = selected.map((emp: any) => {
    const contract = (emp.contracts ?? []).find((c: any) => c.status === 'active') ?? {}
    const comp = emp.compensation ?? {}
    const ctx = absenceContext[emp.id] as any
    const autoIT = ctx?.itAbsence
    const autoITDays = Number(autoIT?.daysInPeriod ?? 0)
    const vacationDays = Number(ctx?.absences?.vacationDays ?? 0)
    const overtimeHours = Number(overtimeContext[emp.id]?.overtimeHours ?? 0)
    const employeeName = `${emp.last_name ?? ''} ${emp.first_name ?? ''}`.trim()
    const ref = refByEmployeeId.get(emp.id)
    const boot = ref ? bootstrapFromReferenceNomina(ref, comp) : null

    return {
      employeeId: emp.id,
      employeeName,
      dni: emp.nif ?? ref?.dni ?? '',
      ssNumber: emp.social_security_number ?? ref?.employee?.nss ?? '',
      iban: emp.iban ?? ref?.iban ?? '',
      baseSalaryMonthly: numericOrBoot(contract.agreed_base_salary, boot?.baseSalaryMonthly, Number(comp.baseSalaryMonthly) || 0),
      cotizationGroup: Number(comp.cotizationGroup ?? contract.cotization_group ?? boot?.cotizationGroup ?? 7),
      irpfPercentage: numericOrBoot(comp.irpfPercentage, boot?.irpfPercentage, 0),
      fixedComplements: Array.isArray(boot?.fixedComplements) && boot.fixedComplements.length > 0
        ? boot.fixedComplements
        : complementsTotal(comp.fixedComplements, undefined),
      proratedBonuses: numericOrBoot(
        typeof comp.proratedBonuses === 'number' ? comp.proratedBonuses : undefined,
        boot?.proratedBonuses,
        0,
      ),
      numberOfBonuses: Number(comp.numberOfBonuses ?? boot?.numberOfBonuses ?? 2),
      contractType: contract.contract_type ?? 'permanent',
      fullTime: contract.full_time !== false && resolveWorkdayCoefficient(contract.full_time, contract.workday_percentage) >= 1,
      workdayPercentage: Number(contract.workday_percentage ?? 100),
      professionalCategory: contract.professional_category ?? boot?.professionalCategory ?? undefined,
      contractStartDate: contract.start_date ?? undefined,
      variables: {
        workedDays: Math.max(0, calendarDays - autoITDays - vacationDays),
        overtimeHours,
        vacationDays: 0,
        itDays: autoITDays,
        itContingencyType: autoIT?.contingencyType ?? 'ENFERMEDAD_COMUN',
        commissions: 0,
        advances: 0,
        incentives: 0,
      },
      _bootstrapFromReference: !!boot && !contract.agreed_base_salary,
    }
  })

  writeFileSync(
    resolve(OUTPUT_DIR, 'json', 'generation_payload.json'),
    JSON.stringify(
      generationEmployees.map(({ _bootstrapFromReference, ...rest }) => ({
        ...rest,
        bootstrappedFromGestoria: _bootstrapFromReference,
      })),
      null,
      2,
    ),
  )

  const outcome = await runPayrollGeneration(
    {
      companyId: COMPANY_ID,
      month: MONTH,
      year: YEAR,
      dryRun: true,
      employees: generationEmployees.map(({ _bootstrapFromReference: _, ...emp }) => emp),
    },
    { supabase: supabase as any },
  )

  if ('status' in outcome && outcome.status) {
    throw new Error(outcome.error ?? 'Error en generación')
  }

  const comparisons: Array<Record<string, unknown>> = []
  const improvements: string[] = []

  for (const item of outcome.results ?? []) {
    const ref = refByEmployeeId.get(item.employeeId)
    const genGross = round2(item.result?.accruals.totalAccruals ?? 0)
    const genNet = round2(item.result?.netSalary ?? 0)
    const genBaseSS = round2(item.result?.bases.baseCC ?? 0)
    const refGross = ref ? round2(Number(ref.gross_salary)) : null
    const refNet = ref ? round2(Number(ref.net_pay)) : null
    const refBaseSS = ref ? round2(Number(ref.base_ss)) : null

    const overtime = overtimeContext[item.employeeId]

    const cmp = {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      success: item.success,
      error: item.error ?? null,
      generated: {
        gross: genGross,
        net: genNet,
        baseSS: genBaseSS,
        irpf: round2(item.result?.workerDeductions.irpf ?? 0),
        perceptions: item.nominaPreview?.perceptions ?? [],
        deductions: item.nominaPreview?.deductions ?? [],
        warnings: (item.nominaPreview?.calculation_details as any)?.warnings ?? [],
      },
      overtime: {
        hoursFromFichajes: overtime?.overtimeHours ?? 0,
        daysWithOvertime: overtime?.daysWithOvertime ?? 0,
        totalWorkedHoursFichajes: overtime?.totalWorkedHours ?? 0,
        amountInNomina:
          (item.nominaPreview?.perceptions as Array<{ concept: string; amount: number }> | undefined)?.find(
            (p) => normalizeName(p.concept).includes('HORAS EXTRAORDINARIAS'),
          )?.amount ?? 0,
      },
      reference: ref
        ? {
            document: ref.document_name,
            gross: refGross,
            net: refNet,
            baseSS: refBaseSS,
            perceptions: ref.perceptions ?? [],
            deductions: ref.deductions ?? [],
          }
        : null,
      delta: ref
        ? {
            gross: round2(genGross - (refGross ?? 0)),
            net: round2(genNet - (refNet ?? 0)),
            baseSS: round2(genBaseSS - (refBaseSS ?? 0)),
          }
        : null,
      match: ref
        ? {
            gross: nearEq(genGross, refGross ?? 0),
            net: nearEq(genNet, refNet ?? 0),
            baseSS: nearEq(genBaseSS, refBaseSS ?? 0),
          }
        : null,
      absenceContext: absenceContext[item.employeeId] ?? null,
    }

    comparisons.push(cmp)

    writeFileSync(
      resolve(OUTPUT_DIR, 'json', `${safeFileName(item.employeeName)}.json`),
      JSON.stringify(cmp, null, 2),
    )

    if (item.pdfBytes) {
      const pdfPath = resolve(OUTPUT_DIR, 'pdfs', `GENERATED_${safeFileName(item.employeeName)}_202605.pdf`)
      try {
        writeFileSync(pdfPath, Buffer.from(item.pdfBytes))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('EBUSY')) throw err
        console.warn(`⚠️ No se pudo sobrescribir ${pdfPath} (archivo en uso)`)
      }
    }

    if (!item.success) {
      improvements.push(`❌ ${item.employeeName}: error de generación — ${item.error}`)
    } else if (ref && cmp.delta) {
      const d = cmp.delta as { gross: number; net: number; baseSS: number }
      if (!nearEq(genGross, refGross ?? 0) || !nearEq(genNet, refNet ?? 0)) {
        improvements.push(
          `⚠️ ${item.employeeName}: bruto Δ ${fmt(d.gross)} € · neto Δ ${fmt(d.net)} € · base SS Δ ${fmt(d.baseSS)} €`,
        )
      }
      const refPerceptions = (ref.perceptions ?? []) as Array<{ concept: string; amount: number }>
      const genPerceptions = (item.nominaPreview?.perceptions ?? []) as Array<{ concept: string; amount: number }>
      const refConcepts = new Set(refPerceptions.map((p) => normalizeName(p.concept)))
      for (const p of refPerceptions) {
        const key = normalizeName(p.concept)
        const genLine = genPerceptions.find((g) => normalizeName(g.concept) === key)
        if (!genLine) {
          improvements.push(`   · Falta concepto de gestoría: "${p.concept}" (${fmt(p.amount)} €)`)
        } else if (!nearEq(Number(genLine.amount), Number(p.amount), 1)) {
          improvements.push(
            `   · Concepto "${p.concept}": gestoría ${fmt(p.amount)} € vs motor ${fmt(genLine.amount)} €`,
          )
        }
      }
      for (const g of genPerceptions) {
        if (Number(g.amount) <= 0) continue
        const key = normalizeName(g.concept)
        if (!refConcepts.has(key) && !['SALARIO BASE', 'COMPLEMENTOS SALARIALES', 'GRATIFICACIONES EXTRAORDINARIAS'].includes(key)) {
          improvements.push(`   · Concepto extra del motor (no en gestoría): "${g.concept}" (${fmt(g.amount)} €)`)
        }
      }
    }
  }

  const summaryLines = [
    '# WETRACKS — Prueba motor nóminas mayo 2026',
    '',
    `**Fecha prueba:** ${new Date().toISOString()}`,
    `**Modo:** dry-run (sin escrituras en Supabase)`,
    `**Periodo:** ${periodStart} — ${periodEnd}`,
    `**Empleados probados:** ${comparisons.length}`,
    '',
    '## Resumen numérico',
    '',
    '| Empleado | Bruto gen. | Bruto gest. | Δ | Neto gen. | Neto gest. | Δ | H. extra fichaje | € H. extra | Coincide |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|',
  ]

  for (const c of comparisons) {
    const g = c.generated as { gross: number; net: number }
    const r = c.reference as { gross: number; net: number } | null
    const d = c.delta as { gross: number; net: number } | null
    const m = c.match as { gross: boolean; net: boolean } | null
    const ot = c.overtime as { hoursFromFichajes: number; amountInNomina: number }
    summaryLines.push(
      `| ${c.employeeName} | ${fmt(g.gross)} | ${r ? fmt(r.gross) : '—'} | ${d ? fmt(d.gross) : '—'} | ${fmt(g.net)} | ${r ? fmt(r.net) : '—'} | ${d ? fmt(d.net) : '—'} | ${fmt(ot.hoursFromFichajes)} h | ${fmt(ot.amountInNomina)} | ${m?.gross && m?.net ? '✅' : '❌'} |`,
    )
  }

  summaryLines.push('', '## Hallazgos / mejoras sugeridas', '')
  if (improvements.length === 0) {
    summaryLines.push('- Sin desviaciones relevantes detectadas en esta prueba.')
  } else {
    for (const line of improvements) summaryLines.push(`- ${line}`)
  }

  summaryLines.push(
    '',
    '## Horas extra (fichajes → nómina)',
    '',
    `Se leen los fichajes reales de cada empleado en \`public.registers\` (mismo emparejamiento check_in/check_out que usa el módulo de Tiempo) y se calcula el exceso sobre su jornada diaria estándar (\`weekly_hours\` del contrato ÷ 5 días). El resultado se pasa como \`variables.overtimeHours\` al motor, que ya calcula el importe con la fórmula existente (\`base/30/8 × 1,25\`) y lo añade como concepto "Horas Extraordinarias".`,
    '',
    `**Total horas extra detectadas en fichajes (mayo 2026): ${fmt(totalOvertimeHours)} h.**`,
    '',
  )
  if (totalOvertimeHours === 0) {
    summaryLines.push(
      '- Ninguno de los 7 empleados probados tiene fichajes reales registrados en mayo 2026 en `public.registers` (solo el gerente Iván Arrufat tiene 9 días fichados ese mes, y no forma parte de esta prueba), por lo que las horas extra calculadas son 0 para todos. El mecanismo queda implementado y listo para cuando existan fichajes reales.',
    )
  }

  summaryLines.push(
    '',
    '## Archivos generados',
    '',
    '- PDFs generados (motor): `testing_nominas/wetracks_mayo_2026/pdfs/GENERATED_*.pdf`',
    '- PDFs reales (gestoría): `testing_nominas/wetracks_mayo_2026/pdfs/gestoria/`',
    '- JSON por empleado: `testing_nominas/wetracks_mayo_2026/json/`',
    '- Contexto ausencias/vacaciones/horas extra: `input_context.json`',
    '',
    '## Notas',
    '',
    '- Las nóminas de referencia son las subidas por gestoría (OCR), no generadas por Vacly.',
    '- Los 7 empleados ya tienen contrato real activo y convenio asignado (V Convenio de instalaciones deportivas y gimnasios); solo los pluses propios de empresa (Plus Transporte, Plus Fidelitat, Mentories, Plus Entrenamiento Personal) siguen bootstrapeándose desde la nómina de gestoría.',
    '- El motor puede divergir en conceptos personalizados si no están en convenio/contrato.',
    '- Revisar IRPF: la gestoría puede tener tipos distintos a los resueltos por AEAT offline.',
    '- Horas extra: calculadas desde fichajes reales (`public.registers`); en mayo 2026 no hay fichajes para estos 7 empleados, así que su importe es 0 en esta prueba.',
  )

  writeFileSync(resolve(OUTPUT_DIR, 'ANALISIS.md'), summaryLines.join('\n'))
  writeFileSync(resolve(OUTPUT_DIR, 'json', 'comparison_summary.json'), JSON.stringify(comparisons, null, 2))

  console.log(`✅ Prueba completada: ${comparisons.filter((c) => c.success).length}/${comparisons.length} generadas`)
  console.log(`📁 Salida: ${OUTPUT_DIR}`)
  console.log(`📄 Informe: ${resolve(OUTPUT_DIR, 'ANALISIS.md')}`)
  if (improvements.length) {
    console.log('\n⚠️ Desviaciones detectadas:')
    for (const line of improvements.slice(0, 15)) console.log(`  ${line}`)
    if (improvements.length > 15) console.log(`  ... y ${improvements.length - 15} más (ver ANALISIS.md)`)
  }
}

main().catch((err) => {
  console.error('❌ Error en prueba:', err)
  process.exit(1)
})
