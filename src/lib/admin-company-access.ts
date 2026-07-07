import type { SupabaseClient } from '@supabase/supabase-js'

const SUPER_ADMIN_EMAILS = ['soporte@vacly.es']

/** Comprueba si el usuario puede operar sobre la empresa (misma lógica que vacly-app nominas-token). */
export async function userHasCompanyAccess(
  db: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  companyId: string,
): Promise<boolean> {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes((userEmail || '').trim().toLowerCase())

  if (isSuperAdmin) {
    const { data: exists } = await db
      .from('companies')
      .select('company_id')
      .eq('company_id', companyId)
      .maybeSingle()
    return Boolean(exists?.company_id)
  }

  const { data: emp } = await db
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle()
  if (emp?.id) return true

  const { data: target } = await db
    .from('companies')
    .select('agency_id')
    .eq('company_id', companyId)
    .maybeSingle()
  const agencyId = target?.agency_id as string | null | undefined
  if (!agencyId) return false

  const { data: agencyEmp } = await db
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', agencyId)
    .limit(1)
    .maybeSingle()
  return Boolean(agencyEmp?.id)
}
