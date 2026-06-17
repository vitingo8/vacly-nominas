import { createHash } from 'crypto'
import { getAdminConfig } from '../config'
import type { AdminProvider } from '../types'
import type { DecryptedCertificate } from '../certificate-vault/certificate-vault-service'

/** Notificacion tal y como la devuelve el organismo (antes de persistir). */
export interface FetchedNotification {
  provider: AdminProvider
  externalId: string
  subject: string
  sender?: string
  concept?: string
  receivedAt: string
  accessDeadline?: string
  /** Contenido del PDF/acuse si el adapter lo descarga (base64). */
  documentBase64?: string
  metadata?: Record<string, unknown>
}

export interface NotificationAdapter {
  readonly provider: AdminProvider
  fetchNotifications(input: {
    companyId: string
    holderNif: string | null
    certificate: DecryptedCertificate
  }): Promise<FetchedNotification[]>
}

/**
 * Adapter DEHu simulado: genera notificaciones deterministas a partir del NIF
 * del titular para poder probar el flujo completo sin acceso real al organismo.
 */
export class MockDehuAdapter implements NotificationAdapter {
  readonly provider: AdminProvider = 'dehu'

  async fetchNotifications(input: {
    companyId: string
    holderNif: string | null
    certificate: DecryptedCertificate
  }): Promise<FetchedNotification[]> {
    const seed = createHash('sha256')
      .update(`${input.companyId}:${input.holderNif ?? ''}:${new Date().toISOString().slice(0, 10)}`)
      .digest('hex')

    // 0-2 notificaciones simuladas en funcion del seed (estable por dia).
    const count = parseInt(seed.slice(0, 2), 16) % 3
    const now = Date.now()
    const samples = [
      { sender: 'AEAT - Agencia Tributaria', subject: 'Requerimiento de documentacion', concept: 'Procedimiento de comprobacion' },
      { sender: 'TGSS - Seguridad Social', subject: 'Comunicacion de deuda', concept: 'Reclamacion de cuotas' },
    ]

    return Array.from({ length: count }).map((_, i) => {
      const s = samples[i % samples.length]
      const externalId = `DEHU-${seed.slice(i * 8, i * 8 + 12).toUpperCase()}`
      return {
        provider: 'dehu' as const,
        externalId,
        subject: s.subject,
        sender: s.sender,
        concept: s.concept,
        receivedAt: new Date(now - i * 86400000).toISOString(),
        accessDeadline: new Date(now + (10 - i) * 86400000).toISOString(),
        metadata: { simulated: true },
      }
    })
  }
}

/**
 * Adapter DEHu real (pendiente de implementar contra el servicio del PAU/DEHu).
 * Requiere el certificado descifrado para autenticarse.
 */
export class ApiDehuAdapter implements NotificationAdapter {
  readonly provider: AdminProvider = 'dehu'

  async fetchNotifications(): Promise<FetchedNotification[]> {
    throw new Error(
      'Adapter DEHu real no implementado. Configura DEHU_MODE=mock o implementa la integracion con el servicio DEHu/PAU.',
    )
  }
}

export function createDehuAdapter(): NotificationAdapter {
  return getAdminConfig().dehuMode === 'api' ? new ApiDehuAdapter() : new MockDehuAdapter()
}
