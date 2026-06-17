import type { ParsedAfiResponse } from './afi-types'

/**
 * Parser de acuses AFI devueltos por SILTRA / Sistema RED.
 * Busca patrones habituales en ficheros de respuesta (OK, RECHAZO, ERROR).
 */
export function parseAfiResponse(rawContent: string, transactionId: string): ParsedAfiResponse {
  const upper = rawContent.toUpperCase()

  if (upper.includes('FALL') || upper.includes('FAIL') || upper.includes('FATAL')) {
    return {
      normalizedStatus: 'failed',
      errorCode: 'TGSS_FAIL',
      errorMessage: 'Error de procesamiento en la respuesta TGSS',
      rawContent,
    }
  }

  if (
    upper.includes('RECHAZ') ||
    upper.includes('ERROR') ||
    upper.includes('INCIDEN') ||
    upper.includes('KO')
  ) {
    const errorLine =
      rawContent
        .split(/\r?\n/)
        .find((line) => /rechaz|error|inciden|ko/i.test(line)) || 'Rechazo TGSS'

    return {
      normalizedStatus: 'rejected',
      errorCode: 'TGSS_REJECT',
      errorMessage: errorLine.trim(),
      rawContent,
    }
  }

  if (
    upper.includes('OK') ||
    upper.includes('ACEPT') ||
    upper.includes('CORRECT') ||
    upper.includes('PROCESADO')
  ) {
    return {
      normalizedStatus: 'accepted',
      rawContent,
    }
  }

  if (!rawContent.trim()) {
    return {
      normalizedStatus: 'failed',
      errorCode: 'TGSS_EMPTY_RESPONSE',
      errorMessage: `Respuesta vacía para el trámite ${transactionId}`,
      rawContent,
    }
  }

  return {
    normalizedStatus: 'accepted',
    rawContent,
  }
}