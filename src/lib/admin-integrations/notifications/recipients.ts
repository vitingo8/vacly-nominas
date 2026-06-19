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
 * Empresa cuyos usuarios pueden ser responsables de una notificación de
 * `notificationCompanyId`: usuarios de la gestoría (`agency_id`) si existe;
 * si no, usuarios de la propia empresa.
 */
export async function resolveNotificationTeamCompanyId(
  supabase: SupabaseClient,
  notificationCompanyId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('companies')
    .select('agency_id')
    .eq('company_id', notificationCompanyId)
    .maybeSingle()

  if (error) {
    console.error('[recipients] error resolviendo gestoría de la empresa:', error.message)
    return notificationCompanyId
  }

  const agencyId = (data as { agency_id?: string | null } | null)?.agency_id
  return agencyId || notificationCompanyId
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
  const targetCompanyId = await resolveNotificationTeamCompanyId(supabase, companyId)
  return activeUsersOf(supabase, targetCompanyId)
}