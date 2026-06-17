import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '../errors'
import { loadNotificationDocumentBuffer } from './notification-service'

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'
const MAX_PDF_BYTES = 4 * 1024 * 1024

export interface NotificationEmailProposal {
  summary: string
  emailTo: string
  emailSubject: string
  emailBody: string
  companyName: string
  clientCompanyId: string
  fileName: string
}

async function resolveClientCompanyId(
  supabase: SupabaseClient,
  notificationCompanyId: string,
  certificateId: string | null,
): Promise<string> {
  if (!certificateId) return notificationCompanyId

  const { data: cert } = await supabase
    .from('administrative_certificates')
    .select('company_id')
    .eq('id', certificateId)
    .maybeSingle()

  return (cert as { company_id?: string } | null)?.company_id || notificationCompanyId
}

async function resolveClientEmail(
  supabase: SupabaseClient,
  clientCompanyId: string,
): Promise<string> {
  const { data: company } = await supabase
    .from('companies')
    .select('email')
    .eq('company_id', clientCompanyId)
    .maybeSingle()

  const companyEmail = String((company as { email?: string } | null)?.email || '').trim()
  if (companyEmail) return companyEmail

  const { data: users } = await supabase
    .from('users')
    .select('email')
    .eq('company_id', clientCompanyId)
    .eq('state', true)
    .not('email', 'is', null)
    .limit(1)

  return String((users?.[0] as { email?: string } | undefined)?.email || '').trim()
}

function parseAnalysisJson(text: string): {
  summary: string
  emailSubject: string
  emailBody: string
} {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(clean) as Record<string, unknown>
  const summary = String(parsed.summary || parsed.resumen || '').trim()
  const emailSubject = String(parsed.emailSubject || parsed.asunto || '').trim()
  const emailBody = String(parsed.emailBody || parsed.cuerpo || parsed.body || '').trim()

  if (!summary || !emailSubject || !emailBody) {
    throw new AdminIntegrationError(
      'PROCESSING_ERROR',
      'La IA no devolvió un borrador de correo completo',
    )
  }

  return { summary, emailSubject, emailBody }
}

export async function analyzeNotificationForClientEmail(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
  input?: { actorUserId?: string; certificateId?: string; userConfirmed?: boolean },
): Promise<NotificationEmailProposal> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AdminIntegrationError(
      'INTEGRATIONS_DISABLED',
      'ANTHROPIC_API_KEY no está configurada en el servidor',
    )
  }

  const { data: row, error } = await supabase
    .from('admin_notifications')
    .select(
      'id, company_id, subject, sender, concept, access_deadline, certificate_id, document_path, external_id',
    )
    .eq('id', notificationId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error || !row) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Notificación no encontrada', error)
  }

  const clientCompanyId = await resolveClientCompanyId(
    supabase,
    row.company_id,
    row.certificate_id,
  )

  const { data: companyRow } = await supabase
    .from('companies')
    .select('company, company_short, cif, email')
    .eq('company_id', clientCompanyId)
    .maybeSingle()

  const companyName =
    String((companyRow as { company_short?: string } | null)?.company_short || '').trim() ||
    String((companyRow as { company?: string } | null)?.company || '').trim() ||
    'Cliente'

  const emailTo = await resolveClientEmail(supabase, clientCompanyId)

  const doc = await loadNotificationDocumentBuffer(supabase, companyId, notificationId, {
    actorUserId: input?.actorUserId,
    certificateId: input?.certificateId,
    userConfirmed: input?.userConfirmed || !!row.document_path,
  })

  if (doc.buffer.length > MAX_PDF_BYTES) {
    throw new AdminIntegrationError(
      'VALIDATION_ERROR',
      'El PDF es demasiado grande para analizarlo automáticamente',
    )
  }

  const deadline = row.access_deadline
    ? new Date(row.access_deadline).toLocaleDateString('es-ES')
    : 'no indicada'

  const prompt = `Eres el asistente de una gestoría/administración de empresas en España.
Analiza esta notificación administrativa (PDF adjunto) y redacta un correo profesional en español para informar al cliente.

Contexto conocido:
- Cliente: ${companyName}
- CIF: ${String((companyRow as { cif?: string } | null)?.cif || 'desconocido')}
- Asunto en el sistema: ${row.subject}
- Remitente: ${row.sender || 'Administración'}
- Concepto: ${row.concept || '—'}
- Plazo de acceso/comparecencia: ${deadline}

Devuelve SOLO un JSON con esta estructura exacta:
{
  "summary": "Resumen interno breve (2-4 frases) para la gestoría",
  "emailSubject": "Asunto del correo al cliente",
  "emailBody": "Cuerpo del correo al cliente, tono claro y profesional, en párrafos separados por \\n\\n. Indica qué es la notificación, plazos relevantes y qué debe hacer el cliente o qué hará la gestoría. No inventes datos que no aparezcan en el PDF."
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: doc.buffer.toString('base64'),
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  if (!response.content[0] || response.content[0].type !== 'text') {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Respuesta inválida de Claude')
  }

  let parsed: { summary: string; emailSubject: string; emailBody: string }
  try {
    parsed = parseAnalysisJson(response.content[0].text)
  } catch (parseError) {
    throw new AdminIntegrationError(
      'PROCESSING_ERROR',
      'No se pudo interpretar el borrador de correo generado',
      parseError,
    )
  }

  return {
    summary: parsed.summary,
    emailTo,
    emailSubject: parsed.emailSubject,
    emailBody: parsed.emailBody,
    companyName,
    clientCompanyId,
    fileName: doc.fileName,
  }
}

export function buildNotificationMailto(input: {
  emailTo: string
  emailSubject: string
  emailBody: string
}): string {
  const to = input.emailTo.trim()
  const params = new URLSearchParams()
  params.set('subject', input.emailSubject)
  params.set(
    'body',
    `${input.emailBody}\n\n---\nAdjunto: notificación administrativa en PDF (descárgala desde Vacly antes de enviar).`,
  )
  return to ? `mailto:${to}?${params.toString()}` : `mailto:?${params.toString()}`
}
