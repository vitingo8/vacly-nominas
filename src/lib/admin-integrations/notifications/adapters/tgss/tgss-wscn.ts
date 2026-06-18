import forge from 'node-forge'
import { getNotificationsConfig } from '../../config'
import type { AdapterSyncContext } from '../../domain/types'
import { AdminIntegrationError } from '../../../errors'
import {
  decodeBase64Field,
  extractBlocks,
  extractTag,
  parseTgssDatetime,
  xmlEscape,
} from '../../soap/xml'
import { assertSoapOk, postSoap } from '../../soap/soap-transport'
import { buildWsSecurityEnvelope } from '../../soap/ws-security'

const TNS_PRODUCTION = 'http://ws.wscn.infra.gi.org/'
const TNS_SANDBOX = 'http://ws.pruebas.wscn.infra.gi.org/'

export type WscnBucket = 'propias' | 'autorizadoRED' | 'apoderado'

export interface WscnNotificacion {
  codigo: number
  descripcion?: string
  procedimiento?: string
  destinatario?: string
  nombreAppRazonSocial?: string
  codDestinatario?: string
  fechaPuestaDisposicion?: string
  fechaFinDisponibilidad?: string
  estado: number
  descripcionEstado?: string
  bucket: WscnBucket
  identificadorPoderdante?: string
}

export interface WscnAcceptResult {
  documentPdf?: Buffer
  selladoTiempo?: string
  readAt: string
}

export function getWscnNamespace(): string {
  const config = getNotificationsConfig()
  return config.environment === 'sandbox' ? TNS_SANDBOX : TNS_PRODUCTION
}

export function wscnBucketToRol(bucket: WscnBucket): number {
  switch (bucket) {
    case 'propias':
      return 1
    case 'autorizadoRED':
      return 2
    case 'apoderado':
      return 3
    default:
      return 1
  }
}

export function parseWscnExternalId(externalId: string): {
  bucket: WscnBucket
  codigo: number
} {
  const [bucket, codeRaw] = externalId.split(':')
  const codigo = Number(codeRaw || '0')
  const validBuckets: WscnBucket[] = ['propias', 'autorizadoRED', 'apoderado']
  const resolved = validBuckets.includes(bucket as WscnBucket) ? (bucket as WscnBucket) : 'propias'
  return { bucket: resolved, codigo }
}

export function pickTgssDisplaySubject(notif: Pick<WscnNotificacion, 'descripcion' | 'procedimiento' | 'descripcionEstado' | 'codigo'>): string {
  const candidates = [notif.descripcion, notif.procedimiento, notif.descripcionEstado]
  for (const candidate of candidates) {
    const text = String(candidate || '').trim()
    if (text && !/^sin acuse$/i.test(text)) return text
  }
  return `Notificación TGSS ${notif.codigo}`
}

function parseWscnFunctionalError(xml: string, scopeTag?: string): { codigo: number; descripcion?: string } | null {
  const scope = scopeTag ? extractBlocks(xml, scopeTag)[0] || xml : xml
  const errorBlock = extractBlocks(scope, 'error')[0]
  if (!errorBlock) return null
  const codigo = Number(extractTag(errorBlock, 'codigo') || '0')
  if (!codigo) return null
  return { codigo, descripcion: extractTag(errorBlock, 'descripcion') || undefined }
}

function assertWscnOk(xml: string, scopeTag?: string, provider = 'TGSS WSCN'): void {
  const err = parseWscnFunctionalError(xml, scopeTag)
  if (err) {
    throw new AdminIntegrationError('TRANSPORT_ERROR', err.descripcion || `${provider} error ${err.codigo}`, err)
  }
}

async function postWscn(
  ctx: AdapterSyncContext,
  soapAction: string,
  bodyInner: string,
): Promise<string> {
  const config = getNotificationsConfig()
  const envelope = buildWsSecurityEnvelope(bodyInner, ctx.pfx, ctx.password)
  const res = await postSoap({
    endpoint: config.endpoints.tgssWscn,
    soapAction,
    envelope,
    certificate: ctx,
  })
  assertSoapOk(res.body, 'TGSS WSCN')
  return res.body
}

function parseNotificationBlock(block: string, bucket: WscnBucket): WscnNotificacion | null {
  const codigo = Number(extractTag(block, 'codigo') || '0')
  if (!codigo) return null

  return {
    codigo,
    descripcion: extractTag(block, 'descripcion') || undefined,
    procedimiento: extractTag(block, 'procedimiento') || undefined,
    destinatario: extractTag(block, 'destinatario') || undefined,
    nombreAppRazonSocial: extractTag(block, 'nombreAppRazonSocial') || undefined,
    codDestinatario: extractTag(block, 'codDestinatario') || undefined,
    fechaPuestaDisposicion: extractTag(block, 'fechaPuestaDisposicion') || undefined,
    fechaFinDisponibilidad: extractTag(block, 'fechaFinDisponibilidad') || undefined,
    estado: Number(extractTag(block, 'estado') || '0'),
    descripcionEstado: extractTag(block, 'descripcionEstado') || undefined,
    bucket,
    identificadorPoderdante:
      extractTag(block, 'identificadorPoderdante') ||
      extractTag(block, 'poderdante') ||
      undefined,
  }
}

export async function consultarListadoNotificaciones(
  ctx: AdapterSyncContext,
  input?: {
    rol?: number
    identificadorPoderdante?: string
    codigoSiguienteNotificacionPropia?: number
    codigoSiguienteNotificacionAutorizadoRED?: number
    codigoSiguienteNotificacionApoderado?: number
  },
): Promise<{
  hayMas: boolean
  nextPropia: number
  nextRed: number
  nextApoderado: number
  notificaciones: WscnNotificacion[]
}> {
  const tns = getWscnNamespace()
  const rol = input?.rol ?? 0
  const nextPropia = input?.codigoSiguienteNotificacionPropia ?? -1
  const nextRed = input?.codigoSiguienteNotificacionAutorizadoRED ?? -1
  const nextApoderado = input?.codigoSiguienteNotificacionApoderado ?? -1
  const poderdante = input?.identificadorPoderdante ?? ''

  const body = `<tns:consultarListadoNotificaciones xmlns:tns="${tns}">
  <rol>${rol}</rol>
  <identificadorPoderdante>${xmlEscape(poderdante)}</identificadorPoderdante>
  <codigoSiguienteNotificacionPropia>${nextPropia}</codigoSiguienteNotificacionPropia>
  <codigoSiguienteNotificacionAutorizadoRED>${nextRed}</codigoSiguienteNotificacionAutorizadoRED>
  <codigoSiguienteNotificacionApoderado>${nextApoderado}</codigoSiguienteNotificacionApoderado>
</tns:consultarListadoNotificaciones>`

  const xml = await postWscn(ctx, 'urn:consultarListadoNotificaciones', body)
  const listado = extractBlocks(xml, 'listadoNotificaciones')[0] || xml
  assertWscnOk(xml, 'listadoNotificaciones')

  const parseBucket = (blocks: string[], bucket: WscnBucket): WscnNotificacion[] => {
    const out: WscnNotificacion[] = []
    for (const block of blocks) {
      const notif = parseNotificationBlock(block, bucket)
      if (notif) out.push(notif)
    }
    return out
  }

  return {
    hayMas: extractTag(listado, 'hayMas') === 'true',
    nextPropia: Number(extractTag(listado, 'codigoSiguienteNotificacionPropia') || '-1'),
    nextRed: Number(extractTag(listado, 'codigoSiguienteNotificacionAutorizadoRED') || '-1'),
    nextApoderado: Number(extractTag(listado, 'codigoSiguienteNotificacionApoderado') || '-1'),
    notificaciones: [
      ...parseBucket(extractBlocks(listado, 'notificacionesPropias'), 'propias'),
      ...parseBucket(extractBlocks(listado, 'notificacionesAutorizadoRED'), 'autorizadoRED'),
      ...parseBucket(extractBlocks(listado, 'notificacionesApoderado'), 'apoderado'),
    ],
  }
}

export async function verNotificacionAceptada(
  ctx: AdapterSyncContext,
  input: {
    rol: number
    codigoNotificacion: number
    identificadorPoderdante?: string
  },
): Promise<WscnAcceptResult> {
  const tns = getWscnNamespace()
  const body = `<tns:verNotificacionAceptada xmlns:tns="${tns}">
  <rol>${input.rol}</rol>
  <identificadorPoderdante>${xmlEscape(input.identificadorPoderdante || '')}</identificadorPoderdante>
  <codigoNotificacion>${input.codigoNotificacion}</codigoNotificacion>
</tns:verNotificacionAceptada>`

  const xml = await postWscn(ctx, 'urn:verNotificacionAceptada', body)
  const recovered = extractBlocks(xml, 'notificacionRecuperada')[0] || xml
  assertWscnOk(xml, 'notificacionRecuperada', 'TGSS verNotificacionAceptada')

  const documentPdf = decodeBase64Field(extractTag(recovered, 'pdfNotificacion'))
  if (!documentPdf?.length) {
    throw new AdminIntegrationError('FILE_NOT_FOUND', 'TGSS no devolvió el PDF de la notificación aceptada')
  }

  const sellado = extractTag(recovered, 'selladoTiempo') || undefined
  return {
    documentPdf,
    selladoTiempo: sellado,
    readAt: sellado ? parseTgssDatetime(sellado) : new Date().toISOString(),
  }
}

export async function aceptarNotificacionTgss(
  ctx: AdapterSyncContext,
  input: {
    rol: number
    codigoNotificacion: number
    identificadorPoderdante?: string
  },
): Promise<WscnAcceptResult> {
  const { signTgssAcuseXml } = await import('./tgss-acuse-signer')
  const tns = getWscnNamespace()

  const solicitarBody = `<tns:solicitarAcuseNotificacion xmlns:tns="${tns}">
  <rol>${input.rol}</rol>
  <identificadorPoderdante>${xmlEscape(input.identificadorPoderdante || '')}</identificadorPoderdante>
  <codigoNotificacion>${input.codigoNotificacion}</codigoNotificacion>
  <esDeAceptacion>true</esDeAceptacion>
</tns:solicitarAcuseNotificacion>`

  const solicitarXml = await postWscn(ctx, 'urn:solicitarAcuseNotificacion', solicitarBody)
  const acuseBlock = extractBlocks(solicitarXml, 'acuseNotificacion')[0] || solicitarXml
  assertWscnOk(solicitarXml, 'acuseNotificacion', 'TGSS solicitarAcuseNotificacion')

  const acuseXmlRaw =
    decodeBase64Field(extractTag(acuseBlock, 'XML') || extractTag(acuseBlock, 'xml'))?.toString('utf8')
  if (!acuseXmlRaw?.trim()) {
    throw new AdminIntegrationError('TRANSPORT_ERROR', 'TGSS no devolvió el XML de acuse de aceptación')
  }

  const signedXml = signTgssAcuseXml(acuseXmlRaw, ctx.pfx, ctx.password)
  const xmlAcuseFirmado = Buffer.from(signedXml, 'utf8').toString('base64')

  const enviarBody = `<tns:enviarAcuseNotificacion xmlns:tns="${tns}">
  <rol>${input.rol}</rol>
  <identificadorPoderdante>${xmlEscape(input.identificadorPoderdante || '')}</identificadorPoderdante>
  <xmlAcuseFirmado>${xmlAcuseFirmado}</xmlAcuseFirmado>
</tns:enviarAcuseNotificacion>`

  const enviarXml = await postWscn(ctx, 'urn:enviarAcuseNotificacion', enviarBody)
  const recovered = extractBlocks(enviarXml, 'notificacionRecuperada')[0] || enviarXml
  assertWscnOk(enviarXml, 'notificacionRecuperada', 'TGSS enviarAcuseNotificacion')

  const documentPdf = decodeBase64Field(extractTag(recovered, 'pdfNotificacion'))
  if (!documentPdf?.length) {
    throw new AdminIntegrationError('FILE_NOT_FOUND', 'TGSS no devolvió el PDF tras aceptar la notificación')
  }

  const sellado = extractTag(recovered, 'selladoTiempo') || undefined
  return {
    documentPdf,
    selladoTiempo: sellado,
    readAt: sellado ? parseTgssDatetime(sellado) : new Date().toISOString(),
  }
}
