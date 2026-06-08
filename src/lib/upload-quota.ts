import type { SupabaseClient } from '@supabase/supabase-js'

/** Máximo de páginas de nómina subidas por empleado activo y mes (5 tandas). */
export const NOMINAS_PAGES_PER_EMPLOYEE = 5

export interface UploadQuota {
  employeeCount: number
  usedPages: number
  maxPages: number
  remainingPages: number
  pagesPerEmployee: number
  /** Período del límite mensual en formato YYYY-MM. */
  period: string
}

/** Primer día del mes (UTC) en ISO, para filtrar el consumo del mes en curso. */
function currentMonthStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function getUploadQuota(
  supabase: SupabaseClient,
  companyId: string,
): Promise<UploadQuota> {
  const { count: employeeCount, error: employeesError } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'Activo')

  if (employeesError) {
    throw new Error(`No se pudo contar empleados: ${employeesError.message}`)
  }

  // Solo cuentan las nóminas SUBIDAS por PDF (no las generadas automáticamente,
  // que sí rellenan calculation_details) y solo las del mes en curso.
  const monthStart = currentMonthStartISO()
  const { count: usedPages, error: nominasError } = await supabase
    .from('nominas')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('created_at', monthStart)
    .is('calculation_details', null)

  if (nominasError) {
    throw new Error(`No se pudo contar nóminas: ${nominasError.message}`)
  }

  const activeEmployees = employeeCount ?? 0
  const pagesUsed = usedPages ?? 0
  const maxPages = activeEmployees * NOMINAS_PAGES_PER_EMPLOYEE

  return {
    employeeCount: activeEmployees,
    usedPages: pagesUsed,
    maxPages,
    remainingPages: Math.max(0, maxPages - pagesUsed),
    pagesPerEmployee: NOMINAS_PAGES_PER_EMPLOYEE,
    period: currentPeriod(),
  }
}

export function buildQuotaExceededMessage(
  quota: UploadQuota,
  requestedPages: number,
): string {
  if (quota.employeeCount === 0) {
    return 'No hay empleados activos en la empresa. Añade empleados antes de subir nóminas.'
  }
  return (
    `Límite mensual de subida alcanzado. Este mes (${quota.period}) llevas ${quota.usedPages} de ${quota.maxPages} páginas ` +
    `(${quota.employeeCount} empleados × ${quota.pagesPerEmployee} tandas). ` +
    `Este documento tiene ${requestedPages} página(s) y solo quedan ${quota.remainingPages} disponibles este mes.`
  )
}

export async function assertUploadQuota(
  supabase: SupabaseClient,
  companyId: string,
  additionalPages: number,
): Promise<UploadQuota> {
  const quota = await getUploadQuota(supabase, companyId)

  if (additionalPages <= 0) {
    return quota
  }

  if (quota.remainingPages < additionalPages) {
    throw new Error(buildQuotaExceededMessage(quota, additionalPages))
  }

  return quota
}
