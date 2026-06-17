import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext, FetchedNotification } from '../../domain/types'
import type { AdministrativeNotificationsAdapter } from '../../domain/adapter-interface'
import { AdminIntegrationError } from '../../../errors'
import { decodeBase64Field, extractBlocks, extractTag, parseIsoOrAeatDate } from '../../soap/xml'
import { assertSoapOk, buildSoapEnvelope, postSoap } from '../../soap/soap-transport'

const TNS = 'http://ws.wscn.infra.gi.org/'

interface WscnNotificacion {
  codigo: number
  destinatario?: string
  procedimiento?: string
  nombreAppRazonSocial?: string
  fechaPuestaDisposicion?: string
  fechaFinDisponibilidad?: string
  estado?: number
  descripcionEstado?: string
  bucket: 'propias' | 'autorizadoRED' | 'apoderado'
}

export class TgssWscnAdapter implements AdministrativeNotificationsAdapter {
  readonly provider = 'tgss' as const

  async syncNotifications(ctx: AdapterSyncContext): Promise<FetchedNotification[]> {
    const config = getNotificationsConfig()
    if (!config.tgssEnabled) return []

    const all: FetchedNotification[] = []
    // rol=0 consulta propias + autorizado RED + apoderado en una sola petición.
    const rol = 0
    {
      let nextPropia = 0
      let nextRed = 0
      let nextApoderado = 0
      let hayMas = true

      while (hayMas) {
        const res = await this.consultarListado(ctx, rol, nextPropia, nextRed, nextApoderado)
        hayMas = res.hayMas
        nextPropia = res.nextPropia
        nextRed = res.nextRed
        nextApoderado = res.nextApoderado

        for (const notif of res.notificaciones) {
          const fetched = await this.fetchNotificationPdf(ctx, rol, notif)
          all.push(fetched)
        }
      }
    }

    return all
  }

  private async consultarListado(
    ctx: AdapterSyncContext,
    rol: number,
    codigoSiguienteNotificacionPropia: number,
    codigoSiguienteNotificacionAutorizadoRED: number,
    codigoSiguienteNotificacionApoderado: number,
  ): Promise<{
    hayMas: boolean
    nextPropia: number
    nextRed: number
    nextApoderado: number
    notificaciones: WscnNotificacion[]
  }> {
    const config = getNotificationsConfig()
    const body = `<tns:consultarListadoNotificaciones xmlns:tns="${TNS}">
  <rol>${rol}</rol>
  <codigoSiguienteNotificacionPropia>${codigoSiguienteNotificacionPropia}</codigoSiguienteNotificacionPropia>
  <codigoSiguienteNotificacionAutorizadoRED>${codigoSiguienteNotificacionAutorizadoRED}</codigoSiguienteNotificacionAutorizadoRED>
  <codigoSiguienteNotificacionApoderado>${codigoSiguienteNotificacionApoderado}</codigoSiguienteNotificacionApoderado>
</tns:consultarListadoNotificaciones>`

    const res = await postSoap({
      endpoint: config.endpoints.tgssWscn,
      soapAction: 'urn:consultarListadoNotificaciones',
      envelope: buildSoapEnvelope(body),
      certificate: ctx,
    })
    assertSoapOk(res.body, 'TGSS WSCN')

    const errorCode = extractTag(res.body, 'codigo')
    const errorDesc = extractTag(res.body, 'descripcion')
    if (errorCode && errorCode !== '0') {
      throw new AdminIntegrationError('TRANSPORT_ERROR', errorDesc || `TGSS WSCN error ${errorCode}`, {
        codigo: errorCode,
      })
    }

    const parseBucket = (blocks: string[], bucket: WscnNotificacion['bucket']): WscnNotificacion[] => {
      const out: WscnNotificacion[] = []
      for (const block of blocks) {
        const codigo = Number(extractTag(block, 'codigo') || '0')
        if (!codigo) continue
        out.push({
          codigo,
          destinatario: extractTag(block, 'destinatario') || undefined,
          procedimiento: extractTag(block, 'procedimiento') || undefined,
          nombreAppRazonSocial: extractTag(block, 'nombreAppRazonSocial') || undefined,
          fechaPuestaDisposicion: extractTag(block, 'fechaPuestaDisposicion') || undefined,
          fechaFinDisponibilidad: extractTag(block, 'fechaFinDisponibilidad') || undefined,
          estado: Number(extractTag(block, 'estado') || '0') || undefined,
          descripcionEstado: extractTag(block, 'descripcionEstado') || undefined,
          bucket,
        })
      }
      return out
    }

    const notificaciones = [
      ...parseBucket(extractBlocks(res.body, 'notificacionesPropias'), 'propias'),
      ...parseBucket(extractBlocks(res.body, 'notificacionesAutorizadoRED'), 'autorizadoRED'),
      ...parseBucket(extractBlocks(res.body, 'notificacionesApoderado'), 'apoderado'),
    ]

    return {
      hayMas: extractTag(res.body, 'hayMas') === 'true',
      nextPropia: Number(extractTag(res.body, 'codigoSiguienteNotificacionPropia') || '0'),
      nextRed: Number(extractTag(res.body, 'codigoSiguienteNotificacionAutorizadoRED') || '0'),
      nextApoderado: Number(extractTag(res.body, 'codigoSiguienteNotificacionApoderado') || '0'),
      notificaciones,
    }
  }

  private async fetchNotificationPdf(
    ctx: AdapterSyncContext,
    rol: number,
    notif: WscnNotificacion,
  ): Promise<FetchedNotification> {
    const config = getNotificationsConfig()
    let documentPdf: Buffer | undefined

    if (notif.estado !== undefined && notif.estado !== 0) {
      const body = `<tns:verNotificacionAceptada xmlns:tns="${TNS}">
  <rol>${rol}</rol>
  <codigoNotificacion>${notif.codigo}</codigoNotificacion>
</tns:verNotificacionAceptada>`

      const res = await postSoap({
        endpoint: config.endpoints.tgssWscn,
        soapAction: 'urn:verNotificacionAceptada',
        envelope: buildSoapEnvelope(body),
        certificate: ctx,
      })
      assertSoapOk(res.body, 'TGSS verNotificacionAceptada')
      documentPdf = decodeBase64Field(extractTag(res.body, 'pdfNotificacion'))
    }

    return {
      provider: 'tgss',
      externalId: `${notif.bucket}:${notif.codigo}`,
      subject: notif.procedimiento || notif.descripcionEstado || 'Notificación TGSS',
      sender: notif.nombreAppRazonSocial || 'TGSS',
      concept: notif.destinatario || undefined,
      receivedAt: parseIsoOrAeatDate(notif.fechaPuestaDisposicion),
      accessDeadline: notif.fechaFinDisponibilidad
        ? parseIsoOrAeatDate(notif.fechaFinDisponibilidad)
        : undefined,
      documentPdf,
      metadata: {
        rol,
        bucket: notif.bucket,
        estado: notif.estado,
        descripcionEstado: notif.descripcionEstado,
      },
    }
  }
}
