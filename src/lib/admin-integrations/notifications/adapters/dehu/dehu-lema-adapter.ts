import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext, FetchedNotification } from '../../domain/types'
import type { AdministrativeNotificationsAdapter } from '../../domain/adapter-interface'
import { AdminIntegrationError } from '../../../errors'
import {
  decodeBase64Field,
  extractBlocks,
  extractTag,
  normalizeNif,
  parseIsoOrAeatDate,
  xmlEscape,
} from '../../soap/xml'
import { assertSoapOk, postSoap } from '../../soap/soap-transport'
import { buildWsSecurityEnvelope } from '../../soap/ws-security'

const NS_LOCALIZA = 'http://administracion.gob.es/punto-unico-notificaciones/localiza'
const NS_PETICION = 'http://administracion.gob.es/punto-unico-notificaciones/peticionAcceso'

const SOAP_ACTION_LOCALIZA =
  'https://administracionelectronica.gob.es/notifica/ws/lema/Localiza'
const SOAP_ACTION_PETICION =
  'https://administracionelectronica.gob.es/notifica/ws/lema/PeticionAcceso'

export class DehuLemaAdapter implements AdministrativeNotificationsAdapter {
  readonly provider = 'dehu' as const

  async syncNotifications(ctx: AdapterSyncContext): Promise<FetchedNotification[]> {
    const config = getNotificationsConfig()
    if (!config.dehuEnabled) return []

    const nifDestinatario = normalizeNif(ctx.holderNif)
    if (!nifDestinatario) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'El certificado DEHú debe incluir NIF del titular')
    }

    const envios = await this.localiza(ctx, nifDestinatario)
    const out: FetchedNotification[] = []

    for (const envio of envios) {
      const fetched = await this.peticionAcceso(ctx, envio, nifDestinatario)
      if (fetched) out.push(fetched)
    }

    return out
  }

  private async localiza(
    ctx: AdapterSyncContext,
    nifDestinatario: string,
  ): Promise<Array<{ identificador: string; codigoOrigen: string; concepto: string; asunto: string; organismo: string; fecha: string; tipoEnvio: string }>> {
    const config = getNotificationsConfig()
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - config.syncLookbackDays)

    const bodyInner = `<get:Localiza xmlns:get="${NS_LOCALIZA}">
  <get:nifDestinatario>${xmlEscape(nifDestinatario)}</get:nifDestinatario>
  <get:fechaDesde>${start.toISOString()}</get:fechaDesde>
  <get:fechaHasta>${end.toISOString()}</get:fechaHasta>
  <get:tipoEnvio>2</get:tipoEnvio>
</get:Localiza>`

    const envelope = buildWsSecurityEnvelope(bodyInner, ctx.pfx, ctx.password)
    const res = await postSoap({
      endpoint: config.endpoints.dehuLema,
      soapAction: SOAP_ACTION_LOCALIZA,
      envelope,
      certificate: ctx,
    })
    assertSoapOk(res.body, 'DEHú Localiza')

    const codigoRespuesta = extractTag(res.body, 'codigoRespuesta')
    if (codigoRespuesta && codigoRespuesta !== '0' && codigoRespuesta !== '00') {
      const desc = extractTag(res.body, 'descripcionRespuesta') || 'Error DEHú Localiza'
      throw new AdminIntegrationError('TRANSPORT_ERROR', desc, { codigoRespuesta })
    }

    return extractBlocks(res.body, 'item').map((block) => ({
      identificador: extractTag(block, 'identificador') || '',
      codigoOrigen: extractTag(block, 'codigoOrigen') || '0',
      concepto: extractTag(block, 'concepto') || extractTag(block, 'descripcion') || 'Notificación DEHú',
      asunto: extractTag(block, 'descripcion') || extractTag(block, 'concepto') || 'Notificación DEHú',
      organismo:
        extractTag(extractBlocks(block, 'organismoEmisor')[0] || block, 'nombreOrganismo') || 'Administración',
      fecha: extractTag(block, 'fechaPuestaDisposicion') || new Date().toISOString(),
      tipoEnvio: extractTag(block, 'tipoEnvio') || '2',
    })).filter((e) => e.identificador)
  }

  private async peticionAcceso(
    ctx: AdapterSyncContext,
    envio: {
      identificador: string
      codigoOrigen: string
      concepto: string
      asunto: string
      organismo: string
      fecha: string
    },
    nifReceptor: string,
  ): Promise<FetchedNotification | null> {
    const config = getNotificationsConfig()
    const bodyInner = `<pac:PeticionAcceso xmlns:pac="${NS_PETICION}">
  <pac:identificador>${xmlEscape(envio.identificador)}</pac:identificador>
  <pac:codigoOrigen>${xmlEscape(envio.codigoOrigen)}</pac:codigoOrigen>
  <pac:nifReceptor>${xmlEscape(nifReceptor)}</pac:nifReceptor>
  <pac:nombreReceptor>${xmlEscape(nifReceptor)}</pac:nombreReceptor>
  <pac:evento>1</pac:evento>
  <pac:concepto>${xmlEscape(envio.concepto.slice(0, 255))}</pac:concepto>
</pac:PeticionAcceso>`

    const envelope = buildWsSecurityEnvelope(bodyInner, ctx.pfx, ctx.password)
    const res = await postSoap({
      endpoint: config.endpoints.dehuLema,
      soapAction: SOAP_ACTION_PETICION,
      envelope,
      certificate: ctx,
    })
    assertSoapOk(res.body, 'DEHú PeticionAcceso')

    const codigoRespuesta = extractTag(res.body, 'codigoRespuesta')
    if (codigoRespuesta && codigoRespuesta !== '0' && codigoRespuesta !== '00') {
      console.warn('[dehu-adapter] acceso fallido', envio.identificador, extractTag(res.body, 'descripcionRespuesta'))
      return null
    }

    const documentPdf =
      decodeBase64Field(extractTag(res.body, 'documento')) ||
      decodeBase64Field(extractTag(res.body, 'contenido')) ||
      decodeBase64Field(extractTag(res.body, 'pdf'))

    return {
      provider: 'dehu',
      externalId: `${envio.codigoOrigen}:${envio.identificador}`,
      subject: envio.asunto,
      sender: envio.organismo,
      concept: envio.concepto,
      receivedAt: parseIsoOrAeatDate(envio.fecha),
      documentPdf,
      metadata: {
        identificador: envio.identificador,
        codigoOrigen: envio.codigoOrigen,
      },
    }
  }
}
