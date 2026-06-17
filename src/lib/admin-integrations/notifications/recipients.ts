import type { SupabaseClient } from '@supabase/supabase-js'

/** Usuarios activos de una empresa (mismo patron que vacly-app). */
async function activeUsersOf(supabase: SupabaseClient, companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('company_id', companyId)
    .eq('state', true)

  if (error) {
    console.error('[recipients] error resolviendo usuarios de la empresa:', error.message)
    return []
  }
  return (data || []).map((u: any) => u.id).filter(Boolean)
}

/**
 * Destinatarios de los avisos de certificados. El modulo es exclusivo de
 * gestorias, asi que los avisos se dirigen a los usuarios de la gestoria
 * responsable: si la empresa tiene `agency_id`, a los usuarios de esa gestoria;
 * si la empresa es ella misma la gestoria, a sus propios usuarios.
 */
export async function getCompanyRecipientUserIds(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string[]> {
  const { data: company } = await supabase
    .from('companies')
    .select('agency_id, plan')
    .eq('company_id', companyId)
    .maybeSingle()

  const agencyId = (company as any)?.agency_id as string | null | undefined
  const targetCompanyId = agencyId || companyId
  return activeUsersOf(supabase, targetCompanyId)
}
