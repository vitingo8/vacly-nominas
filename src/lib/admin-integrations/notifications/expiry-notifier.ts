import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveCertificateStatus } from '../certificate-vault/certificate-vault-service'
import {
  MAX_CERT_EXPIRY_MILESTONE_DAYS,
  milestoneForDays,
  normalizeExpiryMilestones,
} from '../certificate-vault/cert-expiry-milestones'
import { getCompanyRecipientUserIds } from './recipients'

export interface ExpiryNotifierResult {
  scanned: number
  notificationsCreated: number
}

interface CertScanRow {
  id: string
  company_id: string
  alias: string
  holder_nif: string | null
  valid_to: string | null
  expiry_notification_milestones: number[] | null
}

/**
 * Recorre los certificados no revocados que caducan pronto o han caducado y
 * crea una notificacion (idempotente por dedupe_key) para el administrador de
 * cada empresa en la tabla `notifications` de vacly-app.
 */
export async function notifyExpiringCertificates(
  supabase: SupabaseClient,
): Promise<ExpiryNotifierResult> {
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + MAX_CERT_EXPIRY_MILESTONE_DAYS)

  const { data: certs, error } = await supabase
    .from('administrative_certificates')
    .select('id, company_id, alias, holder_nif, valid_to, expiry_notification_milestones')
    .is('revoked_at', null)
    .eq('expiry_notifications_enabled', true)
    .not('valid_to', 'is', null)
    .lte('valid_to', horizon.toISOString())

  if (error) {
    throw new Error(`No se pudieron leer certificados: ${error.message}`)
  }

  const rows = (certs || []) as CertScanRow[]
  if (!rows.length) return { scanned: 0, notificationsCreated: 0 }

  const companyIds = Array.from(new Set(rows.map((r) => r.company_id)))
  const { data: companies } = await supabase
    .from('companies')
    .select('company_id, company, company_short')
    .in('company_id', companyIds)

  const nameByCompany = new Map<string, string>()
  for (const c of companies || []) {
    nameByCompany.set(
      (c as any).company_id,
      (c as any).company_short || (c as any).company || 'la empresa',
    )
  }

  const recipientsByCompany = new Map<string, string[]>()

  let created = 0

  for (const cert of rows) {
    const milestones = normalizeExpiryMilestones(cert.expiry_notification_milestones)
    const { status, daysToExpiry } = deriveCertificateStatus(cert.valid_to, null)
    const milestoneValue = milestoneForDays(daysToExpiry, milestones)
    if (milestoneValue == null) continue

    const milestone = daysToExpiry != null && daysToExpiry < 0 ? 'expired' : String(milestoneValue)

    let recipients = recipientsByCompany.get(cert.company_id)
    if (!recipients) {
      recipients = await getCompanyRecipientUserIds(supabase, cert.company_id)
      recipientsByCompany.set(cert.company_id, recipients)
    }
    if (recipients.length === 0) continue

    const name = nameByCompany.get(cert.company_id) || 'la empresa'
    const expired = milestone === 'expired'
    const title = expired
      ? `Certificado caducado: ${cert.alias}`
      : `El certificado "${cert.alias}" caduca pronto`
    const message = expired
      ? `El certificado digital de ${name} (titular ${cert.holder_nif || 's/d'}) ha caducado. Renuevalo para no interrumpir los tramites administrativos.`
      : `El certificado digital de ${name} (titular ${cert.holder_nif || 's/d'}) caduca en ${daysToExpiry} dias (${new Date(cert.valid_to as string).toLocaleDateString('es-ES')}).`

    for (const userId of recipients) {
      const { error: insertError } = await supabase.from('notifications').insert({
        company_id: cert.company_id,
        user_id: userId,
        type: 'certificate_expiry',
        level: expired ? 'error' : 'warning',
        title,
        message,
        status: 'pendiente',
        action_url: '/AdminCertificados',
        entity_type: 'administrative_certificate',
        entity_id: cert.id,
        dedupe_key: `cert_expiry:${cert.id}:${milestone}`,
        metadata: { daysToExpiry, validTo: cert.valid_to, status, milestone: milestoneValue },
      })

      if (insertError) {
        if (insertError.code !== '23505') {
          console.error('[expiry-notifier] insert failed:', insertError.message)
        }
        continue
      }
      created += 1
    }
  }

  return { scanned: rows.length, notificationsCreated: created }
}
