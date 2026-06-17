import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditEventInput {
  companyId: string
  transactionId?: string
  eventType: string
  actorUserId?: string
  metadata?: Record<string, unknown>
}

export class AuditService {
  constructor(private supabase: SupabaseClient) {}

  async log(input: AuditEventInput): Promise<void> {
    const { error } = await this.supabase.from('administrative_audit_events').insert({
      company_id: input.companyId,
      transaction_id: input.transactionId ?? null,
      event_type: input.eventType,
      actor_user_id: input.actorUserId ?? null,
      metadata: input.metadata ?? {},
    })

    if (error) {
      console.error('[AuditService] Error registrando evento:', error)
    }
  }
}
