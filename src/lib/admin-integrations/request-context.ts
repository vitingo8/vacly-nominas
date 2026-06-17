import type { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { AdminIntegrationError } from './errors'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Valida que el company_id sea un UUID. Defensa basica para endpoints que
 * operan con material sensible (certificados). El aislamiento por empresa real
 * lo refuerza RLS sobre `administrative_*`.
 */
export function assertValidCompanyId(companyId: string | null | undefined): asserts companyId is string {
  if (!companyId || !UUID_REGEX.test(companyId)) {
    throw new AdminIntegrationError('VALIDATION_ERROR', 'company_id es requerido y debe ser un UUID valido')
  }
}

/**
 * Usuario actuante para la auditoria. vacly-app puede reenviarlo en la cabecera
 * `x-vacly-user-id` al embeber el iframe. Es solo para trazabilidad: la
 * autorizacion no depende de este valor.
 */
export function getActorUserId(request: NextRequest): string | undefined {
  const headerId = request.headers.get('x-vacly-user-id')
  if (headerId && UUID_REGEX.test(headerId)) return headerId
  return undefined
}

/**
 * Genera un token de sesion firmado (HMAC) que vincula el iframe a una empresa
 * concreta. vacly-app debe acunarlo SOLO para empresas a las que el usuario
 * tiene acceso, usando el mismo `ADMIN_SESSION_SECRET`.
 * Formato: `<expEpochSeconds>.<base64url(hmac)>`.
 */
export function mintCompanyToken(companyId: string, secret: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const sig = createHmac('sha256', secret).update(`${companyId}.${exp}`).digest('base64url')
  return `${exp}.${sig}`
}

/**
 * Verifica el token de empresa frente al material sensible de certificados.
 * Es OPT-IN: si `ADMIN_SESSION_SECRET` no esta configurado, no se exige (modo
 * compatible). En produccion, configurar el secreto en vacly-app y vacly-nominas
 * para bloquear llamadas con un company_id arbitrario.
 */
export function assertCompanyAccess(request: NextRequest, companyId: string): void {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) return

  const token =
    request.headers.get('x-vacly-company-token') || request.nextUrl.searchParams.get('token') || ''
  const [expRaw, sig] = token.split('.')
  const exp = Number(expRaw)

  if (!sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    throw new AdminIntegrationError('UNAUTHORIZED', 'Token de sesion ausente o caducado')
  }

  const expected = createHmac('sha256', secret).update(`${companyId}.${exp}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AdminIntegrationError('UNAUTHORIZED', 'Token de sesion no valido para esta empresa')
  }
}
