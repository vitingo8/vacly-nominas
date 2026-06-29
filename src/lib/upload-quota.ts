import type { SupabaseClient } from '@supabase/supabase-js'

/** Máximo de páginas enviadas a procesamiento por empleado activo y mes. */
export const NOMINAS_PAGES_PER_EMPLOYEE = 2

export interface UploadQuota {
  employeeCount: number
  /** Páginas enviadas a procesamiento este mes (aunque no se hayan guardado). */
  usedPages: number
  maxPages: number
  remainingPages: number
  pagesPerEmployee: number
  /** Período del límite mensual en formato YYYY-MM. */
  period: string
}

function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function quotaFromCounts(
  employeeCount: number,
  usedPages: number,
  period: string,
): UploadQuota {
  const maxPages = employeeCount * NOMINAS_PAGES_PER_EMPLOYEE
  return {
    employeeCount,
    usedPages,
    maxPages,
    remainingPages: Math.max(0, maxPages - usedPages),
    pagesPerEmployee: NOMINAS_PAGES_PER_EMPLOYEE,
    period,
  }
}

export async function getUploadQuota(
  supabase: SupabaseClient,
  companyId: string,
): Promise<UploadQuota> {
  const period = currentPeriod()

  const { count: employeeCount, error: employeesError } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'Activo')

  if (employeesError) {
    throw new Error(`No se pudo contar empleados: ${employeesError.message}`)
  }

  const activeEmployees = employeeCount ?? 0

  const { data: usageRow, error: usageError } = await supabase
    .from('nomina_upload_usage')
    .select('pages_attempted')
    .eq('company_id', companyId)
    .eq('period', period)
    .maybeSingle()

  if (usageError) {
    throw new Error(`No se pudo leer el uso de subida: ${usageError.message}`)
  }

  const pagesUsed = usageRow?.pages_attempted ?? 0
  return quotaFromCounts(activeEmployees, pagesUsed, period)
}

export function buildQuotaExceededMessage(
  quota: UploadQuota,
  requestedPages: number,
): string {
  if (quota.employeeCount === 0) {
    return 'No hay empleados activos en la empresa. Añade empleados antes de subir nóminas.'
  }
  return (
    `Límite mensual de procesamiento alcanzado. Este mes (${quota.period}) llevas ${quota.usedPages} de ${quota.maxPages} páginas enviadas a procesar ` +
    `(${quota.employeeCount} empleados × ${quota.pagesPerEmployee} páginas). ` +
    `Este documento tiene ${requestedPages} página(s) y solo quedan ${quota.remainingPages} disponibles este mes. ` +
    `Las páginas cuentan al subir el PDF, aunque no se guarden nóminas.`
  )
}

function parseReserveRpcError(message: string, requestedPages: number): Error {
  if (message.startsWith('NO_EMPLOYEES:')) {
    return new Error(message.slice('NO_EMPLOYEES:'.length))
  }

  if (message.startsWith('QUOTA_EXCEEDED:')) {
    const parts = message.slice('QUOTA_EXCEEDED:'.length).split('|')
    const [employeeCount, usedPages, maxPages, , remainingPages] = parts
    const quota: UploadQuota = {
      employeeCount: Number(employeeCount),
      usedPages: Number(usedPages),
      maxPages: Number(maxPages),
      remainingPages: Number(remainingPages),
      pagesPerEmployee: NOMINAS_PAGES_PER_EMPLOYEE,
      period: currentPeriod(),
    }
    return new Error(buildQuotaExceededMessage(quota, requestedPages))
  }

  if (message.startsWith('INVALID_PAGES:')) {
    return new Error(message.slice('INVALID_PAGES:'.length))
  }

  return new Error(message)
}

function quotaFromRpcPayload(payload: Record<string, unknown>): UploadQuota {
  return {
    employeeCount: Number(payload.employeeCount),
    usedPages: Number(payload.usedPages),
    maxPages: Number(payload.maxPages),
    remainingPages: Number(payload.remainingPages),
    pagesPerEmployee: Number(payload.pagesPerEmployee),
    period: String(payload.period),
  }
}

/**
 * Comprueba la cuota y reserva páginas de forma atómica antes de llamar a Claude.
 * Las páginas reservadas cuentan aunque falle la extracción o no se guarde la nómina.
 */
export async function reserveUploadQuota(
  supabase: SupabaseClient,
  companyId: string,
  pages: number,
): Promise<UploadQuota> {
  if (pages <= 0) {
    return getUploadQuota(supabase, companyId)
  }

  const period = currentPeriod()
  const { data, error } = await supabase.rpc('reserve_nomina_upload_pages', {
    p_company_id: companyId,
    p_period: period,
    p_pages: pages,
    p_pages_per_employee: NOMINAS_PAGES_PER_EMPLOYEE,
  })

  if (error) {
    throw parseReserveRpcError(error.message, pages)
  }

  return quotaFromRpcPayload(data as Record<string, unknown>)
}

/** Solo comprueba (sin reservar). Usar reserveUploadQuota al iniciar procesamiento. */
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
