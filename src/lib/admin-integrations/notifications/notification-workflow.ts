export const VACLY_NOTIFICATION_STATUSES = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'abierta', label: 'Abierta' },
  { id: 'correo_enviado', label: 'Correo enviado' },
  { id: 'en_tramite', label: 'En trámite' },
  { id: 'cerrada', label: 'Cerrada' },
] as const

export type VaclyNotificationStatus = (typeof VACLY_NOTIFICATION_STATUSES)[number]['id']

export const NOTIFICATION_CATEGORIES = [
  { id: 'laboral', label: 'Laboral' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'impuestos', label: 'Impuestos' },
  { id: 'seguridad_social', label: 'Seguridad Social' },
  { id: 'subvenciones', label: 'Subvenciones' },
  { id: 'sancionador', label: 'Sancionador' },
  { id: 'otro', label: 'Otro' },
] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]['id']

export interface AdminStatusInfo {
  code: string
  label: string
  tone: 'neutral' | 'warning' | 'success' | 'danger'
}

export interface NotificationClassificationInput {
  provider: string
  subject: string
  sender?: string | null
  concept?: string | null
  metadata?: Record<string, unknown>
}

function joinSearchText(input: NotificationClassificationInput): string {
  const meta = input.metadata || {}
  return [
    input.subject,
    input.concept,
    input.sender,
    meta.procedimiento,
    meta.descripcion,
    meta.descripcionProcedimiento,
    meta.descripcionEstado,
    meta.asunto,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function classifyNotificationCategory(
  input: NotificationClassificationInput,
): NotificationCategory {
  const text = joinSearchText(input)

  if (input.provider === 'tgss') {
    if (/afili|baja|alta|cotiz|n[oó]mina|laboral|contrato|desempleo|fogasa|variaci/.test(text)) {
      return 'laboral'
    }
    return 'seguridad_social'
  }

  if (/subvenci|ayuda|incentivo|kit digital/.test(text)) return 'subvenciones'
  if (/sanci[oó]n|multa|recargo|infracci/.test(text)) return 'sancionador'
  if (/irpf|iva|impuesto|tribut|modelo\s*\d+|retenci|autoliquid|hacienda|censal|aeat/.test(text)) {
    return 'impuestos'
  }
  if (/fiscal|contabil|factur|libro registro|cerrada/.test(text)) return 'fiscal'
  if (/seguridad social|tgss|cotiz|affili|inss|laboral|desempleo/.test(text)) return 'seguridad_social'
  if (/contrato|despido|ere|erte|convenio|n[oó]mina|finiquito/.test(text)) return 'laboral'

  if (input.provider === 'aeat') return 'impuestos'
  if (input.provider === 'dehu') return 'otro'
  return 'otro'
}

export function categoryLabel(category: string | null | undefined): string {
  return NOTIFICATION_CATEGORIES.find((c) => c.id === category)?.label || 'Otro'
}

export function vaclyStatusLabel(status: string | null | undefined): string {
  return VACLY_NOTIFICATION_STATUSES.find((s) => s.id === status)?.label || 'Pendiente'
}

export function resolveAdminStatus(
  provider: string,
  metadata?: Record<string, unknown>,
): AdminStatusInfo {
  const meta = metadata || {}

  if (provider === 'aeat') {
    const code = String(meta.estado || 'P').toUpperCase()
    const map: Record<string, AdminStatusInfo> = {
      P: { code, label: 'Pendiente', tone: 'warning' },
      A: { code, label: 'Accedida', tone: 'success' },
      N: { code, label: 'Notificada', tone: 'neutral' },
    }
    return map[code] || { code, label: `Estado ${code}`, tone: 'neutral' }
  }

  if (provider === 'tgss') {
    const code = String(meta.estado ?? '0')
    const desc = String(meta.descripcionEstado || '').trim()
    const map: Record<string, AdminStatusInfo> = {
      '0': { code, label: desc || 'Sin acuse', tone: 'warning' },
      '2': { code, label: desc || 'Aceptada', tone: 'success' },
      '3': { code, label: desc || 'Rechazada', tone: 'danger' },
      '4': { code, label: desc || 'Rechazada por plazo', tone: 'danger' },
    }
    return map[code] || { code, label: desc || `Estado ${code}`, tone: 'neutral' }
  }

  if (provider === 'dehu') {
    const code = String(meta.estado || meta.codigoRespuesta || 'pendiente')
    return { code, label: 'Pendiente DEHú', tone: 'warning' }
  }

  return { code: 'desconocido', label: 'Desconocido', tone: 'neutral' }
}

export function isVaclyStatus(value: string): value is VaclyNotificationStatus {
  return VACLY_NOTIFICATION_STATUSES.some((s) => s.id === value)
}

export function isNotificationCategory(value: string): value is NotificationCategory {
  return NOTIFICATION_CATEGORIES.some((c) => c.id === value)
}

export function isVaclyWorkflowOpen(status: string | null | undefined): boolean {
  return status !== 'cerrada'
}

/** Pendiente ante el organismo (AEAT P, TGSS sin acuse, DEHú…), no el workflow Vacly. */
export function isAdminStatusPending(provider: string, metadata?: Record<string, unknown>): boolean {
  return resolveAdminStatus(provider, metadata).tone === 'warning'
}
