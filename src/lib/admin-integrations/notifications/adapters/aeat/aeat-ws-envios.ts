import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext } from '../../domain/types'
import { AdminIntegrationError } from '../../../errors'
import {
  decodeBase64Field,
  extractAllTags,
  extractBlocks,
  extractTag,
  formatAeatDate,
  isAeatSuccessCode,
  normalizeNif,
  parseIsoOrAeatDate,
  xmlEscape,
} from '../../soap/xml'
import { assertSoapOk, buildSoapEnvelope, postSoap } from '../../soap/soap-transport'

const NS_PC = 'https://www2.agenciatributaria.gob.es/static_files/common/dep/aduanas/es/aeat/gnno/jdit/ws/PeticionConsulta.xsd'
const NS_PA = 'https://www2.agenciatributaria.gob.es/static_files/common/dep/aduanas/es/aeat/gnno/jdit/ws/PeticionAcceso.xsd'
const NS_PAU = 'https://www2.agenciatributaria.gob.es/static_files/common/dep/aduanas/es/aeat/gnno/jdit/ws/PeticionAutorizados.xsd'
const CONSULTA_VERSION = '1.3'

export interface AeatEnvioListItem {
  numeroCertificado: string
  estado: string
  asunto: string
  tipoEnvio: string
  fechaPuestaDisposicion: string
  nifTitular?: string
  nifDestinatario?: string
  accessDeadline?: string
}

export interface AeatAccesoResult {
  concepto?: string
  sender: string
  documentPdf?: Buffer
  certificationPdf?: Buffer
  fechaAcceso?: string
  fechaEmision?: string
  rawXml: string
}

/** Plazo legal de comparecencia: 10 días hábiles desde la puesta a disposición (notificaciones pendientes). */
export function computeAeatAccessDeadline(receivedAt: string, tipoEnvio: string, estado: string): string | undefined {
  if (tipoEnvio === 'C' || estado !== 'P') return undefined
  const base = new Date(receivedAt)
  if (Number.isNaN(base.getTime())) return undefined
  const deadline = addBusinessDays(base, 10)
  return deadline.toISOString()
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added += 1
  }
  return result
}

function parseEnvioBlock(block: string): AeatEnvioListItem | null {
  const numeroCertificado = extractTag(block, 'NumeroCertificado')
  if (!numeroCertificado) return null

  const metadatos = extractBlocks(block, 'MetadatosPublicos')[0] || block
  const fechaPuestaDisposicion =
    extractTag(metadatos, 'FechaPuestaDisposicion') ||
    extractTag(block, 'FechaPuestaDisposicion') ||
    new Date().toISOString()
  const tipoEnvio = extractTag(metadatos, 'TipoEnvio') || extractTag(block, 'TipoEnvio') || 'N'
  const estado = extractTag(block, 'Estado') || 'P'
  const receivedAt = parseIsoOrAeatDate(fechaPuestaDisposicion)
  const explicitDeadline =
    extractTag(metadatos, 'FechaFinPlazoComparecencia') ||
    extractTag(metadatos, 'FechaLimiteComparecencia') ||
    extractTag(block, 'FechaFinPlazoComparecencia')

  return {
    numeroCertificado,
    estado,
    asunto: extractTag(metadatos, 'Asunto') || extractTag(block, 'Asunto') || 'Notificación AEAT',
    tipoEnvio,
    fechaPuestaDisposicion,
    nifTitular: extractTag(block, 'NifTitular') || extractTag(metadatos, 'NifTitular') || undefined,
    nifDestinatario: extractTag(block, 'NifDestinatario') || extractTag(metadatos, 'NifDestinatario') || undefined,
    accessDeadline: explicitDeadline
      ? parseIsoOrAeatDate(explicitDeadline)
      : computeAeatAccessDeadline(receivedAt, tipoEnvio, estado),
  }
}

export async function listAuthorizedNifs(ctx: AdapterSyncContext, holderNif: string): Promise<string[]> {
  const config = getNotificationsConfig()
  const body = `<pau:PeticionAutorizados xmlns:pau="${NS_PAU}">
  <pau:PeticionAutorizados>${xmlEscape(holderNif)}</pau:PeticionAutorizados>
</pau:PeticionAutorizados>`

  try {
    const res = await postSoap({
      endpoint: config.endpoints.aeatAutorizados,
      envelope: buildSoapEnvelope(body),
      certificate: ctx,
    })
    assertSoapOk(res.body, 'AEAT Autorizados')

    const cod = extractTag(res.body, 'CodRespuesta')
    if (!isAeatSuccessCode(cod)) return []

    return extractAllTags(res.body, 'NifAutorizado')
      .map((n) => normalizeNif(n))
      .filter((n): n is string => !!n && n !== holderNif)
  } catch {
    return []
  }
}

export async function consultaEnvios(
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
  <pc:Version>${CONSULTA_VERSION}</pc:Version>
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
    if (!isAeatSuccessCode(cod)) {
      const msg = extractTag(res.body, 'MsgRespuesta') || 'Error consultando envíos AEAT'
      throw new AdminIntegrationError('TRANSPORT_ERROR', msg, { codRespuesta: cod, nif })
    }

    for (const block of extractBlocks(res.body, 'Envio')) {
      const envio = parseEnvioBlock(block)
      if (envio) collected.push(envio)
    }

    clavePaginacion = extractTag(res.body, 'ClavePaginacion') || undefined
  } while (clavePaginacion)

  return collected
}

export async function accesoEnvio(
  ctx: AdapterSyncContext,
  numeroCertificado: string,
  operacion: 'C' | 'D',
): Promise<AeatAccesoResult> {
  const config = getNotificationsConfig()
  const body = `<pa:PeticionAcceso xmlns:pa="${NS_PA}">
  <pa:NumeroCertificado>${xmlEscape(numeroCertificado)}</pa:NumeroCertificado>
  <pa:Operacion>${operacion}</pa:Operacion>
</pa:PeticionAcceso>`

  const res = await postSoap({
    endpoint: config.endpoints.aeatAcceso,
    envelope: buildSoapEnvelope(body),
    certificate: ctx,
  })
  assertSoapOk(res.body, 'AEAT Acceso')

  const cod = extractTag(res.body, 'CodRespuesta')
  if (!isAeatSuccessCode(cod)) {
    const msg = extractTag(res.body, 'MsgRespuesta') || 'Error accediendo al envío AEAT'
    throw new AdminIntegrationError('TRANSPORT_ERROR', msg, { codRespuesta: cod, numeroCertificado })
  }

  return {
    concepto: extractTag(res.body, 'Concepto') || undefined,
    sender: extractTag(res.body, 'NombreOficinaRemitente') || 'AEAT',
    documentPdf: decodeBase64Field(extractTag(res.body, 'DocumentoPDF')),
    certificationPdf: decodeBase64Field(extractTag(res.body, 'CertificacionPDF')),
    fechaAcceso: extractTag(res.body, 'FechaAcceso') || undefined,
    fechaEmision: extractTag(res.body, 'FechaEmision') || undefined,
    rawXml: res.body,
  }
}
