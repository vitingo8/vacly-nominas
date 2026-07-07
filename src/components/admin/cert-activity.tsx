'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BellAlertIcon,
  CheckBadgeIcon,
  EyeIcon,
  KeyIcon,
  LockClosedIcon,
  NoSymbolIcon,
  PlusCircleIcon,
  TagIcon,
  TrashIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'

export interface CertAuditEvent {
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

const EVENT_LABEL: Record<string, string> = {
  certificate_stored: 'Guardado en Vacly',
  certificate_used: 'Certificado utilizado',
  certificate_use_denied: 'Uso denegado (sin permiso)',
  certificate_revoked: 'Certificado revocado',
  certificate_expiry_notifications_toggled: 'Avisos de caducidad modificados',
  certificate_portfolio_scope_set: 'Clasificación cambiada',
  certificate_access_mode_set: 'Modo de acceso cambiado',
  certificate_permission_granted: 'Permiso concedido',
  certificate_permission_revoked: 'Permiso retirado',
  certificate_viewed: 'Detalle consultado',
  certificate_renewed: 'Certificado renovado',
}

export const CERT_EVENT_TYPE_OPTIONS = Object.entries(EVENT_LABEL).map(([value, label]) => ({
  value,
  label,
}))

function eventIcon(eventType: string) {
  const cls = 'h-4 w-4'
  switch (eventType) {
    case 'certificate_stored':
      return <PlusCircleIcon className={`${cls} text-emerald-600`} />
    case 'certificate_used':
      return <KeyIcon className={`${cls} text-[#1B2A41]`} />
    case 'certificate_use_denied':
      return <NoSymbolIcon className={`${cls} text-rose-600`} />
    case 'certificate_revoked':
      return <TrashIcon className={`${cls} text-rose-600`} />
    case 'certificate_expiry_notifications_toggled':
      return <BellAlertIcon className={`${cls} text-amber-600`} />
    case 'certificate_portfolio_scope_set':
      return <TagIcon className={`${cls} text-slate-500`} />
    case 'certificate_access_mode_set':
      return <LockClosedIcon className={`${cls} text-slate-600`} />
    case 'certificate_permission_granted':
      return <UserPlusIcon className={`${cls} text-emerald-600`} />
    case 'certificate_permission_revoked':
      return <UserMinusIcon className={`${cls} text-amber-600`} />
    case 'certificate_viewed':
      return <EyeIcon className={`${cls} text-slate-400`} />
    default:
      return <CheckBadgeIcon className={`${cls} text-slate-400`} />
  }
}

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType] || eventType
}

function eventDetail(e: CertAuditEvent): string | null {
  const m = e.metadata || {}
  const parts: string[] = []
  if (typeof m.purpose === 'string') parts.push(`Trámite: ${m.purpose}`)
  if (typeof m.source === 'string') {
    parts.push(m.source === 'windows_import' ? 'Origen: Windows' : 'Origen: subida manual')
  }
  if (typeof m.accessMode === 'string') {
    parts.push(m.accessMode === 'restricted' ? 'Acceso restringido' : 'Acceso abierto')
  }
  if (typeof m.scope === 'string') parts.push(m.scope === 'own' ? 'Mi empresa' : 'Cartera')
  if (typeof m.enabled === 'boolean') parts.push(m.enabled ? 'Avisos activados' : 'Avisos desactivados')
  if (typeof m.reason === 'string') parts.push(m.reason)
  return parts.length ? parts.join(' · ') : null
}

function fmtDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

/** Línea temporal de eventos (usada en el detalle del certificado). */
export function CertActivityTimeline({
  companyId,
  certificateId,
  adminHeaders,
}: {
  companyId: string
  certificateId: string
  adminHeaders: () => Record<string, string>
}) {
  const [events, setEvents] = useState<CertAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(
      `/api/admin/config/certificates/audit?scope=agency&company_id=${encodeURIComponent(companyId)}&certificate_id=${encodeURIComponent(certificateId)}&limit=100`,
      { headers: adminHeaders() },
    )
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (!d.success) throw new Error(d.message || 'Error cargando actividad')
        setEvents(d.events || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando actividad')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, certificateId, adminHeaders])

  if (loading) {
    return <p className="text-sm text-slate-500 py-6 text-center">Cargando actividad…</p>
  }
  if (error) {
    return <p className="text-sm text-red-600 py-6 text-center">{error}</p>
  }
  if (!events.length) {
    return <p className="text-sm text-slate-500 py-6 text-center">Sin actividad registrada</p>
  }

  return (
    <ol className="space-y-0 max-h-[46vh] overflow-y-auto pr-1">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4">
          {i < events.length - 1 && (
            <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" aria-hidden />
          )}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white z-10">
            {eventIcon(e.eventType)}
          </span>
          <div className="min-w-0 pt-1">
            <p className="text-sm font-medium text-slate-800 leading-tight">
              {eventLabel(e.eventType)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {fmtDateTime(e.createdAt)} · {e.actorName || (e.actorUserId ? 'Usuario' : 'Sistema')}
            </p>
            {eventDetail(e) && <p className="text-xs text-slate-400 mt-0.5">{eventDetail(e)}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Registro global de actividad de certificados con filtros y exportación CSV. */
export function CertActivityLogPanel({
  companyId,
  adminHeaders,
  certificates,
}: {
  companyId: string
  adminHeaders: () => Record<string, string>
  certificates: Array<{ id: string; label: string }>
}) {
  const PAGE_SIZE = 50
  const [events, setEvents] = useState<CertAuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filterCert, setFilterCert] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const buildQuery = useCallback(
    (extra: Record<string, string>) => {
      const params = new URLSearchParams({
        company_id: companyId,
        scope: 'agency',
        ...extra,
      })
      if (filterCert) params.set('certificate_id', filterCert)
      if (filterEvent) params.set('event_type', filterEvent)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      return params.toString()
    },
    [companyId, filterCert, filterEvent, filterFrom, filterTo],
  )

  const load = useCallback(
    (nextOffset: number) => {
      setLoading(true)
      setError('')
      fetch(
        `/api/admin/config/certificates/audit?${buildQuery({ limit: String(PAGE_SIZE), offset: String(nextOffset) })}`,
        { headers: adminHeaders() },
      )
        .then((r) => r.json())
        .then((d) => {
          if (!d.success) throw new Error(d.message || 'Error cargando el registro')
          setEvents(d.events || [])
          setTotal(d.total || 0)
          setOffset(nextOffset)
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Error cargando el registro'))
        .finally(() => setLoading(false))
    },
    [buildQuery, adminHeaders],
  )

  useEffect(() => {
    load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCert, filterEvent, filterFrom, filterTo, companyId])

  const downloadCsv = async () => {
    try {
      const res = await fetch(`/api/admin/config/certificates/audit?${buildQuery({ format: 'csv' })}`, {
        headers: adminHeaders(),
      })
      if (!res.ok) throw new Error('No se pudo generar el CSV')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'actividad-certificados.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error exportando CSV')
    }
  }

  const selectCls =
    'h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1B2A41]'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase">Certificado</label>
          <select value={filterCert} onChange={(e) => setFilterCert(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {certificates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase">Evento</label>
          <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {CERT_EVENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase">Desde</label>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase">Hasta</label>
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => load(offset)}>
            <ArrowPathIcon className="h-4 w-4" />
            Actualizar
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void downloadCsv()}>
            <ArrowDownTrayIcon className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-700">Fecha</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-700">Evento</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-700">Usuario</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-700">Certificado</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-700">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading &&
              events.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{fmtDateTime(e.createdAt)}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-800">
                      {eventIcon(e.eventType)}
                      {eventLabel(e.eventType)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {e.actorName || (e.actorUserId ? 'Usuario' : 'Sistema')}
                  </td>
                  <td className="px-4 py-2 text-slate-600 max-w-[220px] truncate" title={e.certificateAlias || undefined}>
                    {e.certificateAlias || '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs max-w-[260px] truncate" title={eventDetail(e) || undefined}>
                    {eventDetail(e) || '—'}
                  </td>
                </tr>
              ))}
            {!loading && !events.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Sin eventos que coincidan con los filtros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {total} evento{total === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || offset === 0}
            onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || offset + PAGE_SIZE >= total}
            onClick={() => load(offset + PAGE_SIZE)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
