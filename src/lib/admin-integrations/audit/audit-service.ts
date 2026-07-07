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

  /**
   * Registro fail-closed: si el evento no se puede escribir, lanza error.
   * Usar para operaciones que NO deben ocurrir sin traza (p. ej. uso de la
   * clave privada de un certificado — requisito de control eIDAS).
   */
  async logStrict(input: AuditEventInput): Promise<void> {
    const { error } = await this.supabase.from('administrative_audit_events').insert({
      company_id: input.companyId,
      transaction_id: input.transactionId ?? null,
      event_type: input.eventType,
      actor_user_id: input.actorUserId ?? null,
      metadata: input.metadata ?? {},
    })

    if (error) {
      console.error('[AuditService] Error registrando evento obligatorio:', error)
      throw new Error(`No se pudo registrar el evento de auditoría (${input.eventType}); operación cancelada`)
    }
  }
}
