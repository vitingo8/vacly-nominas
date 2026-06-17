import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '../errors'
import { AuditService } from '../audit/audit-service'
import { createCertificateVault } from '../certificate-vault/certificate-vault-service'
import { getCompanyRecipientUserIds } from './recipients'
import { getNotificationsConfig } from './config'
import { createNotificationAdapters } from './adapters'
import { storeNotificationDocument } from './notification-document-storage'
import { accesoEnvio, pickAeatDisplaySubject } from './adapters/aeat/aeat-ws-envios'
import { getAdminConfig } from '../config'
import { parseIsoOrAeatDate } from './soap/xml'
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
  hasDocument: boolean
  aeatEstado?: string | null
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
  'id, company_id, provider, external_id, subject, sender, concept, received_at, access_deadline, read_at, document_path, certificate_id, metadata'

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

function rowToNotification(row: Record<string, any>): AdminNotificationRow {
  const metadata = (row.metadata || {}) as Record<string, unknown>
  return {
    id: row.id,
    companyId: row.company_id,
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
  const { data: existing } = await supabase
    .from('admin_notifications')
    .select('id, subject, concept, read_at, document_path, metadata')
    .eq('company_id', companyId)
    .eq('provider', notification.provider)
    .eq('external_id', notification.externalId)
    .maybeSingle()

  if (existing?.id) {
    await updateExistingNotification(supabase, existing.id, companyId, certificateId, notification, existing)
    return false
  }

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
  },
): Promise<void> {
  const mergedMetadata = { ...(existing.metadata || {}), ...(notification.metadata || {}) }
  // No sobrescribir read_at en sync: solo se establece al comparecer/abrir desde el frontend.
  const readAt = existing.read_at ?? null

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
  for (const row of names || []) {
    const label =
      (row as any).company_short ||
      (row as any).company ||
      (row as any).cif ||
      String((row as any).company_id).slice(0, 8)
    nameById.set((row as any).company_id, label)
  }

  const { data, error } = await supabase
    .from('admin_notifications')
    .select(NOTIF_COLUMNS)
    .in('company_id', companyIds)
    .order('received_at', { ascending: false })

  if (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando notificaciones de la cartera', error)
  }

  const certIds = [
    ...new Set(
      (data || [])
        .map((row) => row.certificate_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ]

  const certCompanyById = new Map<string, string>()
  if (certIds.length > 0) {
    const { data: certs, error: certsError } = await supabase
      .from('administrative_certificates')
      .select('id, company_id')
      .in('id', certIds)

    if (certsError) {
      throw new AdminIntegrationError(
        'PROCESSING_ERROR',
        'Error resolviendo empresas de certificados',
        certsError,
      )
    }

    for (const cert of certs || []) {
      certCompanyById.set((cert as { id: string; company_id: string }).id, (cert as { id: string; company_id: string }).company_id)
    }
  }

  return (data || []).map((row) => {
    const n = rowToNotification(row)
    const certCompanyId = row.certificate_id ? certCompanyById.get(row.certificate_id) : null
    // Cartera gestoría: mostrar la empresa titular del certificado, no donde se cargó la notificación.
    n.companyName = certCompanyId
      ? (nameById.get(certCompanyId) ?? null)
      : (nameById.get(n.companyId) ?? null)
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

    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)
    const decrypted = await vault.useCertificate(
      companyId,
      certificateId,
      'notifications:comparecer',
      input?.actorUserId,
    )

    const acceso = await accesoEnvio(
      {
        companyId,
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
      'id, company_id, provider, external_id, subject, sender, concept, access_deadline, read_at, certificate_id, metadata, document_path',
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

  if (row.provider !== 'aeat') {
    throw new AdminIntegrationError('FILE_NOT_FOUND', 'Documento no disponible para esta notificación')
  }

  const certificateId = input?.certificateId || row.certificate_id
  if (!certificateId) {
    throw new AdminIntegrationError('VALIDATION_ERROR', 'Se requiere certificado para descargar desde AEAT')
  }

  const metadata = (row.metadata || {}) as Record<string, unknown>
  const operacion: 'C' | 'D' = metadata.estado === 'A' || row.read_at ? 'D' : 'C'

  const audit = new AuditService(supabase)
  const vault = createCertificateVault(supabase, audit)
  const decrypted = await vault.useCertificate(
    companyId,
    certificateId,
    'notifications:open',
    input?.actorUserId,
  )

  const acceso = await accesoEnvio(
    {
      companyId,
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
