/**
 * Auditoría horas extra WETRACKS: Control Horario (7h/día) vs motor nóminas (weekly_hours/5)
 * Ejecutar: npx tsx scripts/audit-wetracks-overtime.ts
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveMonthOvertimeHours } from '../src/lib/payroll-overtime-engine'
import {
  calculateWorkedHoursFromCheckEvents,
  parseCheckEvents,
} from '../../vacly-app/lib/registerCheckEvents'

const COMPANY_ID = 'a92fef9d-34d6-40ac-8870-c5bc688cbf11'

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) throw new Error('Falta .env.local')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function controlHorarioOvertime(
  registers: Array<{ work_date: string; check_events: unknown }>,
  standardDaily = 7,
) {
  let overtimeHours = 0
  let totalWorked = 0
  let daysWithOvertime = 0
  const dayDetails: Array<{ date: string; worked: number; extra: number }> = []

  for (const row of registers) {
    const events = parseCheckEvents(row.check_events).filter(
      (e) => !e.category || e.category === 'Trabajo',
    )
    const worked = calculateWorkedHoursFromCheckEvents(events)
    totalWorked += worked
    const extra = Math.max(0, Math.round((worked - standardDaily) * 100) / 100)
    if (extra > 0) {
      overtimeHours += extra
      daysWithOvertime += 1
    }
    if (worked > 0) dayDetails.push({ date: row.work_date, worked, extra })
  }

  return {
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    daysWithOvertime,
    totalWorkedHours: Math.round(totalWorked * 100) / 100,
    registerDays: registers.length,
    dayDetails,
  }
}

async function main() {
  loadEnv()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const periods = [
    { label: 'Mayo 2026', start: '2026-05-01', end: '2026-05-31' },
    { label: 'Junio 2026 (default UI generación)', start: '2026-06-01', end: '2026-06-30' },
    { label: 'Julio 2026', start: '2026-07-01', end: '2026-07-31' },
  ]

  const { data: employees } = await supabase
    .from('employees')
    .select(`
      id, first_name, last_name, user_id,
      contracts!contracts_employee_id_fkey (weekly_hours, workday_percentage, status)
    `)
    .eq('company_id', COMPANY_ID)
    .eq('status', 'Activo')
    .order('last_name')

  console.log('\n=== WETRACKS — Auditoría horas extra ===\n')

  for (const period of periods) {
    console.log(`\n## ${period.label} (${period.start} → ${period.end})\n`)
    console.log(
      '| Empleado | Fichajes | Trabajadas | Control Horario (7h/d) | Motor (weekly/5) | Jornada std motor |',
    )
    console.log(
      '|---|---:|---:|---:|---:|---:|',
    )

    for (const emp of employees ?? []) {
      const contract = ((emp as any).contracts ?? []).find((c: any) => c.status === 'active')
      const weeklyHours = Number(contract?.weekly_hours ?? 40)
      const dailyMotor = weeklyHours > 0 ? weeklyHours / 5 : 8

      const { data: registers } = await supabase
        .from('registers')
        .select('work_date, check_events')
        .eq('user_id', emp.user_id)
        .gte('work_date', period.start)
        .lte('work_date', period.end)
        .order('work_date')

      const ch = controlHorarioOvertime(registers ?? [], 7)
      const motor = await resolveMonthOvertimeHours(supabase as any, {
        companyId: COMPANY_ID,
        employeeId: emp.id,
        periodStart: period.start,
        periodEnd: period.end,
        dailyStandardHours: dailyMotor,
      })

      const name = `${emp.last_name} ${emp.first_name}`
      console.log(
        `| ${name} | ${ch.registerDays} | ${ch.totalWorkedHours} h | **${ch.overtimeHours} h** | **${motor.overtimeHours} h** | ${dailyMotor} h/d |`,
      )

      if (ch.overtimeHours !== motor.overtimeHours && ch.registerDays > 0) {
        console.log(`  ↳ Δ ${Math.round((motor.overtimeHours - ch.overtimeHours) * 100) / 100} h (motor vs control horario)`)
        for (const d of ch.dayDetails.filter((x) => x.extra > 0 || x.worked > dailyMotor)) {
          const events = parseCheckEvents(
            (registers ?? []).find((r) => r.work_date === d.date)?.check_events,
          )
          const motorExtra = Math.max(0, Math.round((d.worked - dailyMotor) * 100) / 100)
          if (d.extra > 0 || motorExtra > 0) {
            console.log(
              `     ${d.date}: trabajó ${d.worked}h → extra CH(7h)=${d.extra}h, motor(${dailyMotor}h)=${motorExtra}h`,
            )
          }
        }
      }
    }
  }

  console.log('\n--- Notas ---')
  console.log('- Control Horario usa jornada fija de 7h/día (hardcoded en ControlHorario.tsx).')
  console.log('- Motor nóminas usa weekly_hours del contrato ÷ 5 (40h→8h, 20h→4h, 8h→1,6h).')
  console.log('- Sin filas en registers en el periodo → 0h en ambos sistemas.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
