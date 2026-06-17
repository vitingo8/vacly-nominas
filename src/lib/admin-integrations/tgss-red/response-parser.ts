import type { ParsedAfiResponse } from './afi-types'

/**
 * Parser básico de acuses AFI (mock).
 * TODO: Implementar parser real cuando se disponga de ficheros de respuesta SILTRA.
 */
export function parseMockAfiResponse(rawContent: string, transactionId: string): ParsedAfiResponse {
  const upper = rawContent.toUpperCase()

  if (upper.includes('ERROR') || upper.includes('RECHAZ')) {
    return {
      normalizedStatus: 'rejected',
      errorCode: 'TGSS_REJECT',
      errorMessage: 'Acuse de rechazo simulado',
      rawContent,
    }
  }

  if (upper.includes('FALL') || upper.includes('FAIL')) {
    return {
      normalizedStatus: 'failed',
      errorCode: 'TGSS_FAIL',
      errorMessage: 'Error de procesamiento simulado',
      rawContent,
    }
  }

  return {
    normalizedStatus: 'accepted',
    rawContent: rawContent || `MOCK-ACUSE-OK-${transactionId}`,
  }
}

export function generateMockResponseContent(transactionId: string, accepted = true): string {
  if (accepted) {
    return `MOCK-RESPONSE\r\nSTATUS:OK\r\nTX:${transactionId}\r\nDATE:${new Date().toISOString()}\r\n`
  }
  return `MOCK-RESPONSE\r\nSTATUS:RECHAZ\r\nTX:${transactionId}\r\nERROR:SIMULATED\r\n`
}
