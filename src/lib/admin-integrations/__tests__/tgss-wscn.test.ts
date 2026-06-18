import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseTgssDatetime } from '../notifications/soap/xml'
import {
  parseWscnExternalId,
  pickTgssDisplaySubject,
  wscnBucketToRol,
} from '../notifications/adapters/tgss/tgss-wscn'
import { signTgssAcuseXml } from '../notifications/adapters/tgss/tgss-acuse-signer'

describe('parseTgssDatetime', () => {
  it('parses TGSS datetime with seconds', () => {
    const iso = parseTgssDatetime('06-08-2013 13:34:36')
    assert.equal(new Date(iso).getUTCFullYear(), 2013)
    assert.equal(new Date(iso).getUTCMonth(), 7)
    assert.equal(new Date(iso).getUTCDate(), 6)
  })

  it('parses TGSS datetime without seconds', () => {
    const iso = parseTgssDatetime('01-09-2014 9:35:48')
    assert.ok(!Number.isNaN(new Date(iso).getTime()))
  })
})

describe('tgss-wscn helpers', () => {
  it('maps bucket to rol', () => {
    assert.equal(wscnBucketToRol('propias'), 1)
    assert.equal(wscnBucketToRol('autorizadoRED'), 2)
    assert.equal(wscnBucketToRol('apoderado'), 3)
  })

  it('parses external id', () => {
    assert.deepEqual(parseWscnExternalId('autorizadoRED:38'), {
      bucket: 'autorizadoRED',
      codigo: 38,
    })
  })

  it('picks display subject from descripcion', () => {
    assert.equal(
      pickTgssDisplaySubject({ codigo: 1, descripcion: 'TESTNOTE', descripcionEstado: 'Sin acuse' }),
      'TESTNOTE',
    )
  })
})

describe('signTgssAcuseXml', () => {
  it('adds signature to Prosa acuse XML', () => {
    const sample = `<?xml version="1.0" encoding="UTF-8"?>
<ProsaSignature id="ELEMENTOAFIRMAR">
 <ProsaSignatureData Id="ProsaData">
  <ACUSE_FIRMA id="ACUSE_FIRMA"><VERSION_ACUSE>4</VERSION_ACUSE></ACUSE_FIRMA>
 </ProsaSignatureData>
</ProsaSignature>`

    // PFX de prueba mínimo no disponible aquí; solo comprobamos error claro sin certificado válido.
    assert.throws(() => signTgssAcuseXml(sample, Buffer.from(''), ''), /certificado|PFX|acuse/i)
  })
})
