import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyNotificationCategory,
  resolveAdminStatus,
} from '../notifications/notification-workflow'

describe('classifyNotificationCategory', () => {
  it('classifies TGSS as seguridad social by default', () => {
    assert.equal(
      classifyNotificationCategory({ provider: 'tgss', subject: 'Notificación TGSS', sender: 'TGSS' }),
      'seguridad_social',
    )
  })

  it('classifies AEAT modelo as impuestos', () => {
    assert.equal(
      classifyNotificationCategory({ provider: 'aeat', subject: 'Liquidación Modelo 111' }),
      'impuestos',
    )
  })

  it('classifies laboral keywords', () => {
    assert.equal(
      classifyNotificationCategory({ provider: 'tgss', subject: 'Variación datos afiliación' }),
      'laboral',
    )
  })
})

describe('resolveAdminStatus', () => {
  it('maps TGSS estado 0', () => {
    const status = resolveAdminStatus('tgss', { estado: 0, descripcionEstado: 'Sin acuse' })
    assert.equal(status.label, 'Sin acuse')
    assert.equal(status.tone, 'warning')
  })

  it('maps AEAT estado A', () => {
    const status = resolveAdminStatus('aeat', { estado: 'A' })
    assert.equal(status.label, 'Accedida')
  })
})
