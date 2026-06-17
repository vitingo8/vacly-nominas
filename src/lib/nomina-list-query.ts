/** Parámetros compartidos entre GET /api/nominas y el historial de Ver Nóminas. */

export type NominaSortColumn =
  | 'period_start'
  | 'created_at'
  | 'gross_salary'
  | 'net_pay'
  | 'cost_empresa'
  | 'signed'
  | 'employee_name'
  | 'company_name'

export type NominaSortDir = 'asc' | 'desc'
export type NominaEstadoFilter = '' | 'enviada' | 'firmada'

export const NOMINA_SORT_COLUMNS: NominaSortColumn[] = [
  'period_start',
  'created_at',
  'gross_salary',
  'net_pay',
  'cost_empresa',
  'signed',
  'employee_name',
  'company_name',
]

const SORT_COLUMN_MAP: Record<NominaSortColumn, string> = {
  period_start: 'period_start',
  created_at: 'created_at',
  gross_salary: 'gross_salary',
  net_pay: 'net_pay',
  cost_empresa: 'cost_empresa',
  signed: 'signed',
  employee_name: 'employee->>name',
  company_name: 'company->>name',
}

export function parseNominaSortColumn(value: string | null): NominaSortColumn {
  if (value && NOMINA_SORT_COLUMNS.includes(value as NominaSortColumn)) {
    return value as NominaSortColumn
  }
  return 'period_start'
}

export function parseNominaSortDir(value: string | null): NominaSortDir {
  return value === 'asc' ? 'asc' : 'desc'
}

export function parseNominaEstadoFilter(value: string | null): NominaEstadoFilter {
  if (value === 'enviada' || value === 'firmada') return value
  return ''
}

export function applyNominaListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  params: {
    employeeId?: string | null
    dni?: string | null
    search?: string | null
    periods?: string[]
    dateFrom?: string | null
    dateTo?: string | null
    employeeName?: string | null
    companyName?: string | null
    estado?: NominaEstadoFilter
  },
) {
  let q = query

  if (params.employeeId) {
    q = q.eq('employee_id', params.employeeId)
  }

  const dniTerm = (params.dni || params.search || '').trim()
  if (dniTerm) {
    const pattern = `%${dniTerm}%`
    q = q.or(`dni.ilike.${pattern},employee->>dni.ilike.${pattern},employee->>name.ilike.${pattern}`)
  }

  const employeeName = (params.employeeName || '').trim()
  if (employeeName) {
    q = q.ilike('employee->>name', `%${employeeName}%`)
  }

  const companyName = (params.companyName || '').trim()
  if (companyName) {
    q = q.ilike('company->>name', `%${companyName}%`)
  }

  if (params.estado === 'firmada') {
    q = q.eq('signed', true)
  } else if (params.estado === 'enviada') {
    q = q.eq('signed', false)
  }

  if (params.periods && params.periods.length > 0) {
    const orConditions = params.periods.map((period) => {
      const [year, month] = period.split('-')
      const start = `${year}-${month}-01`
      const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()
      const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
      return `and(period_start.gte.${start},period_start.lte.${end})`
    })
    q = q.or(orConditions.join(','))
  } else {
    if (params.dateFrom) {
      q = q.gte('period_start', params.dateFrom)
    }
    if (params.dateTo) {
      q = q.lte('period_start', params.dateTo)
    }
  }

  return q
}

export function applyNominaListSort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  sortBy: NominaSortColumn,
  sortDir: NominaSortDir,
) {
  const ascending = sortDir === 'asc'
  const orderCol = SORT_COLUMN_MAP[sortBy] || 'period_start'
  let q = query.order(orderCol, { ascending, nullsFirst: false })
  if (sortBy !== 'created_at') {
    q = q.order('created_at', { ascending: false })
  }
  return q
}
