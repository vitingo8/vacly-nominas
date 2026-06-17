import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '../errors'
import { AuditService } from '../audit/audit-service'
import { createCertificateVault } from '../certificate-vault/certificate-vault-service'
import { createDehuAdapter, type FetchedNotification } from './notification-adapter'
import { getCompanyRecipientUserIds } from './recipients'

export interface AdminNotificationRow {
  id: string
  companyId: string
  companyName?: string | null
  provider: string
  externalId: string
  subject: string
  sender: string | null
  concept: string | null
  receivedAt: string
  accessDeadline: string | null
  readAt: string | null
}

export interface SyncResult {
  fetched: number
  stored: number
}

function rowToNotification(row: Record<string, any>): AdminNotificationRow {
  return {
    id: row.id,
    companyId: row.company_id,
    provider: row.provider,
    externalId: row.external_id,
    subject: row.subject,
    sender: row.sender ?? null,
    concept: row.concept ?? null,
    receivedAt: row.received_at,
    accessDeadline: row.access_deadline ?? null,
    readAt: row.read_at ?? null,
  }
}

const NOTIF_COLUMNS =
  'id, company_id, provider, external_id, subject, sender, concept, received_at, access_deadline, read_at'

/**
 * Sincroniza las notificaciones electronicas de una empresa usando su
 * certificado. Persiste las nuevas (idempotente por external_id) y crea un
 * aviso en la tabla `notifications` de vacly-app por cada nueva.
 */
export async function syncCompanyNotifications(
  supabase: SupabaseClient,
  input: { companyId: string; certificateId: string; actorUserId?: string },
): Promise<SyncResult> {
  const audit = new AuditService(supabase)
  const vault = createCertificateVault(supabase, audit)

  const certificate = await vault.useCertificate(
    input.companyId,
    input.certificateId,
    'notifications:dehu:fetch',
    input.actorUserId,
  )

  const adapter = createDehuAdapter()
  const fetched: FetchedNotification[] = await adapter.fetchNotifications({
    companyId: input.companyId,
    holderNif: certificate.holderNif,
    certificate,
  })

  if (!fetched.length) return { fetched: 0, stored: 0 }

  let stored = 0
  for (const n of fetched) {
    const { data, error } = await supabase
      .from('admin_notifications')
      .insert({
        company_id: input.companyId,
        provider: n.provider,
        external_id: n.externalId,
        subject: n.subject,
        sender: n.sender ?? null,
        concept: n.concept ?? null,
        received_at: n.receivedAt,
        access_deadline: n.accessDeadline ?? null,
        certificate_id: input.certificateId,
        metadata: n.metadata ?? {},
      })
      .select('id')
      .maybeSingle()

    if (error) {
      // 23505 = ya existe (duplicado), sincronizacion idempotente.
      if (error.code !== '23505') {
        console.error('[notification-service] insert failed:', error.message)
      }
      continue
    }
    if (data?.id) {
      stored += 1
      await createAppNotificationForArrival(supabase, input.companyId, n, data.id)
    }
  }

  await audit.log({
    companyId: input.companyId,
    eventType: 'notifications_synced',
    actorUserId: input.actorUserId,
    metadata: { provider: 'dehu', fetched: fetched.length, stored },
  })

  return { fetched: fetched.length, stored }
}

/** Crea un aviso en vacly-app (tabla notifications) para los usuarios de la empresa. */
async function createAppNotificationForArrival(
  supabase: SupabaseClient,
  companyId: string,
  notification: FetchedNotification,
  adminNotificationId: string,
): Promise<void> {
  const recipients = await getCompanyRecipientUserIds(supabase, companyId)
  if (recipients.length === 0) return

  for (const userId of recipients) {
    const { error } = await supabase.from('notifications').insert({
      company_id: companyId,
      user_id: userId,
      type: 'admin_notification',
      level: 'warning',
      title: `Nueva notificacion: ${notification.sender || 'Administracion'}`,
      message: notification.subject,
      status: 'pendiente',
      action_url: '/AdminNotificaciones',
      entity_type: 'admin_notification',
      entity_id: adminNotificationId,
      dedupe_key: `admin_notif:${adminNotificationId}`,
      metadata: { provider: notification.provider, externalId: notification.externalId },
    })

    if (error && error.code !== '23505') {
      console.error('[notification-service] app notification failed:', error.message)
    }
  }
}

export async function listCompanyNotifications(
  supabase: SupabaseClient,
  companyId: string,
): Promise<AdminNotificationRow[]> {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select(NOTIF_COLUMNS)
    .eq('company_id', companyId)
    .order('received_at', { ascending: false })

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando notificaciones', error)
  }
  return (data || []).map(rowToNotification)
}

export async function listAgencyNotifications(
  supabase: SupabaseClient,
  agencyCompanyId: string,
): Promise<AdminNotificationRow[]> {
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('company_id, company, company_short')
    .eq('agency_id', agencyCompanyId)

  if (companiesError) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando empresas de la cartera', companiesError)
  }

  const nameById = new Map<string, string>()
  for (const c of companies || []) {
    nameById.set((c as any).company_id, (c as any).company_short || (c as any).company || '')
  }
  const companyIds = [agencyCompanyId, ...(companies || []).map((c: any) => c.company_id)]

  const { data, error } = await supabase
    .from('admin_notifications')
    .select(NOTIF_COLUMNS)
    .in('company_id', companyIds)
    .order('received_at', { ascending: false })

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando notificaciones de la cartera', error)
  }

  return (data || []).map((row) => {
    const n = rowToNotification(row)
    n.companyName = nameById.get(n.companyId) ?? null
    return n
  })
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('admin_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('company_id', companyId)

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error marcando notificacion como leida', error)
  }
}
