import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '../errors'
import { AuditService } from '../audit/audit-service'
import { createCertificateVault } from '../certificate-vault/certificate-vault-service'
import { getCompanyRecipientUserIds } from './recipients'
import { getNotificationsConfig } from './config'
import { createNotificationAdapters } from './adapters'
import { storeNotificationDocument } from './notification-document-storage'
import { accesoEnvio, pickAeatDisplaySubject } from './adapters/aeat/aeat-ws-envios'
import {
  aceptarNotificacionTgss,
  parseWscnExternalId,
  verNotificacionAceptada,
  wscnBucketToRol,
} from './adapters/tgss/tgss-wscn'
import { getAdminConfig } from '../config'
import { parseIsoOrAeatDate, normalizeNif } from './soap/xml'
import type {
  FetchedNotification,
  NotificationSyncResult,
  ProviderSyncResult,
} from './domain/types'
import {
  categoryLabel,
  classifyNotificationCategory,
  isNotificationCategory,
  isVaclyStatus,
  isAdminStatusPending,
  resolveAdminStatus,
  vaclyStatusLabel,
  type NotificationCategory,
  type VaclyNotificationStatus,
} from './notification-workflow'

export interface AdminNotificationRow {
  id: string
  companyId: string
  companyName?: string | null
  certificateId?: string | null
  provider: string
  externalId: string
  subject: string
  sender: string | null
  concept: string | null
  receivedAt: string
  accessDeadline: string | null
  readAt: string | null
  hasDocument: boolean
  aeatEstado?: string | null
  tgssEstado?: number | null
  adminStatus: { code: string; label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }
  vaclyStatus: VaclyNotificationStatus
  vaclyStatusLabel: string
  category: NotificationCategory | null
  categoryLabel: string
  assignedUserId: string | null
  assignedUserName: string | null
  assignedUserAvatar: string | null
}

export interface SyncResult {
  fetched: number
  stored: number
  runs: ProviderSyncResult[]
  certificateResults?: Array<{
    certificateId: string
    fetched: number
    stored: number
    runs: ProviderSyncResult[]
    error?: string
  }>
}

const NOTIF_COLUMNS =
  'id, company_id, provider, external_id, subject, sender, concept, received_at, access_deadline, read_at, document_path, certificate_id, metadata, vacly_status, category, assigned_user_id'

interface AssigneeInfo {
  name: string
  avatar: string | null
}

function rowToNotification(
  row: Record<string, any>,
  assigneesById?: Map<string, AssigneeInfo>,
): AdminNotificationRow {
  const metadata = (row.metadata || {}) as Record<string, unknown>
  const category = (row.category as NotificationCategory | null) || null
  const assignedUserId = (row.assigned_user_id as string | null) || null
  const assignee = assignedUserId ? assigneesById?.get(assignedUserId) : undefined
  const vaclyStatus = (row.vacly_status as VaclyNotificationStatus) || 'pendiente'

  return {
    id: row.id,
    companyId: row.company_id,
    certificateId: row.certificate_id ?? null,
    provider: row.provider,
    externalId: row.external_id,
    subject: resolveNotificationSubject(row),
    sender: row.sender ?? null,
    concept: row.concept ?? null,
    receivedAt: row.received_at,
    accessDeadline: row.access_deadline ?? null,
    readAt: row.read_at ?? null,
    hasDocument: !!row.document_path,
    aeatEstado: typeof metadata.estado === 'string' ? metadata.estado : null,
    tgssEstado:
      row.provider === 'tgss' && metadata.estado != null && metadata.estado !== ''
        ? Number(metadata.estado)
        : null,
    adminStatus: resolveAdminStatus(row.provider, metadata),
    vaclyStatus,
    vaclyStatusLabel: vaclyStatusLabel(vaclyStatus),
    category,
    categoryLabel: categoryLabel(category),
    assignedUserId,
    assignedUserName: assignee?.name ?? null,
    assignedUserAvatar: assignee?.avatar ?? null,
  }
}

async function loadAssigneesMap(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, AssigneeInfo>> {
  const unique = [...new Set(userIds.filter(Boolean))]
  const map = new Map<string, AssigneeInfo>()
  if (unique.length === 0) return map

  const { data, error } = await supabase
    .from('users')
    .select('id, nombre, apellidos, avatar')
    .in('id', unique)

  if (error) {
    console.warn('[notification-service] assignees lookup failed:', error.message)
    return map
  }

  for (const user of data || []) {
    const u = user as { id: string; nombre?: string; apellidos?: string; avatar?: string }
    const name = `${String(u.nombre || '').trim()} ${String(u.apellidos || '').trim()}`.trim() || 'Usuario'
    map.set(u.id, { name, avatar: u.avatar || null })
  }
  return map
}

async function mapNotificationRows(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<AdminNotificationRow[]> {
  const assigneeIds = rows
    .map((row) => row.assigned_user_id as string | null)
    .filter((id): id is string => !!id)
  const assigneesById = await loadAssigneesMap(supabase, assigneeIds)
  return rows.map((row) => rowToNotification(row, assigneesById))
}

function resolveNotificationSubject(row: Record<string, any>): string {
  const metadata = (row.metadata || {}) as Record<string, unknown>
  const generic = new Set(['notificación aeat', 'notificacion aeat'])

  const primary = String(row.subject || '').trim()
  if (primary && !generic.has(primary.toLowerCase())) return primary

  const fromMeta = String(metadata.asunto || metadata.subject || '').trim()
  if (fromMeta && !generic.has(fromMeta.toLowerCase())) return fromMeta

  const concept = String(row.concept || metadata.concepto || '').trim()
  if (concept) return concept

  const descripcion = String(metadata.descripcionProcedimiento || '').trim()
  if (descripcion) return descripcion

  if (primary) return primary
  if (row.external_id) return `Notificación ${row.external_id}`
  return 'Notificación administrativa'
}

function mergeNotificationSubject(existing: string | null | undefined, incoming: string): string {
  const generic = new Set(['notificación aeat', 'notificacion aeat', 'notificación administrativa', 'notificacion administrativa'])
  const prev = String(existing || '').trim()
  const next = String(incoming || '').trim()
  if (!next) return prev || 'Notificación administrativa'
  if (generic.has(next.toLowerCase()) && prev && !generic.has(prev.toLowerCase())) return prev
  if (!prev || generic.has(prev.toLowerCase())) return next
  return next
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
  const { data: existing } = await supabase
    .from('admin_notifications')
    .select('id, subject, concept, read_at, document_path, metadata, category')
    .eq('company_id', companyId)
    .eq('provider', notification.provider)
    .eq('external_id', notification.externalId)
    .maybeSingle()

  if (existing?.id) {
    await updateExistingNotification(supabase, existing.id, companyId, certificateId, notification, existing)
    return false
  }

  const category = classifyNotificationCategory({
    provider: notification.provider,
    subject: notification.subject,
    sender: notification.sender,
    concept: notification.concept,
    metadata: notification.metadata,
  })

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
      read_at: null,
      certificate_id: certificateId,
      metadata: notification.metadata ?? {},
      vacly_status: 'pendiente',
      category,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return false
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error insertando notificación', error)
  }
  if (!data?.id) return false

  await storeNotificationPdfs(supabase, companyId, data.id, notification)
  await createAppNotificationForArrival(supabase, companyId, notification, data.id)
  return true
}

async function updateExistingNotification(
  supabase: SupabaseClient,
  notificationId: string,
  companyId: string,
  certificateId: string,
  notification: FetchedNotification,
  existing: {
    subject?: string | null
    concept?: string | null
    read_at?: string | null
    document_path?: string | null
    metadata?: Record<string, unknown>
    category?: string | null
  },
): Promise<void> {
  const mergedMetadata = { ...(existing.metadata || {}), ...(notification.metadata || {}) }
  // No sobrescribir read_at en sync: solo se establece al comparecer/abrir desde el frontend.
  const readAt = existing.read_at ?? null
  const category =
    existing.category ||
    classifyNotificationCategory({
      provider: notification.provider,
      subject: notification.subject,
      sender: notification.sender,
      concept: notification.concept,
      metadata: mergedMetadata,
    })

  await supabase
    .from('admin_notifications')
    .update({
      subject: mergeNotificationSubject(existing.subject, notification.subject),
      sender: notification.sender ?? null,
      concept: notification.concept ?? existing.concept ?? null,
      access_deadline: notification.accessDeadline ?? null,
      read_at: readAt,
      certificate_id: certificateId,
      metadata: mergedMetadata,
      category,
    })
    .eq('id', notificationId)
    .eq('company_id', companyId)

  if (!existing.document_path && notification.documentPdf?.length) {
    await storeNotificationPdfs(supabase, companyId, notificationId, notification)
  }
}

async function storeNotificationPdfs(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
  notification: FetchedNotification,
): Promise<void> {
  if (notification.documentPdf?.length) {
    const stored = await storeNotificationDocument(supabase, {
      companyId,
      notificationId,
      provider: notification.provider,
      externalId: notification.externalId,
      fileName: 'notification.pdf',
      content: notification.documentPdf,
    })
    await supabase
      .from('admin_notifications')
      .update({ document_path: stored.storagePath })
      .eq('id', notificationId)
  }

  if (notification.certificationPdf?.length) {
    await storeNotificationDocument(supabase, {
      companyId,
      notificationId,
      provider: notification.provider,
      externalId: notification.externalId,
      fileName: 'certification.pdf',
      content: notification.certificationPdf,
    })
  }
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

async function resolveCertificateOwnerCompanyId(
  supabase: SupabaseClient,
  certificateId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('administrative_certificates')
    .select('company_id')
    .eq('id', certificateId)
    .maybeSingle()

  if (error || !(data as { company_id?: string } | null)?.company_id) {
    throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
  }
  return (data as { company_id: string }).company_id
}

async function markNotificationOpened(
  supabase: SupabaseClient,
  notificationId: string,
  companyId: string,
  readAt?: string | null,
  vaclyStatus?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (!readAt) patch.read_at = new Date().toISOString()
  if (!vaclyStatus || vaclyStatus === 'pendiente') patch.vacly_status = 'abierta'
  if (Object.keys(patch).length === 0) return

  await supabase
    .from('admin_notifications')
    .update(patch)
    .eq('id', notificationId)
    .eq('company_id', companyId)
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

  const ownerCompanyId = await resolveCertificateOwnerCompanyId(supabase, input.certificateId)

  const audit = new AuditService(supabase)
  const vault = createCertificateVault(supabase, audit)
  const decrypted = await vault.useCertificate(
    ownerCompanyId,
    input.certificateId,
    'notifications:sync',
    input.actorUserId,
  )

  const ctx = {
    companyId: ownerCompanyId,
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
    const runId = await startSyncRun(supabase, ownerCompanyId, adapter.provider, input.certificateId)
    try {
      const fetchedItems = await adapter.syncNotifications(ctx)
      let stored = 0
      for (const item of fetchedItems) {
        const inserted = await persistNotification(supabase, ownerCompanyId, input.certificateId, item)
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
    companyId: ownerCompanyId,
    eventType: 'notifications_synced',
    actorUserId: input.actorUserId,
    metadata: { runs, fetched: totalFetched, stored: totalStored, requestedBy: input.companyId },
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

export async function syncMultipleCompanyNotifications(
  supabase: SupabaseClient,
  input: { companyId: string; certificateIds: string[]; actorUserId?: string },
): Promise<SyncResult> {
  const uniqueIds = [...new Set(input.certificateIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    throw new AdminIntegrationError('VALIDATION_ERROR', 'Selecciona al menos un certificado')
  }

  const certificateResults: NonNullable<SyncResult['certificateResults']> = []
  let totalFetched = 0
  let totalStored = 0
  const allRuns: ProviderSyncResult[] = []
  let anySuccess = false

  for (const certificateId of uniqueIds) {
    try {
      const result = await syncCompanyNotifications(supabase, {
        companyId: input.companyId,
        certificateId,
        actorUserId: input.actorUserId,
      })
      certificateResults.push({
        certificateId,
        fetched: result.fetched,
        stored: result.stored,
        runs: result.runs,
      })
      totalFetched += result.fetched
      totalStored += result.stored
      allRuns.push(...result.runs)
      anySuccess = true
    } catch (error) {
      const message = error instanceof AdminIntegrationError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Error desconocido'
      const runs =
        error instanceof AdminIntegrationError && error.details
          ? ((error.details as { runs?: ProviderSyncResult[] }).runs || [])
          : []
      certificateResults.push({ certificateId, fetched: 0, stored: 0, runs, error: message })
      allRuns.push(...runs)
    }
  }

  if (!anySuccess) {
    const detail = certificateResults.map((r) => r.error).filter(Boolean).join(' · ')
    throw new AdminIntegrationError(
      'PROCESSING_ERROR',
      detail || 'No se pudo sincronizar ningún certificado.',
      { runs: allRuns, certificateResults },
    )
  }

  return {
    fetched: totalFetched,
    stored: totalStored,
    runs: allRuns,
    certificateResults,
  }
}

export async function listNotificationTeamMembers(
  supabase: SupabaseClient,
  agencyCompanyId: string,
): Promise<Array<{ id: string; name: string; avatar: string | null; email: string | null }>> {
  const { data, error } = await supabase
    .from('users')
    .select('id, nombre, apellidos, avatar, email')
    .eq('company_id', agencyCompanyId)
    .eq('state', true)
    .order('nombre')

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando equipo de la gestoría', error)
  }

  return (data || []).map((row) => {
    const u = row as { id: string; nombre?: string; apellidos?: string; avatar?: string; email?: string }
    return {
      id: u.id,
      name: `${String(u.nombre || '').trim()} ${String(u.apellidos || '').trim()}`.trim() || 'Usuario',
      avatar: u.avatar || null,
      email: u.email || null,
    }
  })
}

export async function updateNotificationWorkflow(
  supabase: SupabaseClient,
  input: {
    companyId: string
    notificationId: string
    agencyCompanyId: string
    vaclyStatus?: VaclyNotificationStatus
    category?: NotificationCategory
    assignedUserId?: string | null
  },
): Promise<AdminNotificationRow> {
  const { data: row, error: loadError } = await supabase
    .from('admin_notifications')
    .select(NOTIF_COLUMNS)
    .eq('id', input.notificationId)
    .eq('company_id', input.companyId)
    .maybeSingle()

  if (loadError || !row) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Notificación no encontrada', loadError)
  }

  if (input.assignedUserId) {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', input.assignedUserId)
      .eq('company_id', input.agencyCompanyId)
      .eq('state', true)
      .maybeSingle()

    if (userError || !user) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'Responsable no válido para la gestoría')
    }
  }

  const patch: Record<string, unknown> = {}
  if (input.vaclyStatus !== undefined) {
    if (!isVaclyStatus(input.vaclyStatus)) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'Estado Vacly no válido')
    }
    patch.vacly_status = input.vaclyStatus
  }
  if (input.category !== undefined) {
    if (!isNotificationCategory(input.category)) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'Categoría no válida')
    }
    patch.category = input.category
  }
  if (input.assignedUserId !== undefined) {
    patch.assigned_user_id = input.assignedUserId
  }

  if (Object.keys(patch).length === 0) {
    throw new AdminIntegrationError('VALIDATION_ERROR', 'No hay cambios que guardar')
  }

  const { data: updated, error } = await supabase
    .from('admin_notifications')
    .update(patch)
    .eq('id', input.notificationId)
    .eq('company_id', input.companyId)
    .select(NOTIF_COLUMNS)
    .single()

  if (error || !updated) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error actualizando notificación', error)
  }

  const assigneesById = await loadAssigneesMap(
    supabase,
    updated.assigned_user_id ? [updated.assigned_user_id as string] : [],
  )
  return rowToNotification(updated, assigneesById)
}

async function markVaclyOpened(
  supabase: SupabaseClient,
  notificationId: string,
  companyId: string,
  currentVaclyStatus?: string | null,
): Promise<void> {
  await markNotificationOpened(supabase, notificationId, companyId, undefined, currentVaclyStatus)
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
  return mapNotificationRows(supabase, data || [])
}

export async function listAgencyNotifications(
  supabase: SupabaseClient,
  agencyCompanyId: string,
): Promise<AdminNotificationRow[]> {
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('company_id')
    .eq('agency_id', agencyCompanyId)

  if (companiesError) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando empresas de la cartera', companiesError)
  }

  const companyIds = [agencyCompanyId, ...(companies || []).map((c: any) => c.company_id)]

  const { data: names, error: namesError } = await supabase
    .from('companies')
    .select('company_id, company, company_short, cif')
    .in('company_id', companyIds)

  if (namesError) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error resolviendo nombres de empresa', namesError)
  }

  const nameById = new Map<string, string>()
  const companyIdByCif = new Map<string, string>()
  for (const row of names || []) {
    const label =
      (row as any).company_short ||
      (row as any).company ||
      (row as any).cif ||
      String((row as any).company_id).slice(0, 8)
    nameById.set((row as any).company_id, label)
    const cif = normalizeNif((row as any).cif)
    if (cif) companyIdByCif.set(cif, (row as any).company_id)
  }

  const { data, error } = await supabase
    .from('admin_notifications')
    .select(NOTIF_COLUMNS)
    .in('company_id', companyIds)
    .order('received_at', { ascending: false })

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando notificaciones de la cartera', error)
  }

  const aliasByCertId = new Map<string, string>()
  const aliasByHolderNif = new Map<string, string>()
  const certInfoById = new Map<
    string,
    { companyId: string; holderNif: string | null; holderName: string | null; alias: string | null }
  >()

  const { data: portfolioCerts, error: portfolioCertsError } = await supabase
    .from('administrative_certificates')
    .select('id, company_id, holder_nif, holder_name, alias')
    .in('company_id', companyIds)
    .is('revoked_at', null)

  if (portfolioCertsError) {
    throw new AdminIntegrationError(
      'PROCESSING_ERROR',
      'Error resolviendo certificados de la cartera',
      portfolioCertsError,
    )
  }

  for (const cert of portfolioCerts || []) {
    const c = cert as {
      id: string
      company_id: string
      holder_nif?: string
      holder_name?: string
      alias?: string
    }
    const alias = c.alias?.trim() || null
    certInfoById.set(c.id, {
      companyId: c.company_id,
      holderNif: c.holder_nif ?? null,
      holderName: c.holder_name ?? null,
      alias,
    })
    if (alias) {
      aliasByCertId.set(c.id, alias)
      const nif = normalizeNif(c.holder_nif)
      if (nif && !aliasByHolderNif.has(nif)) aliasByHolderNif.set(nif, alias)
    }
  }
  const assigneeIds = (data || [])
    .map((row) => row.assigned_user_id as string | null)
    .filter((id): id is string => !!id)
  const assigneesById = await loadAssigneesMap(supabase, assigneeIds)

  return (data || []).map((row) => {
    const n = rowToNotification(row, assigneesById)
    const cert = row.certificate_id ? certInfoById.get(row.certificate_id) : null
    const metadata = (row.metadata || {}) as Record<string, unknown>

    // La empresa real de la notificación es la TITULAR del certificado, no la
    // empresa (gestoría) bajo la que se cargó. Los certificados se suben de forma
    // centralizada con company_id de la gestoría, por eso priorizamos el NIF
    // titular del certificado (== CIF de la empresa cliente).
    const certHolderNif = normalizeNif(cert?.holderNif || '')
    const metaNif = normalizeNif(String(metadata.nifTitular || metadata.nifDestinatario || ''))
    const matchedByNif =
      (certHolderNif && companyIdByCif.get(certHolderNif)) ||
      (metaNif && companyIdByCif.get(metaNif)) ||
      null

    // Si el certificado pertenece a una empresa real (no la gestoría), úsala.
    const certCompanyId =
      cert?.companyId && cert.companyId !== agencyCompanyId ? cert.companyId : null

    const displayCompanyId = matchedByNif || certCompanyId
    const certAlias =
      (row.certificate_id ? aliasByCertId.get(row.certificate_id as string) : null) ||
      (certHolderNif ? aliasByHolderNif.get(certHolderNif) : null) ||
      (metaNif ? aliasByHolderNif.get(metaNif) : null) ||
      cert?.alias?.trim() ||
      null

    n.companyName =
      certAlias ||
      (displayCompanyId ? nameById.get(displayCompanyId) : null) ||
      nameById.get(n.companyId) ||
      'Empresa'
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

/** Horas programadas (Europe/Madrid) para sincronización automática vía pg_cron. */
export const NOTIFICATION_AUTO_SYNC_HOURS_MADRID = [4, 11, 16, 19] as const
export const NOTIFICATION_AUTO_SYNC_LABEL = '04:00, 11:00, 16:00 y 19:00 h'

export interface NotificationSyncSummary {
  lastUpdatedAt: string | null
  lastStatus: string | null
  lastStored: number | null
  lastFetched: number | null
  autoSyncLabel: string
}

async function agencyPortfolioCompanyIds(
  supabase: SupabaseClient,
  agencyCompanyId: string,
): Promise<string[]> {
  const { data: companies, error } = await supabase
    .from('companies')
    .select('company_id')
    .eq('agency_id', agencyCompanyId)

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando cartera', error)
  }
  return [agencyCompanyId, ...(companies || []).map((c: { company_id: string }) => c.company_id)]
}

export async function getAgencyNotificationSyncSummary(
  supabase: SupabaseClient,
  agencyCompanyId: string,
): Promise<NotificationSyncSummary> {
  const companyIds = await agencyPortfolioCompanyIds(supabase, agencyCompanyId)
  const { data, error } = await supabase
    .from('admin_notification_sync_runs')
    .select('finished_at, stored, fetched, status')
    .in('company_id', companyIds)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error leyendo última sincronización', error)
  }

  return {
    lastUpdatedAt: (data as { finished_at?: string } | null)?.finished_at ?? null,
    lastStatus: (data as { status?: string } | null)?.status ?? null,
    lastStored: (data as { stored?: number } | null)?.stored ?? null,
    lastFetched: (data as { fetched?: number } | null)?.fetched ?? null,
    autoSyncLabel: NOTIFICATION_AUTO_SYNC_LABEL,
  }
}

export interface CronAgencySyncResult {
  agenciesProcessed: number
  totalStored: number
  totalFetched: number
  errors: Array<{ companyId: string; message: string }>
}

/** Sincroniza notificaciones de todas las gestorías (cron). */
export async function syncAllAgencyNotificationsCron(
  supabase: SupabaseClient,
): Promise<CronAgencySyncResult> {
  const { data: agencies, error } = await supabase
    .from('companies')
    .select('company_id')
    .eq('plan', 'agencia')

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando gestorías', error)
  }

  let agenciesProcessed = 0
  let totalStored = 0
  let totalFetched = 0
  const errors: Array<{ companyId: string; message: string }> = []

  for (const row of agencies || []) {
    const agencyId = (row as { company_id: string }).company_id
    try {
      const portfolioIds = await agencyPortfolioCompanyIds(supabase, agencyId)
      const { data: certs, error: certsError } = await supabase
        .from('administrative_certificates')
        .select('id')
        .in('company_id', portfolioIds)
        .is('revoked_at', null)

      if (certsError) {
        errors.push({ companyId: agencyId, message: certsError.message })
        continue
      }

      const certificateIds = (certs || []).map((c: { id: string }) => c.id)
      if (!certificateIds.length) continue

      const result = await syncMultipleCompanyNotifications(supabase, {
        companyId: agencyId,
        certificateIds,
      })
      agenciesProcessed += 1
      totalStored += result.stored
      totalFetched += result.fetched
    } catch (e) {
      const message = e instanceof AdminIntegrationError ? e.message : e instanceof Error ? e.message : 'Error'
      errors.push({ companyId: agencyId, message })
      console.error(`[notification-cron] agency ${agencyId}:`, message)
    }
  }

  return { agenciesProcessed, totalStored, totalFetched, errors }
}

export async function countPendingAgencyNotifications(
  supabase: SupabaseClient,
  agencyCompanyId: string,
): Promise<number> {
  const companyIds = await agencyPortfolioCompanyIds(supabase, agencyCompanyId)
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('id, provider, metadata')
    .in('company_id', companyIds)

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error contando pendientes', error)
  }
  return (data || []).filter((row) =>
    isAdminStatusPending(
      String(row.provider),
      (row.metadata as Record<string, unknown> | null) ?? undefined,
    ),
  ).length
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
  input?: { actorUserId?: string; certificateId?: string },
): Promise<void> {
  const { data: row, error: loadError } = await supabase
    .from('admin_notifications')
    .select('id, company_id, provider, external_id, subject, read_at, certificate_id, metadata, document_path')
    .eq('id', notificationId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (loadError || !row) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Notificación no encontrada', loadError)
  }

  if (row.read_at) return

  const certificateId = input?.certificateId || row.certificate_id
  if (row.provider === 'aeat') {
    if (!certificateId) {
      throw new AdminIntegrationError(
        'VALIDATION_ERROR',
        'Se requiere certificado para comparecer la notificación en AEAT',
      )
    }

    const certOwnerCompanyId = await resolveCertificateOwnerCompanyId(supabase, certificateId)

    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)
    const decrypted = await vault.useCertificate(
      certOwnerCompanyId,
      certificateId,
      'notifications:comparecer',
      input?.actorUserId,
    )

    const acceso = await accesoEnvio(
      {
        companyId: certOwnerCompanyId,
        certificateId,
        holderNif: decrypted.holderNif,
        pfx: decrypted.pfx,
        password: decrypted.password,
        actorUserId: input?.actorUserId,
      },
      row.external_id,
      'C',
    )

    const readAt = acceso.fechaAcceso ? new Date(parseIsoOrAeatDate(acceso.fechaAcceso)).toISOString() : new Date().toISOString()
    const metadata = { ...(row.metadata as Record<string, unknown>), estado: 'A', fechaAcceso: readAt, operacion: 'C' }
    const subject = pickAeatDisplaySubject({
      consultaAsunto: row.subject,
      concepto: acceso.concepto,
      descripcionProcedimiento: acceso.descripcionProcedimiento,
      externalId: row.external_id,
    })

    await supabase
      .from('admin_notifications')
      .update({
        read_at: readAt,
        vacly_status: 'abierta',
        subject,
        sender: acceso.sender,
        concept: acceso.concepto ?? null,
        metadata: {
          ...metadata,
          asunto: row.subject,
          descripcionProcedimiento: acceso.descripcionProcedimiento,
        },
        certificate_id: certificateId,
      })
      .eq('id', notificationId)
      .eq('company_id', companyId)

    if (acceso.documentPdf?.length) {
      await storeNotificationPdfs(supabase, companyId, notificationId, {
        provider: 'aeat',
        externalId: row.external_id,
        documentPdf: acceso.documentPdf,
        certificationPdf: acceso.certificationPdf,
        subject: '',
        receivedAt: readAt,
      })
    }
    return
  }

  if (row.provider === 'tgss') {
    if (!certificateId) {
      throw new AdminIntegrationError(
        'VALIDATION_ERROR',
        'Se requiere certificado para aceptar la notificación en TGSS',
      )
    }

    const certOwnerCompanyId = await resolveCertificateOwnerCompanyId(supabase, certificateId)
    const metadata = (row.metadata || {}) as Record<string, unknown>
    const { bucket, codigo } = parseWscnExternalId(row.external_id)
    const estado = Number(metadata.estado ?? 0)
    const rol = wscnBucketToRol(bucket)
    const identificadorPoderdante =
      typeof metadata.identificadorPoderdante === 'string' ? metadata.identificadorPoderdante : undefined

    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)
    const decrypted = await vault.useCertificate(
      certOwnerCompanyId,
      certificateId,
      'notifications:comparecer',
      input?.actorUserId,
    )

    const ctx = {
      companyId: certOwnerCompanyId,
      certificateId,
      holderNif: decrypted.holderNif,
      pfx: decrypted.pfx,
      password: decrypted.password,
      actorUserId: input?.actorUserId,
    }

    const params = { rol, codigoNotificacion: codigo, identificadorPoderdante }
    const result =
      estado === 0
        ? await aceptarNotificacionTgss(ctx, params)
        : await verNotificacionAceptada(ctx, params)

    await supabase
      .from('admin_notifications')
      .update({
        read_at: result.readAt,
        vacly_status: 'abierta',
        metadata: {
          ...metadata,
          estado: 2,
          descripcionEstado: 'Notificada por aceptación',
          selladoTiempoAcuse: result.selladoTiempo,
        },
        certificate_id: certificateId,
      })
      .eq('id', notificationId)
      .eq('company_id', companyId)

    if (result.documentPdf?.length) {
      await storeNotificationPdfs(supabase, companyId, notificationId, {
        provider: 'tgss',
        externalId: row.external_id,
        documentPdf: result.documentPdf,
        subject: '',
        receivedAt: result.readAt,
      })
    }
    return
  }

  await supabase
    .from('admin_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('company_id', companyId)
}

type NotificationDocumentInput = {
  actorUserId?: string
  certificateId?: string
  userConfirmed?: boolean
}

async function loadNotificationRow(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
) {
  const { data: row, error: loadError } = await supabase
    .from('admin_notifications')
    .select(
      'id, company_id, provider, external_id, subject, sender, concept, access_deadline, read_at, certificate_id, metadata, document_path, vacly_status',
    )
    .eq('id', notificationId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (loadError || !row) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Notificación no encontrada', loadError)
  }

  return row
}

export async function loadNotificationDocumentBuffer(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
  input?: NotificationDocumentInput,
): Promise<{ buffer: Buffer; fileName: string; comparecida: boolean }> {
  const row = await loadNotificationRow(supabase, companyId, notificationId)
  const config = getAdminConfig()

  if (row.document_path) {
    const { data, error } = await supabase.storage.from(config.storageBucket).download(row.document_path)
    if (error || !data) {
      throw new AdminIntegrationError('STORAGE_ERROR', 'No se pudo descargar el documento', error)
    }
    await markNotificationOpened(
      supabase,
      notificationId,
      companyId,
      row.read_at,
      row.vacly_status as string | null,
    )
    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      fileName: `notificacion-${row.external_id || notificationId}.pdf`,
      comparecida: false,
    }
  }

  if (!input?.userConfirmed) {
    throw new AdminIntegrationError(
      'VALIDATION_ERROR',
      'Debes confirmar la descarga de la notificación desde el frontend',
    )
  }

  if (row.provider !== 'aeat' && row.provider !== 'tgss') {
    throw new AdminIntegrationError('FILE_NOT_FOUND', 'Documento no disponible para esta notificación')
  }

  const certificateId = input?.certificateId || row.certificate_id
  if (!certificateId) {
    throw new AdminIntegrationError(
      'VALIDATION_ERROR',
      `Se requiere certificado para descargar desde ${row.provider.toUpperCase()}`,
    )
  }

  const certOwnerCompanyId = await resolveCertificateOwnerCompanyId(supabase, certificateId)

  const metadata = (row.metadata || {}) as Record<string, unknown>

  if (row.provider === 'tgss') {
    const { bucket, codigo } = parseWscnExternalId(row.external_id)
    const estado = Number(metadata.estado ?? 0)
    const rol = wscnBucketToRol(bucket)
    const identificadorPoderdante =
      typeof metadata.identificadorPoderdante === 'string' ? metadata.identificadorPoderdante : undefined

    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)
    const decrypted = await vault.useCertificate(
      certOwnerCompanyId,
      certificateId,
      'notifications:open',
      input?.actorUserId,
    )

    const ctx = {
      companyId: certOwnerCompanyId,
      certificateId,
      holderNif: decrypted.holderNif,
      pfx: decrypted.pfx,
      password: decrypted.password,
      actorUserId: input?.actorUserId,
    }

    const params = { rol, codigoNotificacion: codigo, identificadorPoderdante }
    const comparecida = estado === 0
    const result = comparecida
      ? await aceptarNotificacionTgss(ctx, params)
      : await verNotificacionAceptada(ctx, params)

    if (!result.documentPdf?.length) {
      throw new AdminIntegrationError('FILE_NOT_FOUND', 'TGSS no devolvió el PDF de la notificación')
    }

    await supabase
      .from('admin_notifications')
      .update({
        read_at: result.readAt,
        vacly_status: 'abierta',
        metadata: {
          ...metadata,
          estado: comparecida ? 2 : metadata.estado,
          descripcionEstado: comparecida ? 'Notificada por aceptación' : metadata.descripcionEstado,
          selladoTiempoAcuse: result.selladoTiempo,
        },
        certificate_id: certificateId,
      })
      .eq('id', notificationId)
      .eq('company_id', companyId)

    await storeNotificationPdfs(supabase, companyId, notificationId, {
      provider: 'tgss',
      externalId: row.external_id,
      documentPdf: result.documentPdf,
      subject: '',
      receivedAt: result.readAt,
    })

    return {
      buffer: result.documentPdf,
      fileName: `notificacion-${row.external_id}.pdf`,
      comparecida,
    }
  }

  const operacion: 'C' | 'D' = metadata.estado === 'A' || row.read_at ? 'D' : 'C'

  const audit = new AuditService(supabase)
  const vault = createCertificateVault(supabase, audit)
  const decrypted = await vault.useCertificate(
    certOwnerCompanyId,
    certificateId,
    'notifications:open',
    input?.actorUserId,
  )

  const acceso = await accesoEnvio(
    {
      companyId: certOwnerCompanyId,
      certificateId,
      holderNif: decrypted.holderNif,
      pfx: decrypted.pfx,
      password: decrypted.password,
      actorUserId: input?.actorUserId,
    },
    row.external_id,
    operacion,
  )

  if (!acceso.documentPdf?.length) {
    throw new AdminIntegrationError('FILE_NOT_FOUND', 'AEAT no devolvió el PDF del envío')
  }

  const readAt =
    operacion === 'C'
      ? acceso.fechaAcceso
        ? new Date(parseIsoOrAeatDate(acceso.fechaAcceso)).toISOString()
        : new Date().toISOString()
      : row.read_at

  const subject = pickAeatDisplaySubject({
    consultaAsunto: row.subject,
    concepto: acceso.concepto,
    descripcionProcedimiento: acceso.descripcionProcedimiento,
    externalId: row.external_id,
  })

  await supabase
    .from('admin_notifications')
    .update({
      read_at: readAt,
      vacly_status: 'abierta',
      subject,
      sender: acceso.sender,
      concept: acceso.concepto ?? null,
      metadata: {
        ...metadata,
        estado: operacion === 'C' ? 'A' : metadata.estado,
        fechaAcceso: operacion === 'C' ? readAt : metadata.fechaAcceso,
        operacion,
        asunto: row.subject,
        descripcionProcedimiento: acceso.descripcionProcedimiento,
      },
      certificate_id: certificateId,
    })
    .eq('id', notificationId)
    .eq('company_id', companyId)

  await storeNotificationPdfs(supabase, companyId, notificationId, {
    provider: 'aeat',
    externalId: row.external_id,
    documentPdf: acceso.documentPdf,
    certificationPdf: acceso.certificationPdf,
    subject: '',
    receivedAt: readAt || new Date().toISOString(),
  })

  return {
    buffer: acceso.documentPdf,
    fileName: `notificacion-${row.external_id}.pdf`,
    comparecida: operacion === 'C',
  }
}

export async function openNotificationDocument(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
  input?: NotificationDocumentInput,
): Promise<{ buffer: Buffer; fileName: string; comparecida: boolean }> {
  return loadNotificationDocumentBuffer(supabase, companyId, notificationId, input)
}

export type { NotificationSyncResult, ProviderSyncResult }
