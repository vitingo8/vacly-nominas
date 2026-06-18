'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CERT_EXPIRY_MILESTONE_OPTIONS,
  normalizeExpiryMilestones,
} from '@/lib/admin-integrations/certificate-vault/cert-expiry-milestones'
import { type CorporateBrand, DEFAULT_CORPORATE_BRAND } from '@/lib/corporate-brand'

const WHITE_CHECK_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3.5 8.2 6.4 11.1 12.5 4.9' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"

function CorporateCheckbox({
  checked,
  onChange,
  brand,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  brand: CorporateBrand
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border border-slate-300 appearance-none bg-center bg-no-repeat focus:ring-2 focus:ring-offset-1"
      style={{
        backgroundColor: checked ? brand.accent : '#ffffff',
        borderColor: checked ? brand.accent : undefined,
        backgroundImage: checked ? WHITE_CHECK_BG : 'none',
        backgroundSize: '70%',
        ['--tw-ring-color' as string]: brand.accent,
      }}
    />
  )
}

interface CertExpiryNotificationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titular: string
  enabled: boolean
  milestones: number[]
  loading?: boolean
  brand?: CorporateBrand
  onSave: (enabled: boolean, milestones: number[]) => void
}

export function CertExpiryNotificationsDialog({
  open,
  onOpenChange,
  titular,
  enabled: enabledProp,
  milestones: milestonesProp,
  loading = false,
  brand = DEFAULT_CORPORATE_BRAND,
  onSave,
}: CertExpiryNotificationsDialogProps) {
  const [enabled, setEnabled] = useState(enabledProp)
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(normalizeExpiryMilestones(milestonesProp)),
  )

  const brandStyle = {
    '--corporate-accent': brand.accent,
    '--corporate-primary': brand.primary,
    '--corporate-primary-hover': brand.primaryHover,
  } as CSSProperties

  useEffect(() => {
    if (!open) return
    setEnabled(enabledProp)
    setSelected(new Set(normalizeExpiryMilestones(milestonesProp)))
  }, [open, enabledProp, milestonesProp])

  const toggleDay = (days: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(days)) next.delete(days)
      else next.add(days)
      return next
    })
  }

  const handleSave = () => {
    const milestones = normalizeExpiryMilestones([...selected])
    onSave(enabled, milestones)
  }

  const canSave = !enabled || selected.size > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" style={brandStyle}>
        <DialogHeader>
          <DialogTitle>Avisos de caducidad</DialogTitle>
          <DialogDescription>
            Elige cuándo quieres recibir avisos para este certificado.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-slate-800 truncate">{titular}</p>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50">
          <CorporateCheckbox checked={enabled} onChange={setEnabled} brand={brand} />
          <div>
            <p className="text-sm font-medium text-slate-800">Activar avisos</p>
            <p className="text-xs text-slate-500">Notificación en app y aviso al entrar en certificados</p>
          </div>
        </label>

        {enabled && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avisar cuando falten</p>
            <div className="grid grid-cols-2 gap-2">
              {CERT_EXPIRY_MILESTONE_OPTIONS.map((opt) => {
                const isSelected = selected.has(opt.days)
                return (
                  <label
                    key={opt.days}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors"
                    style={
                      isSelected
                        ? {
                            borderColor: brand.primary,
                            backgroundColor: brand.primaryMuted,
                          }
                        : undefined
                    }
                  >
                    <CorporateCheckbox
                      checked={isSelected}
                      onChange={() => toggleDay(opt.days)}
                      brand={brand}
                    />
                    <span className="text-slate-800">{opt.label}</span>
                  </label>
                )
              })}
            </div>
            {selected.size === 0 && (
              <p className="text-xs text-amber-600">Selecciona al menos un aviso.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="text-white"
            style={{ backgroundColor: brand.primary }}
            disabled={loading || !canSave}
            onClick={handleSave}
            onMouseEnter={(e) => {
              if (!loading && canSave) e.currentTarget.style.backgroundColor = brand.primaryHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = brand.primary
            }}
          >
            {loading ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
