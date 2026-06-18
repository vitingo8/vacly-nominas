import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext, FetchedNotification } from '../../domain/types'
import type { AdministrativeNotificationsAdapter } from '../../domain/adapter-interface'
import {
  consultarListadoNotificaciones,
  pickTgssDisplaySubject,
  type WscnNotificacion,
} from './tgss-wscn'
import { parseTgssDatetime } from '../../soap/xml'

export class TgssWscnAdapter implements AdministrativeNotificationsAdapter {
  readonly provider = 'tgss' as const

  async syncNotifications(ctx: AdapterSyncContext): Promise<FetchedNotification[]> {
    const config = getNotificationsConfig()
    if (!config.tgssEnabled) return []

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - config.syncLookbackDays)

    const all: FetchedNotification[] = []
    let nextPropia = -1
    let nextRed = -1
    let nextApoderado = -1
    let hayMas = true

    while (hayMas) {
      const res = await consultarListadoNotificaciones(ctx, {
        rol: 0,
        codigoSiguienteNotificacionPropia: nextPropia,
        codigoSiguienteNotificacionAutorizadoRED: nextRed,
        codigoSiguienteNotificacionApoderado: nextApoderado,
      })

      hayMas = res.hayMas
      nextPropia = res.nextPropia
      nextRed = res.nextRed
      nextApoderado = res.nextApoderado

      for (const notif of res.notificaciones) {
        const mapped = this.mapNotificacion(notif)
        if (new Date(mapped.receivedAt) >= cutoff) {
          all.push(mapped)
        }
      }
    }

    return all
  }

  /**
   * Solo metadatos en sync (como AEAT). El PDF se obtiene al abrir/comparecer
   * o con verNotificacionAceptada si ya estaba aceptada en TGSS.
   */
  private mapNotificacion(notif: WscnNotificacion): FetchedNotification {
    return {
      provider: 'tgss',
      externalId: `${notif.bucket}:${notif.codigo}`,
      subject: pickTgssDisplaySubject(notif),
      sender: notif.nombreAppRazonSocial || 'TGSS',
      concept: notif.destinatario || notif.codDestinatario || undefined,
      receivedAt: parseTgssDatetime(notif.fechaPuestaDisposicion),
      accessDeadline: notif.fechaFinDisponibilidad
        ? parseTgssDatetime(notif.fechaFinDisponibilidad)
        : undefined,
      metadata: {
        bucket: notif.bucket,
        estado: notif.estado,
        descripcionEstado: notif.descripcionEstado,
        codDestinatario: notif.codDestinatario,
        identificadorPoderdante: notif.identificadorPoderdante,
        procedimiento: notif.procedimiento,
        descripcion: notif.descripcion,
      },
    }
  }
}
