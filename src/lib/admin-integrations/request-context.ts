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
 * Usuario actuante segun la cabecera opcional `x-vacly-user-id`. NO esta
 * verificado criptograficamente: usar solo como fallback de trazabilidad
 * cuando no hay token firmado. Para identidad verificada, usar el resultado
 * de `assertCompanyAccess`.
 */
export function getActorUserId(request: NextRequest): string | undefined {
  const headerId = request.headers.get('x-vacly-user-id')
  if (headerId && UUID_REGEX.test(headerId)) return headerId
  return undefined
}

export interface VerifiedRequestContext {
  /** Usuario verificado por firma HMAC (token v2). Undefined con token legado v1 o en dev sin secreto. */
  actorUserId?: string
  /** True si la identidad procede de un token firmado (no de cabeceras). */
  verified: boolean
}

/**
 * Genera un token de sesion firmado (HMAC) que vincula el iframe a una empresa
 * y a un usuario concretos. vacly-app debe acunarlo SOLO para empresas a las
 * que el usuario tiene acceso, usando el mismo `ADMIN_SESSION_SECRET`.
 *
 * Formato v2: `<expEpochSeconds>.<userId>.<base64url(hmac(companyId.userId.exp))>`
 * Formato v1 (legado, sin usuario): `<expEpochSeconds>.<base64url(hmac(companyId.exp))>`
 */
export function mintCompanyToken(
  companyId: string,
  secret: string,
  ttlSeconds = 3600,
  userId?: string,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  if (userId) {
    const sig = createHmac('sha256', secret).update(`${companyId}.${userId}.${exp}`).digest('base64url')
    return `${exp}.${userId}.${sig}`
  }
  const sig = createHmac('sha256', secret).update(`${companyId}.${exp}`).digest('base64url')
  return `${exp}.${sig}`
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * Verifica el token de empresa frente al material sensible de certificados y
 * devuelve la identidad verificada del actor (token v2).
 *
 * Si `ADMIN_SESSION_SECRET` esta configurado, el token es OBLIGATORIO. Sin
 * secreto configurado, en produccion se rechaza la peticion (fail-closed); en
 * desarrollo se permite sin token para no bloquear el trabajo local.
 */
export function assertCompanyAccess(request: NextRequest, companyId: string): VerifiedRequestContext {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new AdminIntegrationError(
        'UNAUTHORIZED',
        'ADMIN_SESSION_SECRET no configurado: el acceso a certificados requiere sesion firmada',
      )
    }
    return { actorUserId: getActorUserId(request), verified: false }
  }

  const token =
    request.headers.get('x-vacly-company-token') || request.nextUrl.searchParams.get('token') || ''
  const parts = token.split('.')

  // v2: exp.userId.sig
  if (parts.length === 3) {
    const [expRaw, userId, sig] = parts
    const exp = Number(expRaw)
    if (!sig || !UUID_REGEX.test(userId) || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'Token de sesion ausente o caducado')
    }
    const expected = createHmac('sha256', secret).update(`${companyId}.${userId}.${exp}`).digest('base64url')
    if (!safeEqual(sig, expected)) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'Token de sesion no valido para esta empresa')
    }
    return { actorUserId: userId, verified: true }
  }

  // v1 (legado): exp.sig — sin identidad de usuario firmada.
  if (parts.length === 2) {
    const [expRaw, sig] = parts
    const exp = Number(expRaw)
    if (!sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'Token de sesion ausente o caducado')
    }
    const expected = createHmac('sha256', secret).update(`${companyId}.${exp}`).digest('base64url')
    if (!safeEqual(sig, expected)) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'Token de sesion no valido para esta empresa')
    }
    return { actorUserId: getActorUserId(request), verified: false }
  }

  throw new AdminIntegrationError('UNAUTHORIZED', 'Token de sesion ausente o caducado')
}
