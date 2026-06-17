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
 * Adapter DEHu real (PAU / punto de acceso usuario).
 * Requiere el certificado descifrado para autenticarse contra el servicio.
 */
export class ApiDehuAdapter implements NotificationAdapter {
  readonly provider: AdminProvider = 'dehu'

  async fetchNotifications(): Promise<FetchedNotification[]> {
    const mode = getAdminConfig().dehuMode
    throw new Error(
      `Integración DEHu (${mode}) pendiente de implementar contra el servicio PAU/DEHu oficial.`,
    )
  }
}

export function createDehuAdapter(): NotificationAdapter {
  return new ApiDehuAdapter()
}
