import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AfiFileGenerator } from '../tgss-red/afi-generator'
import type { AfiAffiliationPayload } from '../tgss-red/afi-types'

const payload: AfiAffiliationPayload = {
  requestType: 'alta',
  nss: '123456789012',
  ipf: '12345678Z',
  ccc: '12345678901',
  fechaReal: '2026-06-01',
  fechaEfecto: '2026-06-01',
  companyName: 'Vacly SL',
  employeeName: 'Juan Pérez',
}

describe('AfiFileGenerator', () => {
  const gen = new AfiFileGenerator()

  it('generates AFI file with header and worker line', () => {
    const content = gen.generate(payload)
    assert.ok(content.includes('HDRMA'))
    assert.ok(content.includes('TRBMA'))
    assert.ok(content.includes('123456789012'))
    assert.ok(content.endsWith('\r\n'))
  })

  it('uses different operation codes per type', () => {
    const baja = gen.generate({ ...payload, requestType: 'baja' })
    assert.ok(baja.includes('HDRMB'))
    const variacion = gen.generate({ ...payload, requestType: 'variacion' })
    assert.ok(variacion.includes('HDRM V'.replace(' ', '')))
  })

  it('procedureCodeForType maps correctly', () => {
    assert.equal(AfiFileGenerator.procedureCodeForType('alta'), 'tgss.afi.alta')
    assert.equal(AfiFileGenerator.procedureCodeForType('baja'), 'tgss.afi.baja')
  })
})
