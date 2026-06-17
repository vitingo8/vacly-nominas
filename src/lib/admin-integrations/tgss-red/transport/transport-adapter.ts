import type { TransportPollResult, TransportSubmissionResult } from './afi-types'
import { AdminIntegrationError } from '../errors'

export interface TgssTransportAdapter {
  submitFile(transactionId: string, filePath: string): Promise<TransportSubmissionResult>
  pollResponse(transactionId: string): Promise<TransportPollResult>
  getSubmissionStatus(transactionId: string): Promise<TransportSubmissionResult>
  downloadReceipt(transactionId: string): Promise<string>
}

export class MockTgssTransportAdapter implements TgssTransportAdapter {
  private submissions = new Map<string, { filePath: string; submittedAt: number }>()

  async submitFile(transactionId: string, filePath: string): Promise<TransportSubmissionResult> {
    this.submissions.set(transactionId, { filePath, submittedAt: Date.now() })
    return {
      externalRef: `MOCK-REF-${transactionId.slice(0, 8)}`,
      status: 'submitted',
    }
  }

  async pollResponse(transactionId: string): Promise<TransportPollResult> {
    const sub = this.submissions.get(transactionId)
    if (!sub) {
      return { status: 'error' }
    }
    const elapsed = Date.now() - sub.submittedAt
    if (elapsed < 100) {
      return { status: 'pending' }
    }
    return {
      status: 'completed',
      responseContent: `MOCK-RESPONSE\r\nSTATUS:OK\r\nTX:${transactionId}\r\n`,
    }
  }

  async getSubmissionStatus(transactionId: string): Promise<TransportSubmissionResult> {
    const sub = this.submissions.get(transactionId)
    if (!sub) {
      return { externalRef: '', status: 'pending' }
    }
    return {
      externalRef: `MOCK-REF-${transactionId.slice(0, 8)}`,
      status: 'submitted',
    }
  }

  async downloadReceipt(transactionId: string): Promise<string> {
    const sub = this.submissions.get(transactionId)
    if (!sub) {
      throw new AdminIntegrationError('TRANSPORT_ERROR', 'Envío no encontrado en mock')
    }
    return `MOCK-RECEIPT-${transactionId}\r\nFILE:${sub.filePath}\r\n`
  }
}

export class SiltraTransportAdapter implements TgssTransportAdapter {
  constructor(
    private inputDir: string,
    private outputDir: string,
    private executablePath: string,
  ) {}

  async submitFile(_transactionId: string, _filePath: string): Promise<TransportSubmissionResult> {
    throw new AdminIntegrationError(
      'TRANSPORT_ERROR',
      'SiltraTransportAdapter no implementado — configure TGSS_MODE=mock o despliegue SILTRA',
    )
  }

  async pollResponse(_transactionId: string): Promise<TransportPollResult> {
    throw new AdminIntegrationError('TRANSPORT_ERROR', 'SiltraTransportAdapter no implementado')
  }

  async getSubmissionStatus(_transactionId: string): Promise<TransportSubmissionResult> {
    throw new AdminIntegrationError('TRANSPORT_ERROR', 'SiltraTransportAdapter no implementado')
  }

  async downloadReceipt(_transactionId: string): Promise<string> {
    throw new AdminIntegrationError('TRANSPORT_ERROR', 'SiltraTransportAdapter no implementado')
  }
}

export function createTransportAdapter(): TgssTransportAdapter {
  const mode = process.env.TGSS_MODE || 'mock'
  if (mode === 'siltra') {
    return new SiltraTransportAdapter(
      process.env.TGSS_SILTRA_INPUT_DIR || '',
      process.env.TGSS_SILTRA_OUTPUT_DIR || '',
      process.env.TGSS_SILTRA_EXECUTABLE_PATH || '',
    )
  }
  return new MockTgssTransportAdapter()
}
