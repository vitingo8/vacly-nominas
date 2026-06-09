import type { SupabaseClient } from '@supabase/supabase-js'

export type UploadSkipReason = 'duplicate' | 'wrong_company' | 'employee_not_found'

export interface OtherCompanyInfo {
  company_id: string
  name: string
  cif: string
}

export interface TenantCompanyInfo {
  company_id: string
  name: string
  cif: string | null
}

export interface UploadSecurityResult {
  allowed: boolean
  reason?: UploadSkipReason
  message?: string
  existingNominaId?: string
  otherCompany?: OtherCompanyInfo
  expectedCompany?: { name: string; cif: string | null }
  extractedCompany?: { name: string; cif: string | null }
}

/** Normaliza CIF/NIF para comparación (sin espacios, guiones ni puntos). */
export function normalizeCif(cif: string | null | undefined): string | null {
  if (!cif) return null
  const cleaned = String(cif).replace(/[\s.\-/]/g, '').toUpperCase()
  return cleaned.length >= 8 ? cleaned : null
}

function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(s\.?l\.?u?\.?|s\.?a\.?|sociedad limitada|sociedad anonima)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function companyNamesMatch(a: string, b: string): boolean {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (!na || !nb) return true
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (shorter.length >= 6 && longer.startsWith(shorter.slice(0, 6))) return true
  return false
}

export async function getTenantCompany(
  supabase: SupabaseClient,
  companyId: string,
): Promise<TenantCompanyInfo | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('company_id, company, cif')
    .eq('company_id', companyId)
    .maybeSingle()

  if (error || !data) return null
  return {
    company_id: data.company_id,
    name: data.company ?? '',
    cif: data.cif ?? null,
  }
}

export async function findCompanyByCif(
  supabase: SupabaseClient,
  cif: string,
  excludeCompanyId?: string,
): Promise<OtherCompanyInfo | null> {
  const normalized = normalizeCif(cif)
  if (!normalized) return null

  let query = supabase
    .from('companies')
    .select('company_id, company, cif')
    .not('cif', 'is', null)

  if (excludeCompanyId) {
    query = query.neq('company_id', excludeCompanyId)
  }

  const { data: companies, error } = await query
  if (error || !companies?.length) return null

  const match = companies.find((row) => normalizeCif(row.cif) === normalized)
  if (!match) return null

  return {
    company_id: match.company_id,
    name: match.company ?? '',
    cif: match.cif ?? normalized,
  }
}

async function findCompanyByName(
  supabase: SupabaseClient,
  name: string,
  excludeCompanyId: string,
): Promise<OtherCompanyInfo | null> {
  const normalized = normalizeCompanyName(name)
  if (normalized.length < 4) return null

  const { data: companies, error } = await supabase
    .from('companies')
    .select('company_id, company, cif')
    .neq('company_id', excludeCompanyId)

  if (error || !companies?.length) return null

  const match = companies.find((row) => companyNamesMatch(row.company ?? '', name))
  if (!match) return null

  return {
    company_id: match.company_id,
    name: match.company ?? '',
    cif: match.cif ?? '',
  }
}

async function checkDuplicateNomina(
  supabase: SupabaseClient,
  params: {
    companyId: string
    employeeId: string
    periodStart: string
    periodEnd: string
    documentName?: string
    excludeNominaId?: string
  },
): Promise<{ exists: boolean; id?: string; message?: string }> {
  const { companyId, employeeId, periodStart, periodEnd, documentName, excludeNominaId } = params

  const { data: existingByPeriod } = await supabase
    .from('nominas')
    .select('id, document_name')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .is('calculation_details', null)
    .maybeSingle()

  if (existingByPeriod?.id && existingByPeriod.id !== excludeNominaId) {
    return {
      exists: true,
      id: existingByPeriod.id,
      message: `Ya existe una nómina subida para este empleado en el período ${formatPeriodLabel(periodStart, periodEnd)}.`,
    }
  }

  if (documentName) {
    const { data: existingByDoc } = await supabase
      .from('nominas')
      .select('id')
      .eq('company_id', companyId)
      .eq('document_name', documentName)
      .maybeSingle()

    if (existingByDoc?.id && existingByDoc.id !== excludeNominaId) {
      return {
        exists: true,
        id: existingByDoc.id,
        message: `Este documento ya fue subido anteriormente (${documentName}).`,
      }
    }
  }

  return { exists: false }
}

function formatPeriodLabel(start: string, end: string): string {
  try {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return `${fmt(startDate)} — ${fmt(endDate)}`
  } catch {
    return `${start} — ${end}`
  }
}

/**
 * Valida que la nómina pertenezca a la empresa del tenant y que no sea un duplicado.
 */
export async function validateNominaUpload(
  supabase: SupabaseClient,
  params: {
    companyId: string
    employeeId: string
    periodStart: string
    periodEnd: string
    extractedCompany?: { name?: string; cif?: string } | null
    documentName?: string
    tenantCompany?: TenantCompanyInfo | null
    excludeNominaId?: string
    /** Super-admin: omitir comprobación CIF/nombre de empresa (p. ej. pruebas). */
    skipCompanyValidation?: boolean
  },
): Promise<UploadSecurityResult> {
  const {
    companyId,
    employeeId,
    periodStart,
    periodEnd,
    extractedCompany,
    documentName,
    tenantCompany: preloadedTenant,
    excludeNominaId,
    skipCompanyValidation = false,
  } = params

  const tenantCompany = preloadedTenant ?? (await getTenantCompany(supabase, companyId))
  const extractedCif = normalizeCif(extractedCompany?.cif)
  const tenantCif = normalizeCif(tenantCompany?.cif)

  if (
    !skipCompanyValidation &&
    extractedCif &&
    tenantCif &&
    extractedCif !== tenantCif
  ) {
    const otherCompany = await findCompanyByCif(supabase, extractedCif, companyId)
    const tenantLabel = tenantCompany?.name || 'empresa seleccionada'
    return {
      allowed: false,
      reason: 'wrong_company',
      message: otherCompany
        ? `Esta nómina pertenece a otra empresa: ${otherCompany.name} (CIF: ${otherCompany.cif}). Estás subiendo a ${tenantLabel} (CIF: ${tenantCif}).`
        : `El CIF del documento (${extractedCif}) no coincide con ${tenantLabel} (CIF: ${tenantCif}).`,
      otherCompany: otherCompany ?? undefined,
      expectedCompany: tenantCompany
        ? { name: tenantCompany.name, cif: tenantCif }
        : undefined,
      extractedCompany: {
        name: extractedCompany?.name ?? '',
        cif: extractedCif,
      },
    }
  }

  if (
    !skipCompanyValidation &&
    extractedCompany?.name &&
    tenantCompany?.name &&
    !companyNamesMatch(extractedCompany.name, tenantCompany.name)
  ) {
    const otherByName = await findCompanyByName(supabase, extractedCompany.name, companyId)
    if (otherByName) {
      return {
        allowed: false,
        reason: 'wrong_company',
        message: `Esta nómina parece pertenecer a "${otherByName.name}"${otherByName.cif ? ` (CIF: ${otherByName.cif})` : ''}, no a "${tenantCompany.name}".`,
        otherCompany: otherByName,
        expectedCompany: { name: tenantCompany.name, cif: tenantCif },
        extractedCompany: {
          name: extractedCompany.name,
          cif: extractedCif,
        },
      }
    }
  }

  const duplicate = await checkDuplicateNomina(supabase, {
    companyId,
    employeeId,
    periodStart,
    periodEnd,
    documentName,
    excludeNominaId,
  })

  if (duplicate.exists) {
    return {
      allowed: false,
      reason: 'duplicate',
      message: duplicate.message ?? 'Esta nómina ya existe en el sistema.',
      existingNominaId: duplicate.id,
    }
  }

  return { allowed: true }
}
