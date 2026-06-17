import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext, FetchedNotification } from '../../domain/types'
import type { AdministrativeNotificationsAdapter } from '../../domain/adapter-interface'
import { AdminIntegrationError } from '../../../errors'
import {
  decodeBase64Field,
  extractAllTags,
  extractBlocks,
  extractTag,
  formatAeatDate,
  normalizeNif,
  parseIsoOrAeatDate,
  xmlEscape,
} from '../../soap/xml'
import { assertSoapOk, buildSoapEnvelope, postSoap } from '../../soap/soap-transport'

const NS_PC = 'https://www2.agenciatributaria.gob.es/static_files/common/dep/aduanas/es/aeat/gnno/jdit/ws/PeticionConsulta.xsd'
const NS_PA = 'https://www2.agenciatributaria.gob.es/static_files/common/dep/aduanas/es/aeat/gnno/jdit/ws/PeticionAcceso.xsd'
const NS_PAU = 'https://www2.agenciatributaria.gob.es/static_files/common/dep/aduanas/es/aeat/gnno/jdit/ws/PeticionAutorizados.xsd'

interface AeatEnvioListItem {
  numeroCertificado: string
  estado: string
  asunto: string
  tipoEnvio: string
  fechaPuestaDisposicion: string
  nifTitular?: string
  nifDestinatario?: string
}

export class AeatNotificationsAdapter implements AdministrativeNotificationsAdapter {
  readonly provider = 'aeat' as const

  async syncNotifications(ctx: AdapterSyncContext): Promise<FetchedNotification[]> {
    const config = getNotificationsConfig()
    if (!config.aeatEnabled) return []

    const holderNif = normalizeNif(ctx.holderNif)
    if (!holderNif) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'El certificado AEAT debe incluir NIF del titular')
    }

    const nifs = await this.listAuthorizedNifs(ctx, holderNif)
    const uniqueNifs = Array.from(new Set([holderNif, ...nifs]))

    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - Math.min(config.syncLookbackDays, 90))

    const all: FetchedNotification[] = []
    for (const nif of uniqueNifs) {
      const envios = await this.consultaEnvios(ctx, nif, start, end)
      for (const envio of envios) {
        const fetched = await this.downloadEnvio(ctx, envio)
        if (fetched) all.push(fetched)
      }
    }
    return all
  }

  private async listAuthorizedNifs(ctx: AdapterSyncContext, holderNif: string): Promise<string[]> {
    const config = getNotificationsConfig()
    const body = `<pau:PeticionAutorizados xmlns:pau="${NS_PAU}">
  <pau:PeticionAutorizados/>
</pau:PeticionAutorizados>`

    const res = await postSoap({
      endpoint: config.endpoints.aeatAutorizados,
      envelope: buildSoapEnvelope(body),
      certificate: ctx,
    })
    assertSoapOk(res.body, 'AEAT Autorizados')

    const cod = extractTag(res.body, 'CodRespuesta')
    if (cod && cod !== '0') {
      const msg = extractTag(res.body, 'MsgRespuesta') || 'Error consultando autorizados AEAT'
      throw new AdminIntegrationError('TRANSPORT_ERROR', msg, { codRespuesta: cod })
    }

    return extractAllTags(res.body, 'NifAutorizado')
      .map((n) => normalizeNif(n))
      .filter((n): n is string => !!n && n !== holderNif)
  }

  private async consultaEnvios(
    ctx: AdapterSyncContext,
    nif: string,
    start: Date,
    end: Date,
  ): Promise<AeatEnvioListItem[]> {
    const config = getNotificationsConfig()
    const collected: AeatEnvioListItem[] = []
    let clavePaginacion: string | undefined

    do {
      const body = `<pc:PeticionConsulta xmlns:pc="${NS_PC}">
  <pc:Nif>${xmlEscape(nif)}</pc:Nif>
  <pc:TipoEnvio>T</pc:TipoEnvio>
  <pc:Estado>T</pc:Estado>
  <pc:FechaInicio>${formatAeatDate(start)}</pc:FechaInicio>
  <pc:FechaFin>${formatAeatDate(end)}</pc:FechaFin>
  ${clavePaginacion ? `<pc:ClavePaginacion>${xmlEscape(clavePaginacion)}</pc:ClavePaginacion>` : ''}
</pc:PeticionConsulta>`

      const res = await postSoap({
        endpoint: config.endpoints.aeatConsulta,
        envelope: buildSoapEnvelope(body),
        certificate: ctx,
      })
      assertSoapOk(res.body, 'AEAT Consulta')

      const cod = extractTag(res.body, 'CodRespuesta')
      if (cod && cod !== '0') {
        const msg = extractTag(res.body, 'MsgRespuesta') || 'Error consultando envíos AEAT'
        throw new AdminIntegrationError('TRANSPORT_ERROR', msg, { codRespuesta: cod, nif })
      }

      for (const block of extractBlocks(res.body, 'Envio')) {
        const numeroCertificado = extractTag(block, 'NumeroCertificado')
        if (!numeroCertificado) continue
        collected.push({
          numeroCertificado,
          estado: extractTag(block, 'Estado') || 'P',
          asunto: extractTag(block, 'Asunto') || 'Notificación AEAT',
          tipoEnvio: extractTag(block, 'TipoEnvio') || 'N',
          fechaPuestaDisposicion: extractTag(block, 'FechaPuestaDisposicion') || new Date().toISOString(),
          nifTitular: extractTag(block, 'NifTitular') || undefined,
          nifDestinatario: extractTag(block, 'NifDestinatario') || undefined,
        })
      }

      clavePaginacion = extractTag(res.body, 'ClavePaginacion') || undefined
    } while (clavePaginacion)

    return collected
  }

  private async downloadEnvio(
    ctx: AdapterSyncContext,
    envio: AeatEnvioListItem,
  ): Promise<FetchedNotification | null> {
    const config = getNotificationsConfig()
    const operacion = envio.estado === 'P' ? 'C' : 'D'
    const body = `<pa:PeticionAcceso xmlns:pa="${NS_PA}">
  <pa:NumeroCertificado>${xmlEscape(envio.numeroCertificado)}</pa:NumeroCertificado>
  <pa:Operacion>${operacion}</pa:Operacion>
</pa:PeticionAcceso>`

    const res = await postSoap({
      endpoint: config.endpoints.aeatAcceso,
      envelope: buildSoapEnvelope(body),
      certificate: ctx,
    })
    assertSoapOk(res.body, 'AEAT Acceso')

    const cod = extractTag(res.body, 'CodRespuesta')
    if (cod && cod !== '0') {
      console.warn('[aeat-adapter] acceso fallido', envio.numeroCertificado, extractTag(res.body, 'MsgRespuesta'))
      return null
    }

    const concepto = extractTag(res.body, 'Concepto')
    const sender = extractTag(res.body, 'NombreOficinaRemitente') || 'AEAT'
    const documentPdf = decodeBase64Field(extractTag(res.body, 'DocumentoPDF'))
    const certificationPdf = decodeBase64Field(extractTag(res.body, 'CertificacionPDF'))

    return {
      provider: 'aeat',
      externalId: envio.numeroCertificado,
      subject: envio.asunto,
      sender,
      concept: concepto || undefined,
      receivedAt: parseIsoOrAeatDate(envio.fechaPuestaDisposicion),
      documentPdf,
      certificationPdf,
      metadata: {
        estado: envio.estado,
        tipoEnvio: envio.tipoEnvio,
        nifTitular: envio.nifTitular,
        nifDestinatario: envio.nifDestinatario,
        operacion,
      },
    }
  }
}
