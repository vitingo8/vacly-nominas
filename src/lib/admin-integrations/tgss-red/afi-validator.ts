import type { AfiAffiliationPayload, AfiValidationResult } from './afi-types'
import { AFI_OPERATION_CODES } from './afi-types'

const NIF_REGEX = /^[0-9]{8}[A-Z]$|^[XYZ][0-9]{7}[A-Z]$/i
const NSS_REGEX = /^[0-9]{12}$/
const CCC_REGEX = /^[0-9]{11}$/

export function validateAfiPayload(payload: AfiAffiliationPayload): AfiValidationResult {
  const errors: Array<{ field: string; message: string }> = []

  if (!payload.requestType || !AFI_OPERATION_CODES[payload.requestType]) {
    errors.push({ field: 'requestType', message: 'Tipo de solicitud inválido' })
  }
  if (!payload.nss || !NSS_REGEX.test(payload.nss.replace(/\s/g, ''))) {
    errors.push({ field: 'nss', message: 'NSS/NAF debe tener 12 dígitos' })
  }
  if (!payload.ipf || !NIF_REGEX.test(payload.ipf.replace(/\s/g, '').toUpperCase())) {
    errors.push({ field: 'ipf', message: 'IPF/NIF inválido' })
  }
  if (!payload.ccc || !CCC_REGEX.test(payload.ccc.replace(/\s/g, ''))) {
    errors.push({ field: 'ccc', message: 'CCC debe tener 11 dígitos' })
  }
  if (!payload.fechaReal) {
    errors.push({ field: 'fechaReal', message: 'Fecha real requerida' })
  }
  if (!payload.fechaEfecto) {
    errors.push({ field: 'fechaEfecto', message: 'Fecha efecto requerida' })
  }

  return { valid: errors.length === 0, errors }
}
