import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractClassificationNifs,
  resolveCertificateOrigin,
  type AccountCompany,
} from '../certificate-vault/cert-origin-resolver'

const VACLY_ID = 'e3605f07-2576-4960-81a5-04184661926d'
const ARX_ID = '2c44a22d-9360-4ffd-83aa-2830b577d725'

const account: AccountCompany[] = [
  { companyId: VACLY_ID, name: 'Vacly', cif: 'B22657407' },
  { companyId: ARX_ID, name: "L'AMPOLLA RELAX", cif: 'B55736979' },
]

describe('cert-origin-resolver', () => {
  it('classifies own company by holder NIF', () => {
    const r = resolveCertificateOrigin(
      { holderNif: 'B22657407', holderName: '47860347S PAU JORNET (R: B22657407)' },
      VACLY_ID,
      account,
    )
    assert.equal(r.origin, 'own')
    assert.equal(r.linkedCompanyId, VACLY_ID)
  })

  it('classifies portfolio client by holder NIF', () => {
    const r = resolveCertificateOrigin(
      { holderNif: 'B55736979', holderName: '47620480S JUAN JOSE (R: B55736979)' },
      VACLY_ID,
      account,
    )
    assert.equal(r.origin, 'portfolio')
    assert.equal(r.linkedCompanyId, ARX_ID)
  })

  it('classifies foreign company CIF as portfolio even without account match', () => {
    const r = resolveCertificateOrigin(
      { holderNif: 'B55736979', holderName: '47620480S JUAN JOSE (R: B55736979)' },
      VACLY_ID,
      [account[0]],
    )
    assert.equal(r.origin, 'portfolio')
    assert.equal(r.linkedCompanyCif, 'B55736979')
  })

  it('returns unassigned for personal DNI without company CIF', () => {
    const r = resolveCertificateOrigin(
      { holderNif: '47860347S', holderName: 'PAU JORNET' },
      VACLY_ID,
      [account[0]],
    )
    assert.equal(r.origin, 'unassigned')
  })

  it('classifies portfolio via R: company CIF on personal cert', () => {
    const r = resolveCertificateOrigin(
      { holderNif: '47620480S', holderName: 'JUAN JOSE (R: B55736979)' },
      VACLY_ID,
      [account[0]],
    )
    assert.equal(r.origin, 'portfolio')
    assert.equal(r.linkedCompanyCif, 'B55736979')
  })

  it('respects manual portfolio_scope', () => {
    const r = resolveCertificateOrigin(
      { holderNif: 'A12345678', portfolioScope: 'portfolio', linkedCompanyId: ARX_ID },
      VACLY_ID,
      account,
    )
    assert.equal(r.origin, 'portfolio')
  })

  it('extracts R: from holder name', () => {
    const nifs = extractClassificationNifs('47860347S', 'NOMBRE (R: B22657407)')
    assert.ok(nifs.includes('B22657407'))
  })
})
