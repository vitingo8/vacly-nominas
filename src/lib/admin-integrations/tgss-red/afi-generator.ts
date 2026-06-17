import type { AfiAffiliationPayload } from './afi-types'
import { AFI_OPERATION_CODES } from './afi-types'
import { validateAfiPayload } from './afi-validator'
import type { AffiliationRequestType } from '../types'

function padRight(value: string, length: number): string {
  return value.slice(0, length).padEnd(length, ' ')
}

function padLeft(value: string, length: number, char = '0'): string {
  return value.slice(0, length).padStart(length, char)
}

function formatDateYmd(isoOrYmd: string): string {
  const clean = isoOrYmd.replace(/-/g, '').slice(0, 8)
  return padLeft(clean, 8)
}

/**
 * Generador borrador de fichero AFI (Mensaje Afiliación RED).
 * TODO: Validar posiciones exactas contra documentación oficial TGSS "Mensaje AFI".
 */
export class AfiFileGenerator {
  generate(payload: AfiAffiliationPayload): string {
    const validation = validateAfiPayload(payload)
    if (!validation.valid) {
      throw new Error(
        `Validación AFI fallida: ${validation.errors.map((e) => e.field).join(', ')}`,
      )
    }

    const opCode = AFI_OPERATION_CODES[payload.requestType]
    const nss = padLeft(payload.nss.replace(/\s/g, ''), 12)
    const ipf = padRight(payload.ipf.replace(/\s/g, '').toUpperCase(), 14)
    const ccc = padLeft(payload.ccc.replace(/\s/g, ''), 11)
    const fechaReal = formatDateYmd(payload.fechaReal)
    const fechaEfecto = formatDateYmd(payload.fechaEfecto)
    const companyName = padRight((payload.companyName || '').slice(0, 40), 40)
    const employeeName = padRight((payload.employeeName || '').slice(0, 40), 40)
    const cotGroup = padLeft(String(payload.cotizationGroup || ''), 2)
    const contractType = padLeft(String(payload.contractType || ''), 3)

    const lines: string[] = [
      `*AFI BORRADOR VACLY — validar contra doc oficial TGSS*`,
      `HDR${opCode}${ccc}${fechaEfecto}`,
      `EMP${ccc}${padRight((payload.companyCif || '').slice(0, 9), 9)}${companyName}`,
      `TRB${opCode}${nss}${ipf}${employeeName}${fechaReal}${fechaEfecto}${cotGroup}${contractType}`,
      `FIN000005`,
    ]

    return lines.join('\r\n') + '\r\n'
  }

  static procedureCodeForType(type: AffiliationRequestType): string {
    const map: Record<AffiliationRequestType, string> = {
      alta: 'tgss.afi.alta',
      baja: 'tgss.afi.baja',
      variacion: 'tgss.afi.variacion',
    }
    return map[type]
  }
}
