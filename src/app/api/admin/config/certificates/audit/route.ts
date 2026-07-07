import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { AuditService } from '@/lib/admin-integrations'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LIMIT = 200

export interface CertAuditEntry {
  id: string
  companyId: string
  eventType: string
  actorUserId: string | null
  actorName: string | null
  certificateId: string | null
  certificateAlias: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

async function resolvePortfolioCompanyIds(supabase: any, companyId: string): Promise<string[]> {
  const { data } = await supabase.from('companies').select('company_id').eq('agency_id', companyId)
  return [companyId, ...(data || []).map((c: any) => c.company_id)]
}

/**
 * Registro de actividad de certificados.
 *  GET  ?company_id[&scope=agency][&certificate_id][&actor_user_id][&event_type][&from][&to][&limit][&offset][&format=csv]
 *  POST { company_id, certificate_id } → registra consulta de detalle (certificate_viewed)
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const companyId = params.get('company_id')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)

    const supabase = getSupabaseClient()

    const scope = params.get('scope')
    const companyIds =
      scope === 'agency' ? await resolvePortfolioCompanyIds(supabase, companyId!) : [companyId!]

    const certificateId = params.get('certificate_id')
    const actorUserId = params.get('actor_user_id')
    const eventType = params.get('event_type')
    const from = params.get('from')
    const to = params.get('to')
    const format = params.get('format')
    const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), MAX_LIMIT)
    const offset = Math.max(Number(params.get('offset')) || 0, 0)

    let query = supabase
      .from('administrative_audit_events')
      .select('id, company_id, event_type, actor_user_id, metadata, created_at', { count: 'exact' })
      .in('company_id', companyIds)
      .like('event_type', 'certificate%')
      .order('created_at', { ascending: false })

    if (certificateId && UUID_REGEX.test(certificateId)) {
      query = query.eq('metadata->>certificateId', certificateId)
    }
    if (actorUserId && UUID_REGEX.test(actorUserId)) {
      query = query.eq('actor_user_id', actorUserId)
    }
    if (eventType) {
      query = query.eq('event_type', eventType)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      // Fechas sin hora (YYYY-MM-DD) incluyen el día completo.
      query = query.lte('created_at', to.includes('T') ? to : `${to}T23:59:59.999Z`)
    }

    // El CSV exporta hasta MAX_LIMIT * 10 filas en una pasada.
    const effectiveLimit = format === 'csv' ? MAX_LIMIT * 10 : limit
    const { data, error, count } = await query.range(offset, offset + effectiveLimit - 1)

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error consultando el registro de actividad', error)
    }

    const rows = data || []

    // Resolver nombres de usuario y alias de certificado.
    const userIds = Array.from(
      new Set(rows.map((r: any) => r.actor_user_id).filter(Boolean)),
    ) as string[]
    const certIds = Array.from(
      new Set(rows.map((r: any) => r.metadata?.certificateId).filter((v: unknown) => typeof v === 'string')),
    ) as string[]

    const [usersRes, certsRes] = await Promise.all([
      userIds.length
        ? supabase.from('users').select('id, nombre, apellidos, email').in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      certIds.length
        ? supabase
            .from('administrative_certificates')
            .select('id, alias, holder_name, holder_nif')
            .in('id', certIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const userById = new Map<string, string>()
    for (const u of usersRes.data || []) {
      userById.set(u.id, [u.nombre, u.apellidos].filter(Boolean).join(' ').trim() || u.email || u.id)
    }
    const certById = new Map<string, string>()
    for (const c of certsRes.data || []) {
      certById.set(c.id, c.alias || c.holder_name || c.holder_nif || c.id)
    }

    const entries: CertAuditEntry[] = rows.map((r: any) => {
      const certId = typeof r.metadata?.certificateId === 'string' ? r.metadata.certificateId : null
      return {
        id: r.id,
        companyId: r.company_id,
        eventType: r.event_type,
        actorUserId: r.actor_user_id ?? null,
        actorName: r.actor_user_id ? userById.get(r.actor_user_id) || null : null,
        certificateId: certId,
        certificateAlias: certId ? certById.get(certId) || null : null,
        metadata: r.metadata || {},
        createdAt: r.created_at,
      }
    })

    if (format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const lines = [
        ['Fecha', 'Evento', 'Usuario', 'Certificado', 'Detalle'].map(esc).join(';'),
        ...entries.map((e) =>
          [
            new Date(e.createdAt).toLocaleString('es-ES'),
            e.eventType,
            e.actorName || (e.actorUserId ? e.actorUserId : 'Sistema'),
            e.certificateAlias || e.certificateId || '',
            JSON.stringify(e.metadata),
          ]
            .map(esc)
            .join(';'),
        ),
      ]
      return new NextResponse(`\uFEFF${lines.join('\r\n')}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="actividad-certificados.csv"',
          'Cache-Control': 'no-store',
        },
      })
    }

    return jsonOk({ events: entries, total: count ?? entries.length, limit, offset })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = String(body.company_id || '')
    const certificateId = String(body.certificate_id || '')

    assertValidCompanyId(companyId)
    const ctx = assertCompanyAccess(request, companyId)
    if (!UUID_REGEX.test(certificateId)) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'certificate_id es requerido')
    }

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    await audit.log({
      companyId,
      eventType: 'certificate_viewed',
      actorUserId: ctx.actorUserId,
      metadata: { certificateId },
    })

    return jsonOk({ logged: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
