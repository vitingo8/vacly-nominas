// ============================================================================
// payroll-overtime-engine.ts — Horas extra desde fichajes (public.registers)
// Calcula el exceso de horas trabajadas sobre la jornada diaria estándar.
// ============================================================================

type SupabaseLike = {
  from: (table: string) => any
}

export interface MonthOvertimeSummary {
  overtimeHours: number
  daysWithOvertime: number
  totalWorkedHours: number
  warnings: string[]
}

interface ParsedCheckEvent {
  time: string
  type: string
  category?: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseCheckEvents(raw: unknown): ParsedCheckEvent[] {
  let events: unknown = raw
  if (typeof events === 'string') {
    try {
      events = JSON.parse(events)
    } catch {
      return []
    }
  }
  if (!Array.isArray(events)) return []

  const parsed: ParsedCheckEvent[] = []
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    const record = event as Record<string, unknown>
    let time = typeof record.time === 'string' ? record.time : ''
    if (!time && typeof record.timestamp === 'string') {
      const date = new Date(record.timestamp)
      if (!Number.isNaN(date.getTime())) {
        time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
    }
    if (!time || typeof record.type !== 'string') continue
    parsed.push({
      time,
      type: record.type,
      category: typeof record.category === 'string' ? record.category : null,
    })
  }
  return parsed
}

function calculateWorkedHoursFromCheckEvents(checkEvents: ParsedCheckEvent[]): number {
  const workEvents = checkEvents.filter((e) => !e.category || e.category === 'Trabajo')
  if (workEvents.length < 2) return 0

  const sorted = [...workEvents].sort((a, b) => {
    const [ha, ma] = a.time.split(':').map(Number)
    const [hb, mb] = b.time.split(':').map(Number)
    return ha * 60 + ma - (hb * 60 + mb)
  })

  let totalMinutes = 0
  let currentCheckIn: Date | null = null
  for (const event of sorted) {
    const [hours, minutes] = event.time.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) continue
    if (event.type === 'check_in') {
      currentCheckIn = new Date()
      currentCheckIn.setHours(hours, minutes, 0, 0)
    } else if (event.type === 'check_out' && currentCheckIn) {
      const checkOut = new Date()
      checkOut.setHours(hours, minutes, 0, 0)
      if (checkOut < currentCheckIn) checkOut.setDate(checkOut.getDate() + 1)
      totalMinutes += (checkOut.getTime() - currentCheckIn.getTime()) / (1000 * 60)
      currentCheckIn = null
    }
  }
  return round2(totalMinutes / 60)
}

/**
 * Resuelve horas extra de un empleado en un periodo leyendo sus fichajes.
 */
export async function resolveMonthOvertimeHours(
  supabase: SupabaseLike,
  params: {
    companyId: string
    employeeId: string
    periodStart: string
    periodEnd: string
    dailyStandardHours: number
  },
): Promise<MonthOvertimeSummary> {
  const warnings: string[] = []

  const { data: employee, error: empErr } = await supabase
    .from('employees')
    .select('user_id')
    .eq('id', params.employeeId)
    .eq('company_id', params.companyId)
    .maybeSingle()

  if (empErr) {
    warnings.push(`No se pudo cargar el empleado para fichajes: ${empErr.message}`)
    return { overtimeHours: 0, daysWithOvertime: 0, totalWorkedHours: 0, warnings }
  }

  const userId = (employee as { user_id?: string | null } | null)?.user_id
  if (!userId) {
    return { overtimeHours: 0, daysWithOvertime: 0, totalWorkedHours: 0, warnings }
  }

  const { data, error } = await supabase
    .from('registers')
    .select('work_date, check_events')
    .eq('user_id', userId)
    .gte('work_date', params.periodStart)
    .lte('work_date', params.periodEnd)

  if (error) {
    warnings.push(`Error leyendo fichajes: ${error.message}`)
    return { overtimeHours: 0, daysWithOvertime: 0, totalWorkedHours: 0, warnings }
  }

  const standard = Math.max(0, params.dailyStandardHours)
  let overtimeHours = 0
  let totalWorkedHours = 0
  let daysWithOvertime = 0

  for (const row of (data ?? []) as Array<{ work_date: string; check_events: unknown }>) {
    const events = parseCheckEvents(row.check_events)
    const worked = calculateWorkedHoursFromCheckEvents(events)
    totalWorkedHours += worked
    const extra = Math.max(0, round2(worked - standard))
    if (extra > 0) {
      overtimeHours += extra
      daysWithOvertime += 1
    }
  }

  return {
    overtimeHours: round2(overtimeHours),
    daysWithOvertime,
    totalWorkedHours: round2(totalWorkedHours),
    warnings,
  }
}
