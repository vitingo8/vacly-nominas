'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline'

interface GrantRow {
  userId: string
  userName: string | null
  userEmail: string | null
  canView: boolean
  canUse: boolean
  canManage: boolean
  /** true si el usuario todavía no tiene grant persistido. */
  isNew?: boolean
}

interface CertPermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titular: string
  companyId: string
  certificateId: string | null
  adminHeaders: () => Record<string, string>
  onAccessModeChanged?: (mode: 'open' | 'restricted') => void
}

export function CertPermissionsDialog({
  open,
  onOpenChange,
  titular,
  companyId,
  certificateId,
  adminHeaders,
  onAccessModeChanged,
}: CertPermissionsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accessMode, setAccessMode] = useState<'open' | 'restricted'>('open')
  const [createdBy, setCreatedBy] = useState<string | null>(null)
  const [rows, setRows] = useState<GrantRow[]>([])

  const load = useCallback(async () => {
    if (!certificateId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/admin/config/certificates/permissions?company_id=${encodeURIComponent(companyId)}&certificate_id=${encodeURIComponent(certificateId)}`,
        { headers: adminHeaders() },
      )
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'No se pudieron cargar los permisos')

      setAccessMode(data.access_mode === 'restricted' ? 'restricted' : 'open')
      setCreatedBy(data.created_by || null)

      const grants = new Map<string, { canView: boolean; canUse: boolean; canManage: boolean }>()
      for (const g of data.grants || []) {
        grants.set(g.userId, { canView: g.canView, canUse: g.canUse, canManage: g.canManage })
      }
      const users: Array<{ id: string; name: string; email: string | null }> = data.users || []
      const known = new Set(users.map((u) => u.id))

      const merged: GrantRow[] = users.map((u) => {
        const g = grants.get(u.id)
        return {
          userId: u.id,
          userName: u.name,
          userEmail: u.email,
          canView: g?.canView ?? false,
          canUse: g?.canUse ?? false,
          canManage: g?.canManage ?? false,
          isNew: !g,
        }
      })
      // Grants de usuarios que ya no aparecen en la lista de la empresa.
      for (const g of data.grants || []) {
        if (!known.has(g.userId)) {
          merged.push({
            userId: g.userId,
            userName: g.userName || g.userId,
            userEmail: g.userEmail || null,
            canView: g.canView,
            canUse: g.canUse,
            canManage: g.canManage,
          })
        }
      }
      setRows(merged)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando permisos')
    } finally {
      setLoading(false)
    }
  }, [certificateId, companyId, adminHeaders])

  useEffect(() => {
    if (open && certificateId) void load()
  }, [open, certificateId, load])

  const changeAccessMode = async (mode: 'open' | 'restricted') => {
    if (!certificateId || mode === accessMode) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/config/certificates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ company_id: companyId, id: certificateId, access_mode: mode }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'No se pudo cambiar el modo de acceso')
      setAccessMode(mode)
      onAccessModeChanged?.(mode)
      if (mode === 'restricted') await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar el modo de acceso')
    } finally {
      setSaving(false)
    }
  }

  const updateRow = async (row: GrantRow, patch: Partial<Pick<GrantRow, 'canView' | 'canUse' | 'canManage'>>) => {
    if (!certificateId) return
    const next = { ...row, ...patch }
    // usar o gestionar implican ver.
    if (next.canUse || next.canManage) next.canView = true

    setSaving(true)
    setError('')
    try {
      const noAccess = !next.canView && !next.canUse && !next.canManage
      if (noAccess) {
        const res = await fetch(
          `/api/admin/config/certificates/permissions?company_id=${encodeURIComponent(companyId)}&certificate_id=${encodeURIComponent(certificateId)}&user_id=${encodeURIComponent(row.userId)}`,
          { method: 'DELETE', headers: adminHeaders() },
        )
        const data = await res.json()
        if (!data.success) throw new Error(data.message || 'No se pudo quitar el permiso')
        setRows((prev) =>
          prev.map((r) => (r.userId === row.userId ? { ...next, isNew: true } : r)),
        )
      } else {
        const res = await fetch('/api/admin/config/certificates/permissions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...adminHeaders() },
          body: JSON.stringify({
            company_id: companyId,
            certificate_id: certificateId,
            user_id: row.userId,
            can_view: next.canView,
            can_use: next.canUse,
            can_manage: next.canManage,
          }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message || 'No se pudo guardar el permiso')
        setRows((prev) =>
          prev.map((r) => (r.userId === row.userId ? { ...next, isNew: false } : r)),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando el permiso')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permisos del certificado</DialogTitle>
          <DialogDescription>
            Controla qué usuarios pueden ver, usar y gestionar este certificado. Todos los cambios
            quedan registrados en el historial de actividad.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-slate-800 truncate">{titular}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void changeAccessMode('open')}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              accessMode === 'open'
                ? 'border-[#1B2A41] bg-[#1B2A41]/5'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <LockOpenIcon className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-slate-800">Acceso abierto</span>
              <span className="block text-xs text-slate-500">
                Todos los usuarios con acceso al módulo de certificados
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void changeAccessMode('restricted')}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              accessMode === 'restricted'
                ? 'border-[#1B2A41] bg-[#1B2A41]/5'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <LockClosedIcon className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-slate-800">Acceso restringido</span>
              <span className="block text-xs text-slate-500">
                Solo los usuarios autorizados abajo
              </span>
            </span>
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {accessMode === 'restricted' && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-700">Usuario</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-700 w-16">Ver</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-700 w-16">Usar</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-700 w-24">Gestionar</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        Cargando usuarios…
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rows.map((row) => {
                      const isCreator = createdBy != null && row.userId === createdBy
                      return (
                        <tr key={row.userId} className="border-t border-slate-100">
                          <td className="px-4 py-2">
                            <p className="font-medium text-slate-800">
                              {row.userName || row.userEmail || row.userId}
                              {isCreator && (
                                <span className="ml-2 text-[11px] text-slate-400">(creador)</span>
                              )}
                            </p>
                            {row.userEmail && row.userName && (
                              <p className="text-[11px] text-slate-400">{row.userEmail}</p>
                            )}
                          </td>
                          {(['canView', 'canUse', 'canManage'] as const).map((field) => (
                            <td key={field} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 cursor-pointer accent-[#1B2A41]"
                                checked={isCreator || row[field]}
                                disabled={saving || isCreator}
                                title={isCreator ? 'El creador siempre tiene acceso completo' : undefined}
                                onChange={(e) => void updateRow(row, { [field]: e.target.checked })}
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        No hay usuarios en esta empresa
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
