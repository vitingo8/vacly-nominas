// ============================================================================
// payroll-absence-engine.ts — Carga automática de vacaciones y ausencias
// ----------------------------------------------------------------------------
// Complementa a payroll-it-engine.ts (que resuelve las bajas IT). Aquí se
// agregan, para el periodo de la nómina:
//   - Días de vacaciones disfrutados (tabla `vacations`).
//   - Días de ausencia retribuida (permisos del Art. 37 ET / convenio).
//   - Días de ausencia NO retribuida (descuentan salario y días cotizados).
// Las bajas IT se EXCLUYEN aquí para no duplicar (las trata el motor de IT).
// ============================================================================

type SupabaseLike = {
  from: (table: string) => any
}

interface AbsenceDay {
  day: number
  month: number
  year: number
}

export interface MonthAbsenceSummary {
  vacationDays: number
  paidLeaveDays: number
  unpaidLeaveDays: number
  details: Array<{ typeId: string; typeName: string; days: number; paid: boolean; kind: 'vacation' | 'absence' }>
  warnings: string[]
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

/** ¿El tipo de ausencia corresponde a una IT (que trata el motor de IT)? */
function isITType(name: string): boolean {
  const text = normalizeText(name)
  return (
    /\b(at|atep|ep|it)\b/.test(text) ||
    text.includes('accidente') ||
    text.includes('baja medica') ||
    text.includes('incapacidad') ||
    text.includes('enfermedad comun') ||
    text.includes('malaltia')
  )
}

function collectApprovedDays(rawValue: unknown, periodStart: string, periodEnd: string): number {
  if (!rawValue || typeof rawValue !== 'object') return 0
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
  const inPeriod = approved.filter((d) => {
    const iso = toIso(d)
    return !deleted.has(iso) && iso >= periodStart && iso <= periodEnd
  })
  // Únicos por día (evita contar duplicados).
  return new Set(inPeriod.map(toIso)).size
}

async function latestApprovedRecord(
  supabase: SupabaseLike,
  table: 'absences' | 'vacations',
  column: 'absences' | 'vacations',
  params: { companyId: string; employeeId: string; userId?: string | null },
): Promise<Record<string, unknown> | null> {
  const queries = [
    supabase
      .from(table)
      .select(`id, ${column}, requested_at`)
      .eq('company_id', params.companyId)
      .eq('employee_id', params.employeeId)
      .eq('status', 'aprobada')
      .order('requested_at', { ascending: false })
      .limit(1),
  ]
  if (params.userId) {
    queries.push(
      supabase
        .from(table)
        .select(`id, ${column}, requested_at`)
        .eq('company_id', params.companyId)
        .eq('user_id', params.userId)
        .eq('status', 'aprobada')
        .order('requested_at', { ascending: false })
        .limit(1),
    )
  }
  const responses = await Promise.all(queries)
  const records = responses
    .flatMap((r) => r.data ?? [])
    .sort((a, b) => new Date(b.requested_at ?? 0).getTime() - new Date(a.requested_at ?? 0).getTime())
  return records[0] ?? null
}

/**
 * Resuelve vacaciones y ausencias (no IT) del periodo para un empleado.
 */
export async function resolveMonthAbsences(
  supabase: SupabaseLike,
  params: {
    companyId: string
    employeeId: string
    periodStart: string
    periodEnd: string
  },
): Promise<MonthAbsenceSummary> {
  const summary: MonthAbsenceSummary = {
    vacationDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    details: [],
    warnings: [],
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('user_id')
    .eq('id', params.employeeId)
    .maybeSingle()
  const userId = employee?.user_id ?? null

  // ── Catálogo de tipos de ausencia (flag `pagado`) ──
  const { data: absenceTypes } = await supabase
    .from('absence_types')
    .select('id, name, pagado')
    .eq('company_id', params.companyId)
  const absenceTypeById = new Map<string, { name: string; paid: boolean }>()
  for (const t of absenceTypes ?? []) {
    absenceTypeById.set(String(t.id), { name: String(t.name ?? ''), paid: Boolean(t.pagado) })
  }

  // ── Vacaciones ──
  try {
    const vacRecord = await latestApprovedRecord(supabase, 'vacations', 'vacations', {
      companyId: params.companyId,
      employeeId: params.employeeId,
      userId,
    })
    if (vacRecord?.vacations && typeof vacRecord.vacations === 'object') {
      for (const [typeId, rawValue] of Object.entries(vacRecord.vacations as Record<string, unknown>)) {
        const days = collectApprovedDays(rawValue, params.periodStart, params.periodEnd)
        if (days > 0) {
          summary.vacationDays += days
          summary.details.push({ typeId, typeName: 'Vacaciones', days, paid: true, kind: 'vacation' })
        }
      }
    }
  } catch (err) {
    summary.warnings.push(`No se pudieron leer vacaciones: ${err instanceof Error ? err.message : err}`)
  }

  // ── Ausencias (excluyendo IT) ──
  try {
    const absRecord = await latestApprovedRecord(supabase, 'absences', 'absences', {
      companyId: params.companyId,
      employeeId: params.employeeId,
      userId,
    })
    if (absRecord?.absences && typeof absRecord.absences === 'object') {
      for (const [typeId, rawValue] of Object.entries(absRecord.absences as Record<string, unknown>)) {
        const meta = absenceTypeById.get(String(typeId))
        const typeName = meta?.name ?? ''
        if (isITType(typeName)) continue // lo gestiona el motor de IT
        const days = collectApprovedDays(rawValue, params.periodStart, params.periodEnd)
        if (days <= 0) continue
        const paid = meta?.paid ?? true
        if (paid) summary.paidLeaveDays += days
        else summary.unpaidLeaveDays += days
        summary.details.push({ typeId, typeName, days, paid, kind: 'absence' })
      }
    }
  } catch (err) {
    summary.warnings.push(`No se pudieron leer ausencias: ${err instanceof Error ? err.message : err}`)
  }

  return summary
}
