import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext, FetchedNotification } from '../../domain/types'
import type { AdministrativeNotificationsAdapter } from '../../domain/adapter-interface'
import { AdminIntegrationError } from '../../../errors'
import { normalizeNif, parseIsoOrAeatDate } from '../../soap/xml'
import { consultaEnvios, listAuthorizedNifs, type AeatEnvioListItem } from './aeat-ws-envios'

export class AeatNotificationsAdapter implements AdministrativeNotificationsAdapter {
  readonly provider = 'aeat' as const

  async syncNotifications(ctx: AdapterSyncContext): Promise<FetchedNotification[]> {
    const config = getNotificationsConfig()
    if (!config.aeatEnabled) return []

    const holderNif = normalizeNif(ctx.holderNif)
    if (!holderNif) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'El certificado AEAT debe incluir NIF del titular')
    }

    const authorizedNifs = await listAuthorizedNifs(ctx, holderNif)
    const uniqueNifs = Array.from(new Set([holderNif, ...authorizedNifs]))

    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - Math.min(config.syncLookbackDays, 90))

    const all: FetchedNotification[] = []
    for (const nif of uniqueNifs) {
      const envios = await consultaEnvios(ctx, nif, start, end)
      for (const envio of envios) {
        all.push(this.mapEnvioFromConsulta(envio))
      }
    }
    return all
  }

  /** Solo metadatos de Consulta: nunca Acceso/comparecencia en sincronización automática. */
  private mapEnvioFromConsulta(envio: AeatEnvioListItem): FetchedNotification {
    return {
      provider: 'aeat',
      externalId: envio.numeroCertificado,
      subject: envio.asunto,
      sender: 'AEAT',
      receivedAt: parseIsoOrAeatDate(envio.fechaPuestaDisposicion),
      accessDeadline: envio.accessDeadline,
      metadata: {
        estado: envio.estado,
        tipoEnvio: envio.tipoEnvio,
        nifTitular: envio.nifTitular,
        nifDestinatario: envio.nifDestinatario,
      },
    }
  }
}
