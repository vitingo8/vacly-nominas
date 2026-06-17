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
  /** Cuerpo en texto plano (para mailto / copiar). */
  emailBody: string
  /** Cuerpo en HTML con buena apariencia (para previsualizar y copiar enriquecido). */
  emailBodyHtml: string
  companyName: string
  clientName: string
  clientCompanyId: string
  language: string
  fileName: string
  cached: boolean
}

const SUPPORTED_LANGUAGES: Record<string, string> = {
  es: 'español',
  ca: 'catalán',
  en: 'inglés',
  fr: 'francés',
  gl: 'gallego',
  eu: 'euskera',
  pt: 'portugués',
  de: 'alemán',
  it: 'italiano',
}

function normalizeLanguage(value: string | null | undefined): string | null {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  if (SUPPORTED_LANGUAGES[raw]) return raw
  // Acepta nombres completos ("español", "english", etc.).
  const byName: Record<string, string> = {
    español: 'es',
    espanol: 'es',
    castellano: 'es',
    spanish: 'es',
    catalan: 'ca',
    català: 'ca',
    english: 'en',
    inglés: 'en',
    ingles: 'en',
    français: 'fr',
    frances: 'fr',
    francés: 'fr',
    gallego: 'gl',
    euskera: 'eu',
    portugués: 'pt',
    portugues: 'pt',
    deutsch: 'de',
    aleman: 'de',
    alemán: 'de',
    italiano: 'it',
  }
  if (byName[raw]) return byName[raw]
  const short = raw.slice(0, 2)
  return SUPPORTED_LANGUAGES[short] ? short : null
}

async function resolveClientCompanyId(
  supabase: SupabaseClient,
  notificationCompanyId: string,
  certificateId: string | null,
  metadata: Record<string, unknown>,
): Promise<string> {
  // 1) NIF titular del certificado (== CIF de la empresa cliente).
  let holderNif = ''
  if (certificateId) {
    const { data: cert } = await supabase
      .from('administrative_certificates')
      .select('company_id, holder_nif')
      .eq('id', certificateId)
      .maybeSingle()
    holderNif = String((cert as { holder_nif?: string } | null)?.holder_nif || '').trim()
    const certCompanyId = (cert as { company_id?: string } | null)?.company_id
    if (certCompanyId && certCompanyId !== notificationCompanyId) {
      return certCompanyId
    }
  }

  const nif = (holderNif || String(metadata.nifTitular || metadata.nifDestinatario || '')).toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (nif) {
    const { data: byCif } = await supabase
      .from('companies')
      .select('company_id, cif')
      .ilike('cif', nif)
      .maybeSingle()
    const matched = (byCif as { company_id?: string } | null)?.company_id
    if (matched) return matched
  }

  return notificationCompanyId
}

async function resolveClientContact(
  supabase: SupabaseClient,
  clientCompanyId: string,
): Promise<{ email: string; name: string; companyName: string; cif: string; idioma: string | null }> {
  const { data: company } = await supabase
    .from('companies')
    .select('company, company_short, cif, email, contact_name, contact_email, idioma')
    .eq('company_id', clientCompanyId)
    .maybeSingle()

  const c = (company || {}) as Record<string, string | null>

  const companyName =
    String(c.company_short || '').trim() || String(c.company || '').trim() || 'Cliente'

  let name = String(c.contact_name || '').trim()
  let email = String(c.email || c.contact_email || '').trim()

  if (!name || !email) {
    const { data: users } = await supabase
      .from('users')
      .select('email, nombre, apellidos')
      .eq('company_id', clientCompanyId)
      .eq('state', true)
      .not('email', 'is', null)
      .limit(1)
    const u = (users?.[0] || {}) as Record<string, string | null>
    if (!name) name = `${String(u.nombre || '').trim()} ${String(u.apellidos || '').trim()}`.trim()
    if (!email) email = String(u.email || '').trim()
  }

  return {
    email,
    name,
    companyName,
    cif: String(c.cif || '').trim(),
    idioma: normalizeLanguage(c.idioma),
  }
}

/** Idioma usado en el último correo preparado para la misma empresa cliente. */
async function findLastLanguageForClient(
  supabase: SupabaseClient,
  clientCompanyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('admin_notifications')
    .select('email_language, email_proposal, email_generated_at')
    .not('email_language', 'is', null)
    .order('email_generated_at', { ascending: false })
    .limit(100)

  // Las notificaciones se guardan bajo la gestoría, así que filtramos por el
  // clientCompanyId que dejamos guardado dentro de email_proposal.
  for (const row of data || []) {
    const proposal = (row as { email_proposal?: Record<string, unknown> }).email_proposal || {}
    if (String(proposal.clientCompanyId || '') === clientCompanyId) {
      const lang = normalizeLanguage((row as { email_language?: string }).email_language)
      if (lang) return lang
    }
  }
  return null
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<\/\s*(div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseAnalysisJson(text: string): {
  summary: string
  emailSubject: string
  emailBodyHtml: string
} {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(clean) as Record<string, unknown>
  const summary = String(parsed.summary || parsed.resumen || '').trim()
  const emailSubject = String(parsed.emailSubject || parsed.asunto || '').trim()
  const emailBodyHtml = String(
    parsed.emailBodyHtml || parsed.emailBody || parsed.cuerpo || parsed.body || '',
  ).trim()

  if (!summary || !emailSubject || !emailBodyHtml) {
    throw new AdminIntegrationError(
      'PROCESSING_ERROR',
      'La IA no devolvió un borrador de correo completo',
    )
  }

  return { summary, emailSubject, emailBodyHtml }
}

function proposalFromCache(
  cached: Record<string, unknown>,
  contact: { email: string; name: string; companyName: string },
  clientCompanyId: string,
  language: string,
  fileName: string,
): NotificationEmailProposal {
  const emailBodyHtml = String(cached.emailBodyHtml || '')
  return {
    summary: String(cached.summary || ''),
    emailTo: String(cached.emailTo || contact.email || ''),
    emailSubject: String(cached.emailSubject || ''),
    emailBody: String(cached.emailBody || htmlToPlainText(emailBodyHtml)),
    emailBodyHtml,
    companyName: String(cached.companyName || contact.companyName),
    clientName: String(cached.clientName || contact.name || ''),
    clientCompanyId,
    language,
    fileName,
    cached: true,
  }
}

export async function analyzeNotificationForClientEmail(
  supabase: SupabaseClient,
  companyId: string,
  notificationId: string,
  input?: {
    actorUserId?: string
    certificateId?: string
    userConfirmed?: boolean
    language?: string
    regenerate?: boolean
  },
): Promise<NotificationEmailProposal> {
  const { data: row, error } = await supabase
    .from('admin_notifications')
    .select(
      'id, company_id, subject, sender, concept, access_deadline, certificate_id, document_path, external_id, metadata, email_proposal, email_language',
    )
    .eq('id', notificationId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error || !row) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Notificación no encontrada', error)
  }

  const metadata = (row.metadata || {}) as Record<string, unknown>

  const clientCompanyId = await resolveClientCompanyId(
    supabase,
    row.company_id,
    row.certificate_id,
    metadata,
  )
  const contact = await resolveClientContact(supabase, clientCompanyId)

  const requestedLanguage = normalizeLanguage(input?.language)

  // 1) Si ya hay un borrador cacheado y no se pide regenerar ni cambiar de idioma,
  //    devolvemos sin gastar llamadas a Anthropic.
  if (row.email_proposal && !input?.regenerate) {
    const cachedLang = normalizeLanguage(row.email_language) || 'es'
    if (!requestedLanguage || requestedLanguage === cachedLang) {
      return proposalFromCache(
        row.email_proposal as Record<string, unknown>,
        contact,
        clientCompanyId,
        cachedLang,
        `notificacion-${row.external_id || notificationId}.pdf`,
      )
    }
  }

  // 2) Determinar idioma: elección explícita > idioma del último correo > idioma
  //    de la empresa cliente. Si no hay nada, pedimos a la gestoría que elija.
  let language = requestedLanguage
  if (!language) {
    language = (await findLastLanguageForClient(supabase, clientCompanyId)) || contact.idioma
  }
  if (!language) {
    throw new AdminIntegrationError(
      'LANGUAGE_REQUIRED',
      'No hay un idioma de referencia para este cliente. Elige el idioma del correo.',
      { suggestedLanguage: 'es', languages: SUPPORTED_LANGUAGES },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AdminIntegrationError(
      'INTEGRATIONS_DISABLED',
      'ANTHROPIC_API_KEY no está configurada en el servidor',
    )
  }

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

  const languageName = SUPPORTED_LANGUAGES[language] || 'español'
  const clientName = contact.name || contact.companyName

  const prompt = `Eres el asistente de una gestoría/administración de empresas en España.
Analiza esta notificación administrativa (PDF adjunto) y redacta un correo profesional para informar al cliente.

IMPORTANTE:
- Redacta TODO el correo (asunto y cuerpo) en ${languageName}.
- Dirígete al cliente por su nombre: "${clientName}" (usa un saludo natural en ${languageName}, p. ej. "Estimado/a ${clientName}," o su equivalente).
- Termina SIEMPRE con una despedida cordial equivalente a "Saludos cordiales," seguida de "El equipo de tu gestoría" (adáptalo al idioma). No firmes con nombres inventados.
- No inventes datos que no aparezcan en el PDF (importes, fechas, números de expediente...).
- El cuerpo debe ir en HTML limpio y con buena apariencia: usa <p> para párrafos, <strong> para lo importante y <ul><li> para listas si procede. NADA de <html>, <head>, <body>, estilos en línea ni <style>. Solo el contenido interno del mensaje.

Contexto conocido:
- Cliente (empresa): ${contact.companyName}
- Persona de contacto: ${clientName}
- CIF: ${contact.cif || 'desconocido'}
- Asunto en el sistema: ${row.subject}
- Remitente: ${row.sender || 'Administración'}
- Concepto: ${row.concept || '—'}
- Plazo de acceso/comparecencia: ${deadline}

Devuelve SOLO un JSON con esta estructura exacta (sin texto adicional):
{
  "summary": "Resumen interno breve (2-4 frases) para la gestoría, en español",
  "emailSubject": "Asunto del correo al cliente, en ${languageName}",
  "emailBodyHtml": "Cuerpo del correo en HTML (solo párrafos/listas), en ${languageName}, empezando por el saludo al cliente y terminando con la despedida cordial."
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

  let parsed: { summary: string; emailSubject: string; emailBodyHtml: string }
  try {
    parsed = parseAnalysisJson(response.content[0].text)
  } catch (parseError) {
    throw new AdminIntegrationError(
      'PROCESSING_ERROR',
      'No se pudo interpretar el borrador de correo generado',
      parseError,
    )
  }

  const emailBody = htmlToPlainText(parsed.emailBodyHtml)

  const proposal: NotificationEmailProposal = {
    summary: parsed.summary,
    emailTo: contact.email,
    emailSubject: parsed.emailSubject,
    emailBody,
    emailBodyHtml: parsed.emailBodyHtml,
    companyName: contact.companyName,
    clientName,
    clientCompanyId,
    language,
    fileName: doc.fileName,
    cached: false,
  }

  // 3) Guardar en Supabase para no volver a llamar a Anthropic.
  await supabase
    .from('admin_notifications')
    .update({
      email_proposal: {
        summary: proposal.summary,
        emailTo: proposal.emailTo,
        emailSubject: proposal.emailSubject,
        emailBody: proposal.emailBody,
        emailBodyHtml: proposal.emailBodyHtml,
        companyName: proposal.companyName,
        clientName: proposal.clientName,
        clientCompanyId: proposal.clientCompanyId,
      },
      email_language: language,
      email_generated_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('company_id', companyId)

  return proposal
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
    `${input.emailBody}\n\n---\nAdjunto: notificación administrativa en PDF (descárgala desde Vacly y adjúntala antes de enviar).`,
  )
  return to ? `mailto:${to}?${params.toString()}` : `mailto:?${params.toString()}`
}
