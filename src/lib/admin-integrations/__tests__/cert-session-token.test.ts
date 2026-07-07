import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { NextRequest } from 'next/server'
import { mintCompanyToken, assertCompanyAccess } from '../request-context'
import { filterViewableCertificates } from '../certificate-vault/cert-permission-service'
import type { CertificatePermissionService, CertificateGrant } from '../certificate-vault/cert-permission-service'

const SECRET = 'test-secret-for-admin-session-token'
const COMPANY = '11111111-2222-3333-4444-555555555555'
const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function fakeRequest(token?: string, headers: Record<string, string> = {}): NextRequest {
  const all: Record<string, string> = { ...headers }
  if (token) all['x-vacly-company-token'] = token
  return {
    headers: {
      get: (name: string) => all[name.toLowerCase()] ?? null,
    },
    nextUrl: {
      searchParams: new URLSearchParams(),
    },
  } as unknown as NextRequest
}

describe('mintCompanyToken / assertCompanyAccess', () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = SECRET
  })

  it('v2 token carries the verified user identity', () => {
    const token = mintCompanyToken(COMPANY, SECRET, 3600, USER)
    const ctx = assertCompanyAccess(fakeRequest(token), COMPANY)
    assert.equal(ctx.actorUserId, USER)
    assert.equal(ctx.verified, true)
  })

  it('v1 token (legacy, no user) is still accepted but unverified', () => {
    const token = mintCompanyToken(COMPANY, SECRET, 3600)
    const ctx = assertCompanyAccess(fakeRequest(token), COMPANY)
    assert.equal(ctx.actorUserId, undefined)
    assert.equal(ctx.verified, false)
  })

  it('rejects a token minted for another company', () => {
    const token = mintCompanyToken('99999999-8888-7777-6666-555555555555', SECRET, 3600, USER)
    assert.throws(() => assertCompanyAccess(fakeRequest(token), COMPANY))
  })

  it('rejects an expired token', () => {
    const token = mintCompanyToken(COMPANY, SECRET, -10, USER)
    assert.throws(() => assertCompanyAccess(fakeRequest(token), COMPANY))
  })

  it('rejects a tampered user id', () => {
    const token = mintCompanyToken(COMPANY, SECRET, 3600, USER)
    const [exp, , sig] = token.split('.')
    const tampered = `${exp}.bbbbbbbb-cccc-dddd-eeee-ffffffffffff.${sig}`
    assert.throws(() => assertCompanyAccess(fakeRequest(tampered), COMPANY))
  })

  it('rejects requests without a token when the secret is configured', () => {
    assert.throws(() => assertCompanyAccess(fakeRequest(), COMPANY))
  })

  it('v1 token falls back to the x-vacly-user-id header for the actor', () => {
    const token = mintCompanyToken(COMPANY, SECRET, 3600)
    const ctx = assertCompanyAccess(fakeRequest(token, { 'x-vacly-user-id': USER }), COMPANY)
    assert.equal(ctx.actorUserId, USER)
    assert.equal(ctx.verified, false)
  })
})

describe('filterViewableCertificates', () => {
  const grant = (certificateId: string, userId: string, canView: boolean): CertificateGrant => ({
    id: 'g1',
    certificateId,
    userId,
    canView,
    canUse: false,
    canManage: false,
    grantedBy: null,
    createdAt: new Date().toISOString(),
  })

  const stubPermissions = (grantsByCert: Map<string, CertificateGrant[]>) =>
    ({
      getGrantsByCertificate: async () => grantsByCert,
    }) as unknown as CertificatePermissionService

  it('open certificates are always visible', async () => {
    const certs = [{ id: 'c1', accessMode: 'open' as const, createdBy: null }]
    const result = await filterViewableCertificates(stubPermissions(new Map()), certs, USER)
    assert.equal(result.length, 1)
  })

  it('restricted certificates without a grant are hidden', async () => {
    const certs = [{ id: 'c1', accessMode: 'restricted' as const, createdBy: null }]
    const result = await filterViewableCertificates(stubPermissions(new Map()), certs, USER)
    assert.equal(result.length, 0)
  })

  it('restricted certificates with a view grant are visible', async () => {
    const certs = [{ id: 'c1', accessMode: 'restricted' as const, createdBy: null }]
    const grants = new Map([['c1', [grant('c1', USER, true)]]])
    const result = await filterViewableCertificates(stubPermissions(grants), certs, USER)
    assert.equal(result.length, 1)
  })

  it('the creator always sees their restricted certificate', async () => {
    const certs = [{ id: 'c1', accessMode: 'restricted' as const, createdBy: USER }]
    const result = await filterViewableCertificates(stubPermissions(new Map()), certs, USER)
    assert.equal(result.length, 1)
  })

  it('without viewer identity nothing is filtered (cron/system)', async () => {
    const certs = [{ id: 'c1', accessMode: 'restricted' as const, createdBy: null }]
    const result = await filterViewableCertificates(stubPermissions(new Map()), certs, undefined)
    assert.equal(result.length, 1)
  })
})
