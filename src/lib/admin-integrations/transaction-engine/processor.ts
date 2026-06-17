import type { SupabaseClient } from '@supabase/supabase-js'
import { TransactionService } from './transaction-service'
import { AuditService } from '../audit/audit-service'
import { DocumentStorageService } from '../document-storage/document-storage-service'
import { createTransportAdapter } from '../tgss-red/transport/transport-adapter'
import { parseMockAfiResponse } from '../tgss-red/response-parser'
import { getAdminConfig } from '../config'

export interface ProcessorResult {
  processed: number
  accepted: number
  rejected: number
  failed: number
  details: Array<{ transactionId: string; status: string }>
}

export class TransactionProcessor {
  private txService: TransactionService
  private audit: AuditService
  private storage: DocumentStorageService
  private transport = createTransportAdapter()

  constructor(private supabase: SupabaseClient) {
    this.txService = new TransactionService(supabase)
    this.audit = new AuditService(supabase)
    this.storage = new DocumentStorageService(supabase)
  }

  async processQueue(limit = 20): Promise<ProcessorResult> {
    const config = getAdminConfig()
    if (!config.enabled) {
      return { processed: 0, accepted: 0, rejected: 0, failed: 0, details: [] }
    }

    const queued = await this.txService.listQueued(limit)
    const result: ProcessorResult = {
      processed: 0,
      accepted: 0,
      rejected: 0,
      failed: 0,
      details: [],
    }

    for (const tx of queued) {
      try {
        if (tx.status === 'queued') {
          const file = await this.storage.getLatestForTransaction(tx.id)
          if (!file) {
            await this.txService.fail(tx.id, 'FILE_MISSING', 'No hay fichero para enviar')
            result.failed++
            result.details.push({ transactionId: tx.id, status: 'failed' })
            continue
          }

          await this.transport.submitFile(tx.id, file.storage_path)
          await this.txService.transition(tx.id, 'submitted')
          await this.audit.log({
            companyId: tx.company_id,
            transactionId: tx.id,
            eventType: 'submitted',
            metadata: { mode: config.tgssMode },
          })
        }

        const poll = await this.transport.pollResponse(tx.id)
        if (poll.status !== 'completed') {
          continue
        }

        let current = await this.txService.getById(tx.id)
        if (current.status === 'submitted') {
          current = await this.txService.transition(tx.id, 'response_received')
        }

        const rawContent = poll.responseContent || ''
        const parsed = parseMockAfiResponse(rawContent, tx.id)

        const { data: responseRow } = await this.supabase
          .from('administrative_responses')
          .insert({
            company_id: tx.company_id,
            transaction_id: tx.id,
            response_type: 'afi_acuse',
            normalized_status: parsed.normalizedStatus,
            error_code: parsed.errorCode ?? null,
            error_message: parsed.errorMessage ?? null,
          })
          .select('id')
          .single()

        await this.audit.log({
          companyId: tx.company_id,
          transactionId: tx.id,
          eventType: 'response_received',
          metadata: { responseId: responseRow?.id, status: parsed.normalizedStatus },
        })

        if (parsed.normalizedStatus === 'accepted') {
          await this.txService.transition(tx.id, 'accepted')
          result.accepted++
        } else if (parsed.normalizedStatus === 'rejected') {
          await this.txService.transition(tx.id, 'rejected', {
            error_code: parsed.errorCode,
            error_message: parsed.errorMessage,
          })
          result.rejected++
        } else {
          await this.txService.fail(tx.id, parsed.errorCode || 'FAILED', parsed.errorMessage || 'Error')
          result.failed++
        }

        result.processed++
        result.details.push({ transactionId: tx.id, status: parsed.normalizedStatus })
      } catch (err) {
        console.error('[TransactionProcessor] Error:', tx.id, err)
        await this.txService.fail(
          tx.id,
          'PROCESSING_ERROR',
          err instanceof Error ? err.message : 'Error desconocido',
        )
        result.failed++
        result.details.push({ transactionId: tx.id, status: 'failed' })
      }
    }

    return result
  }
}
