import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '../errors'
import { AuditService } from '../audit/audit-service'
import { createCertificateVault } from '../certificate-vault/certificate-vault-service'
import { getCompanyRecipientUserIds } from './recipients'
import { getNotificationsConfig } from './config'
import { createNotificationAdapters } from './adapters'
import { storeNotificationDocument } from './notification-document-storage'
import type {
  FetchedNotification,
  NotificationSyncResult,
  ProviderSyncResult,
} from './domain/types'

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
  runs: ProviderSyncResult[]
}

const NOTIF_COLUMNS =
  'id, company_id, provider, external_id, subject, sender, concept, received_at, access_deadline, read_at'

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

async function startSyncRun(
  supabase: SupabaseClient,
  companyId: string,
  provider: string,
  certificateId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('admin_notification_sync_runs')
    .insert({
      company_id: companyId,
      provider,
      certificate_id: certificateId,
      status: 'running',
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'No se pudo iniciar sync_run', error)
  }
  return data.id
}

async function finishSyncRun(
  supabase: SupabaseClient,
  runId: string,
  result: ProviderSyncResult,
): Promise<void> {
  await supabase
    .from('admin_notification_sync_runs')
    .update({
      status: result.status,
      fetched: result.fetched,
      stored: result.stored,
      error_code: result.errorCode ?? null,
      error_message: result.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)
}

async function persistNotification(
  supabase: SupabaseClient,
  companyId: string,
  certificateId: string,
  notification: FetchedNotification,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_notifications')
    .insert({
      company_id: companyId,
      provider: notification.provider,
      external_id: notification.externalId,
      subject: notification.subject,
      sender: notification.sender ?? null,
      concept: notification.concept ?? null,
      received_at: notification.receivedAt,
      access_deadline: notification.accessDeadline ?? null,
      certificate_id: certificateId,
      metadata: notification.metadata ?? {},
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return false
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error insertando notificación', error)
  }
  if (!data?.id) return false

  if (notification.documentPdf?.length) {
    const stored = await storeNotificationDocument(supabase, {
      companyId,
      notificationId: data.id,
      provider: notification.provider,
      externalId: notification.externalId,
      fileName: 'notification.pdf',
      content: notification.documentPdf,
    })
    await supabase
      .from('admin_notifications')
      .update({ document_path: stored.storagePath })
      .eq('id', data.id)
  }

  if (notification.certificationPdf?.length) {
    await storeNotificationDocument(supabase, {
      companyId,
      notificationId: data.id,
      provider: notification.provider,
      externalId: notification.externalId,
      fileName: 'certification.pdf',
      content: notification.certificationPdf,
    })
  }

  await createAppNotificationForArrival(supabase, companyId, notification, data.id)
  return true
}

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

/**
 * Sincroniza notificaciones administrativas reales contra AEAT WS Envíos,
 * TGSS WSCN y DEHú/LEMA usando el certificado de la empresa.
 */
export async function syncCompanyNotifications(
  supabase: SupabaseClient,
  input: { companyId: string; certificateId: string; actorUserId?: string },
): Promise<SyncResult> {
  const config = getNotificationsConfig()
  if (!config.enabled) {
    throw new AdminIntegrationError('INTEGRATIONS_DISABLED', 'Sincronización de notificaciones desactivada')
  }

  const audit = new AuditService(supabase)
  const vault = createCertificateVault(supabase, audit)
  const decrypted = await vault.useCertificate(
    input.companyId,
    input.certificateId,
    'notifications:sync',
    input.actorUserId,
  )

  const ctx = {
    companyId: input.companyId,
    certificateId: input.certificateId,
    holderNif: decrypted.holderNif,
    pfx: decrypted.pfx,
    password: decrypted.password,
    actorUserId: input.actorUserId,
  }

  const adapters = createNotificationAdapters()
  if (adapters.length === 0) {
    throw new AdminIntegrationError(
      'INTEGRATIONS_DISABLED',
      'Ningún conector de notificaciones está activo (AEAT, TGSS o DEHú).',
    )
  }

  const runs: ProviderSyncResult[] = []
  let totalFetched = 0
  let totalStored = 0

  for (const adapter of adapters) {
    const runId = await startSyncRun(supabase, input.companyId, adapter.provider, input.certificateId)
    try {
      const fetchedItems = await adapter.syncNotifications(ctx)
      let stored = 0
      for (const item of fetchedItems) {
        const inserted = await persistNotification(supabase, input.companyId, input.certificateId, item)
        if (inserted) stored += 1
      }

      const run: ProviderSyncResult = {
        provider: adapter.provider,
        status: 'success',
        fetched: fetchedItems.length,
        stored,
      }
      await finishSyncRun(supabase, runId, run)
      runs.push(run)
      totalFetched += run.fetched
      totalStored += run.stored
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      const code =
        error instanceof AdminIntegrationError ? error.code : 'PROCESSING_ERROR'
      const run: ProviderSyncResult = {
        provider: adapter.provider,
        status: 'failed',
        fetched: 0,
        stored: 0,
        errorCode: code,
        errorMessage: message,
      }
      await finishSyncRun(supabase, runId, run)
      runs.push(run)
      console.error(`[notification-sync] ${adapter.provider} failed:`, message)
    }
  }

  const anySuccess = runs.some((r) => r.status === 'success')
  const allFailed = runs.every((r) => r.status === 'failed')

  await audit.log({
    companyId: input.companyId,
    eventType: 'notifications_synced',
    actorUserId: input.actorUserId,
    metadata: { runs, fetched: totalFetched, stored: totalStored },
  })

  if (allFailed) {
    const detail = runs
      .map((r) => `${r.provider}: ${r.errorMessage || r.errorCode || 'error desconocido'}`)
      .join(' · ')
    throw new AdminIntegrationError(
      'PROCESSING_ERROR',
      detail || 'No se pudo sincronizar con ningún organismo.',
      { runs },
    )
  }

  if (!anySuccess) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Sincronización sin resultados', { runs })
  }

  return { fetched: totalFetched, stored: totalStored, runs }
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

export async function listNotificationSyncRuns(
  supabase: SupabaseClient,
  companyId: string,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('admin_notification_sync_runs')
    .select('*')
    .eq('company_id', companyId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando sync runs', error)
  }
  return data || []
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

export type { NotificationSyncResult, ProviderSyncResult }
