import type {
  TransportFilePayload,
  TransportPollResult,
  TransportSubmissionResult,
} from '../afi-types'
import { assertSiltraConfig, getAdminConfig } from '../../config'
import { SiltraTransportAdapter } from './siltra-transport'

export interface TgssTransportAdapter {
  submitFile(transactionId: string, file: TransportFilePayload): Promise<TransportSubmissionResult>
  pollResponse(transactionId: string): Promise<TransportPollResult>
  getSubmissionStatus(transactionId: string): Promise<TransportSubmissionResult>
  downloadReceipt(transactionId: string): Promise<string>
}

export function createTransportAdapter(): TgssTransportAdapter {
  assertSiltraConfig()
  const config = getAdminConfig()
  return new SiltraTransportAdapter(
    config.tgssSiltraInputDir,
    config.tgssSiltraOutputDir,
    config.tgssSiltraExecutablePath,
  )
}
