import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminProvider, AdministrativeTransaction, TransactionStatus } from '../types'
import { assertTransition } from '../state-machine'
import { AdminIntegrationError } from '../errors'

export interface CreateTransactionInput {
  companyId: string
  provider: AdminProvider
  procedureCode: string
  subjectType?: string
  subjectId?: string
  requestedBy?: string
  certificateId?: string
  authorizationId?: string
}

export class TransactionService {
  constructor(private supabase: SupabaseClient) {}

  async create(input: CreateTransactionInput): Promise<AdministrativeTransaction> {
    const { data, error } = await this.supabase
      .from('administrative_transactions')
      .insert({
        company_id: input.companyId,
        provider: input.provider,
        procedure_code: input.procedureCode,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        requested_by: input.requestedBy ?? null,
        certificate_id: input.certificateId ?? null,
        authorization_id: input.authorizationId ?? null,
        status: 'created',
      })
      .select('*')
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'No se pudo crear la transacción', error)
    }
    return data as AdministrativeTransaction
  }

  async getById(id: string, companyId?: string): Promise<AdministrativeTransaction> {
    let query = this.supabase.from('administrative_transactions').select('*').eq('id', id)
    if (companyId) query = query.eq('company_id', companyId)

    const { data, error } = await query.single()
    if (error || !data) {
      throw new AdminIntegrationError('TRANSACTION_NOT_FOUND', `Transacción no encontrada: ${id}`)
    }
    return data as AdministrativeTransaction
  }

  async listByCompany(
    companyId: string,
    opts?: { status?: TransactionStatus; limit?: number; offset?: number },
  ): Promise<{ data: AdministrativeTransaction[]; total: number }> {
    let query = this.supabase
      .from('administrative_transactions')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (opts?.status) query = query.eq('status', opts.status)
    const limit = opts?.limit ?? 50
    const offset = opts?.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando transacciones', error)
    }
    return { data: (data || []) as AdministrativeTransaction[], total: count ?? 0 }
  }

  async listQueued(limit = 20): Promise<AdministrativeTransaction[]> {
    const { data, error } = await this.supabase
      .from('administrative_transactions')
      .select('*')
      .in('status', ['queued', 'submitted'])
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando cola', error)
    }
    return (data || []) as AdministrativeTransaction[]
  }

  async transition(
    id: string,
    to: TransactionStatus,
    extra?: { error_code?: string; error_message?: string },
  ): Promise<AdministrativeTransaction> {
    const current = await this.getById(id)
    assertTransition(current.status, to)

    const { data, error } = await this.supabase
      .from('administrative_transactions')
      .update({
        status: to,
        error_code: extra?.error_code ?? null,
        error_message: extra?.error_message ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('PROCESSING_ERROR', `No se pudo actualizar transacción ${id}`, error)
    }
    return data as AdministrativeTransaction
  }

  async fail(id: string, code: string, message: string): Promise<AdministrativeTransaction> {
    const current = await this.getById(id)
    if (current.status === 'failed') return current

    const { data, error } = await this.supabase
      .from('administrative_transactions')
      .update({
        status: 'failed',
        error_code: code,
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('PROCESSING_ERROR', `No se pudo marcar fallo ${id}`, error)
    }
    return data as AdministrativeTransaction
  }
}
