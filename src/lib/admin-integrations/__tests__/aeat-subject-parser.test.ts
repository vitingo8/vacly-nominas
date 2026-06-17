import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractTag } from '../notifications/soap/xml'
import { pickAeatDisplaySubject } from '../notifications/adapters/aeat/aeat-ws-envios'

describe('extractTag AEAT asunto', () => {
  it('extrae Asunto con CDATA', () => {
    const xml = `<Envio><MetadatosPublicos><Asunto><![CDATA[LIQUIDACION IRPF 2024]]></Asunto></MetadatosPublicos></Envio>`
    assert.equal(extractTag(xml, 'Asunto'), 'LIQUIDACION IRPF 2024')
  })

  it('decodifica entidades XML en Asunto', () => {
    const xml = `<Asunto>Requerimiento &amp; comprobación</Asunto>`
    assert.equal(extractTag(xml, 'Asunto'), 'Requerimiento & comprobación')
  })
})

describe('pickAeatDisplaySubject', () => {
  it('prioriza concepto frente a asunto genérico de consulta', () => {
    assert.equal(
      pickAeatDisplaySubject({
        consultaAsunto: 'Notificación AEAT',
        concepto: 'PROPUESTA DE LIQUIDACION PROVISIONAL',
        externalId: '1234567890123',
      }),
      'PROPUESTA DE LIQUIDACION PROVISIONAL',
    )
  })
})
