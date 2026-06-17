import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext, FetchedNotification } from '../../domain/types'
import type { AdministrativeNotificationsAdapter } from '../../domain/adapter-interface'
import { AdminIntegrationError } from '../../../errors'
import { normalizeNif, parseIsoOrAeatDate } from '../../soap/xml'
import {
  accesoEnvio,
  consultaEnvios,
  listAuthorizedNifs,
  pickAeatDisplaySubject,
  type AeatEnvioListItem,
} from './aeat-ws-envios'

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
        all.push(await this.mapEnvioFromConsulta(ctx, envio))
      }
    }
    return all
  }

  /**
   * Metadatos de ConsultaEnvios (sin comparecer).
   * Para envíos ya accedidos en AEAT (estado A), enriquecemos con Acceso D
   * para obtener concepto/asunto detallado sin abrir el PDF.
   */
  private async mapEnvioFromConsulta(
    ctx: AdapterSyncContext,
    envio: AeatEnvioListItem,
  ): Promise<FetchedNotification> {
    let concept: string | undefined
    let sender = 'AEAT'
    let descripcionProcedimiento: string | undefined

    if (envio.estado === 'A') {
      try {
        const acceso = await accesoEnvio(ctx, envio.numeroCertificado, 'D')
        concept = acceso.concepto
        descripcionProcedimiento = acceso.descripcionProcedimiento
        sender = acceso.sender
      } catch (error) {
        console.warn(
          '[aeat-adapter] enrich acceso D failed',
          envio.numeroCertificado,
          error instanceof Error ? error.message : error,
        )
      }
    }

    const subject = pickAeatDisplaySubject({
      consultaAsunto: envio.asunto,
      concepto: concept,
      descripcionProcedimiento,
      externalId: envio.numeroCertificado,
    })

    return {
      provider: 'aeat',
      externalId: envio.numeroCertificado,
      subject,
      sender,
      concept: concept || undefined,
      receivedAt: parseIsoOrAeatDate(envio.fechaPuestaDisposicion),
      accessDeadline: envio.accessDeadline,
      metadata: {
        estado: envio.estado,
        tipoEnvio: envio.tipoEnvio,
        nifTitular: envio.nifTitular,
        nifDestinatario: envio.nifDestinatario,
        asunto: envio.asunto,
        descripcionProcedimiento,
      },
    }
  }
}
