import { TipoContingenciaIT } from './calculadora'
import type { AgreementContext } from './convenio'

type SupabaseLike = {
  from: (table: string) => any
}

interface AbsenceDay {
  day: number
  month: number
  year: number
}

export interface PayrollITAbsence {
  active: boolean
  contingencyType: TipoContingenciaIT
  startDay: number
  endDay: number
  daysInPeriod: number
  absoluteDaysSinceStart: number
  typeId: string
  typeName: string
  sourceRecordId: string | null
}

export interface ITComplementLine {
  concept: string
  amount: number
  days: number
  percentage: number
  source: {
    kind: 'table' | 'input'
    id: string
    key: string
  }
}

export interface ITComplementResult {
  total: number
  lines: ITComplementLine[]
  warnings: string[]
}

interface ITComplementRule {
  sourceKind: 'table' | 'input'
  sourceId: string
  sourceKey: string
  label: string
  row: Record<string, unknown>
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toIso(day: AbsenceDay): string {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
}

function addDays(iso: string, delta: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime()
  const end = new Date(`${endIso}T00:00:00Z`).getTime()
  return Math.floor((end - start) / 86_400_000)
}

function getField(row: Record<string, unknown>, names: string[]): unknown {
  const entries = Object.entries(row)
  for (const name of names) {
    const target = normalizeText(name).replace(/[^a-z0-9]/g, '')
    const found = entries.find(([key]) => normalizeText(key).replace(/[^a-z0-9]/g, '') === target)
    if (found) return found[1]
  }
  return undefined
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const raw = String(value ?? '').replace(',', '.')
  const match = raw.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function parsePercentage(value: unknown): number | null {
  const number = toNumber(value)
  return number === null ? null : number
}

function parseMaxDays(value: unknown): number | null {
  const text = normalizeText(value)
  const firstLeave = text.match(/(\d+)\s*(?:en|para)\s*(?:la\s*)?1/)
  if (firstLeave) return Number(firstLeave[1])
  const firstNumber = text.match(/\d+/)
  return firstNumber ? Number(firstNumber[0]) : null
}

function matchesProvince(ruleProvince: unknown, contextProvince: string): boolean {
  const province = normalizeText(contextProvince)
  const raw = normalizeText(ruleProvince)
  if (!raw || !province) return true
  const tokens = raw.split(/[\/,;|]+|\sy\s/i).map((p) => p.trim()).filter(Boolean)
  return tokens.some((token) => token.includes(province) || province.includes(token))
}

function classifyAbsenceType(name: string): TipoContingenciaIT | null {
  const text = normalizeText(name)
  if (/\b(at|atep)\b/.test(text) || text.includes('accidente') || text.includes('laboral')) {
    return TipoContingenciaIT.ACCIDENTE_TRABAJO
  }
  if (
    text.includes('baja medica') ||
    text.includes('incapacidad temporal') ||
    text.includes('it comun') ||
    text.includes('enfermedad comun') ||
    text.includes('malaltia')
  ) {
    return TipoContingenciaIT.ENFERMEDAD_COMUN
  }
  return null
}

function ruleMatchesContingency(ruleType: unknown, contingencyType: TipoContingenciaIT): boolean {
  const text = normalizeText(ruleType)
  if (!text) return true
  const isHospitalization = text.includes('hospital')
  if (isHospitalization) return false
  if (contingencyType === TipoContingenciaIT.ACCIDENTE_TRABAJO) {
    return /\b(at|atep|ep)\b/.test(text) || text.includes('accidente')
  }
  return (
    /\bec\b/.test(text) ||
    text.includes('enfermedad comun') ||
    text.includes('it') ||
    text.includes('primeros dias')
  )
}

function statutoryPercentageForDay(day: number, contingencyType: TipoContingenciaIT): number {
  if (contingencyType === TipoContingenciaIT.ACCIDENTE_TRABAJO) return 100
  if (day <= 3) return 0
  if (day <= 20) return 60
  return 70
}

function dailyBaseForRule(params: {
  baseText: unknown
  dailyRegulatoryBase: number
  dailySalaryBase: number
}): number {
  const base = normalizeText(params.baseText)
  if (base.includes('salario')) return params.dailySalaryBase
  return params.dailyRegulatoryBase
}

function extractRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
  if (value && typeof value === 'object' && !Array.isArray(value)) return [value as Record<string, unknown>]
  return []
}

export async function resolveApprovedITAbsence(
  supabase: SupabaseLike,
  params: {
    companyId: string
    employeeId: string
    periodStart: string
    periodEnd: string
  },
): Promise<PayrollITAbsence | null> {
  const { data: absenceTypes } = await supabase
    .from('absence_types')
    .select('id, name')
    .eq('company_id', params.companyId)

  const typeNameById = new Map<string, string>()
  for (const type of absenceTypes ?? []) {
    typeNameById.set(String(type.id), String(type.name ?? ''))
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('user_id')
    .eq('id', params.employeeId)
    .maybeSingle()

  const queries = [
    supabase
      .from('absences')
      .select('id, absences, requested_at')
      .eq('company_id', params.companyId)
      .eq('employee_id', params.employeeId)
      .eq('status', 'aprobada')
      .order('requested_at', { ascending: false })
      .limit(1),
  ]

  if (employee?.user_id) {
    queries.push(
      supabase
        .from('absences')
        .select('id, absences, requested_at')
        .eq('company_id', params.companyId)
        .eq('user_id', employee.user_id)
        .eq('status', 'aprobada')
        .order('requested_at', { ascending: false })
        .limit(1),
    )
  }

  const responses = await Promise.all(queries)
  const records = responses
    .flatMap((response) => response.data ?? [])
    .sort((a, b) => new Date(b.requested_at ?? 0).getTime() - new Date(a.requested_at ?? 0).getTime())

  const latest = records[0]
  if (!latest?.absences || typeof latest.absences !== 'object') return null

  const candidates: Array<{
    typeId: string
    typeName: string
    contingencyType: TipoContingenciaIT
    allDays: AbsenceDay[]
    periodDays: AbsenceDay[]
  }> = []

  for (const [typeId, rawValue] of Object.entries(latest.absences as Record<string, unknown>)) {
    const typeName = typeNameById.get(String(typeId)) ?? ''
    const contingencyType = classifyAbsenceType(typeName)
    if (!contingencyType || !rawValue || typeof rawValue !== 'object') continue

    const value = rawValue as {
      aprobados?: AbsenceDay[]
      nuevos?: AbsenceDay[]
      days?: AbsenceDay[]
      deleted?: AbsenceDay[]
    }
    const approved = [
      ...(Array.isArray(value.aprobados) ? value.aprobados : []),
      ...(Array.isArray(value.nuevos) ? value.nuevos : []),
      ...(!Array.isArray(value.aprobados) && !Array.isArray(value.nuevos) && Array.isArray(value.days)
        ? value.days
        : []),
    ]
    const deleted = new Set((Array.isArray(value.deleted) ? value.deleted : []).map(toIso))
    const allDays = approved
      .filter((day) => !deleted.has(toIso(day)))
      .sort((a, b) => toIso(a).localeCompare(toIso(b)))
    const periodDays = allDays.filter((day) => {
      const iso = toIso(day)
      return iso >= params.periodStart && iso <= params.periodEnd
    })

    if (periodDays.length > 0) {
      candidates.push({ typeId: String(typeId), typeName, contingencyType, allDays, periodDays })
    }
  }

  const selected = candidates.sort((a, b) => b.periodDays.length - a.periodDays.length)[0]
  if (!selected) return null

  const allIso = new Set(selected.allDays.map(toIso))
  const periodIso = selected.periodDays.map(toIso).sort()
  const range = [periodIso[0]]
  for (let i = 1; i < periodIso.length; i++) {
    if (periodIso[i] === addDays(range[range.length - 1], 1)) {
      range.push(periodIso[i])
    } else {
      break
    }
  }

  let continuousStart = range[0]
  while (allIso.has(addDays(continuousStart, -1))) {
    continuousStart = addDays(continuousStart, -1)
  }

  const firstDate = new Date(`${range[0]}T00:00:00Z`)
  const lastDate = new Date(`${range[range.length - 1]}T00:00:00Z`)

  return {
    active: true,
    contingencyType: selected.contingencyType,
    startDay: firstDate.getUTCDate(),
    endDay: lastDate.getUTCDate(),
    daysInPeriod: range.length,
    absoluteDaysSinceStart: daysBetween(continuousStart, range[0]) + 1,
    typeId: selected.typeId,
    typeName: selected.typeName,
    sourceRecordId: latest.id ?? null,
  }
}

export async function fetchPreviousDailyRegulatoryBase(
  supabase: SupabaseLike,
  params: {
    companyId: string
    employeeId: string
    periodStart: string
  },
): Promise<number | null> {
  const { data } = await supabase
    .from('nominas')
    .select('base_ss, gross_salary, calculation_details, period_start')
    .eq('company_id', params.companyId)
    .eq('employee_id', params.employeeId)
    .lt('period_start', params.periodStart)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  const base =
    toNumber(data?.base_ss) ??
    toNumber((data?.calculation_details as any)?.bases?.baseCC) ??
    toNumber(data?.gross_salary)

  return base && base > 0 ? round2(base / 30) : null
}

export async function fetchITComplementRules(
  supabase: SupabaseLike,
  context: AgreementContext,
  periodStart: string,
): Promise<ITComplementRule[]> {
  const onDate = new Date(`${periodStart}T00:00:00Z`).getTime()
  const isInForce = (from?: string | null, to?: string | null) => {
    const fromTime = from ? new Date(`${from}T00:00:00Z`).getTime() : -Infinity
    const toTime = to ? new Date(`${to}T00:00:00Z`).getTime() : Infinity
    return onDate >= fromTime && onDate <= toTime
  }

  const [tablesResponse, inputsResponse] = await Promise.all([
    supabase
      .from('v3_rrhh_tables')
      .select('id, key, label, description, rows_json, effective_from, effective_to')
      .eq('doc_id', context.lookup.docId),
    supabase
      .from('v3_rrhh_inputs')
      .select('id, key, label, description, value_json, effective_from, effective_to')
      .eq('doc_id', context.lookup.docId),
  ])

  const rules: ITComplementRule[] = []
  for (const table of tablesResponse.data ?? []) {
    const haystack = normalizeText(`${table.key} ${table.label} ${table.description} ${JSON.stringify(table.rows_json ?? '')}`)
    if (!isInForce(table.effective_from, table.effective_to)) continue
    if (!haystack.includes('it') && !haystack.includes('baja') && !haystack.includes('incapacidad')) continue
    for (const row of extractRows(table.rows_json)) {
      rules.push({
        sourceKind: 'table',
        sourceId: table.id,
        sourceKey: table.key,
        label: table.label ?? table.key,
        row,
      })
    }
  }

  for (const input of inputsResponse.data ?? []) {
    const haystack = normalizeText(`${input.key} ${input.label} ${input.description} ${JSON.stringify(input.value_json ?? '')}`)
    if (!isInForce(input.effective_from, input.effective_to)) continue
    if (!haystack.includes('it') && !haystack.includes('baja') && !haystack.includes('incapacidad')) continue
    for (const row of extractRows(input.value_json)) {
      rules.push({
        sourceKind: 'input',
        sourceId: input.id,
        sourceKey: input.key,
        label: input.label ?? input.key,
        row,
      })
    }
  }

  return rules
}

export function calculateITAgreementComplement(params: {
  rules: ITComplementRule[]
  context: AgreementContext
  absence: PayrollITAbsence
  dailyRegulatoryBase: number
  dailySalaryBase: number
}): ITComplementResult {
  const warnings: string[] = []
  const lines: ITComplementLine[] = []
  const absoluteStart = params.absence.absoluteDaysSinceStart
  const absoluteEnd = absoluteStart + params.absence.daysInPeriod - 1

  for (const rule of params.rules) {
    const type = getField(rule.row, ['tipo_baja', 'tipo de baja', 'contingencia'])
    const province = getField(rule.row, ['provincia', 'ámbito', 'ambito'])
    const percentage = parsePercentage(getField(rule.row, ['complemento', 'porcentaje', 'percent']))
    const fromDay = toNumber(getField(rule.row, ['desde_dia', 'desde día', 'desde']))
    const maxDays = parseMaxDays(getField(rule.row, ['duracion_maxima', 'duración máxima', 'maximo_dias']))

    if (percentage === null || percentage <= 0) continue
    if (!matchesProvince(province, params.context.province)) continue
    if (!ruleMatchesContingency(type, params.absence.contingencyType)) continue

    const firstRuleDay = Math.max(absoluteStart, Math.max(1, Math.round(fromDay ?? 1)))
    const lastRuleDay = maxDays && maxDays > 0
      ? Math.min(absoluteEnd, Math.round((fromDay ?? 1) + maxDays - 1))
      : absoluteEnd
    if (lastRuleDay < firstRuleDay) continue

    const baseText = getField(rule.row, ['base', 'base_calculo', 'base cálculo'])
    const dailyBase = dailyBaseForRule({
      baseText,
      dailyRegulatoryBase: params.dailyRegulatoryBase,
      dailySalaryBase: params.dailySalaryBase,
    })

    let amount = 0
    let appliedDays = 0
    for (let day = firstRuleDay; day <= lastRuleDay; day++) {
      const legalPct = statutoryPercentageForDay(day, params.absence.contingencyType)
      const complementPct = Math.max(0, percentage - legalPct)
      if (complementPct <= 0) continue
      amount += round2((dailyBase * complementPct) / 100)
      appliedDays++
    }

    if (appliedDays > 0 && amount > 0) {
      lines.push({
        concept: `Complemento IT convenio (${String(type ?? rule.label)})`,
        amount: round2(amount),
        days: appliedDays,
        percentage,
        source: {
          kind: rule.sourceKind,
          id: rule.sourceId,
          key: rule.sourceKey,
        },
      })
    }
  }

  if (params.rules.length === 0) {
    warnings.push('Sin reglas de complemento IT resueltas desde v3_rrhh_tables/v3_rrhh_inputs.')
  }

  return {
    total: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
    lines,
    warnings,
  }
}
