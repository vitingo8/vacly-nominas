'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BellIcon,
  BellSlashIcon,
  CalendarDaysIcon,
  ClipboardDocumentIcon,
  FingerPrintIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { formatMilestonesSummary } from '@/lib/admin-integrations/certificate-vault/cert-expiry-milestones'

export interface CertDetailData {
  originLabel: string
  companyName: string
  titular: string
  alias?: string | null
  nif: string | null
  issuer: string
  issuerFull?: string | null
  expiry: string
  validFrom?: string | null
  validToRaw?: string | null
  serialNumber?: string | null
  certificateType?: string | null
  statusLabel: string
  statusVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
  thumbprint?: string | null
  expiryNotificationsEnabled?: boolean
  expiryNotificationMilestones?: number[]
  daysToExpiry?: number | null
  organizationalUnit?: string | null
  subjectDn?: string | null
}

interface CertDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cert: CertDetailData | null
  typeLabels?: Record<string, string>
}

function Cell({
  label,
  value,
  mono = false,
  title,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
  title?: string
}) {
  const [copied, setCopied] = useState(false)
  const display = value?.trim() || '—'
  const empty = display === '—'
  const tip = title || (!empty ? display : undefined)

  const copy = async () => {
    if (empty) return
    try {
      await navigator.clipboard.writeText(display)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide leading-none mb-1.5">
        {label}
      </p>
      <div className="flex items-start gap-1.5 min-w-0">
        <p
          className={`text-base text-slate-800 break-words leading-snug ${mono ? 'font-mono text-sm' : ''}`}
          title={tip}
        >
          {display}
        </p>
        {!empty && (
          <button
            type="button"
            onClick={() => void copy()}
            className="shrink-0 p-0.5 rounded text-slate-400 hover:text-[#1B2A41] hover:bg-slate-100"
            title="Copiar"
          >
            <ClipboardDocumentIcon className="h-3 w-3" />
          </button>
        )}
        {copied && <span className="text-[9px] text-emerald-600 shrink-0">OK</span>}
      </div>
    </div>
  )
}

function validityProgress(daysToExpiry: number | null | undefined): {
  pct: number
  tone: 'ok' | 'warn' | 'danger'
  label: string
} {
  if (daysToExpiry == null) {
    return { pct: 50, tone: 'ok', label: 'Sin fecha de caducidad' }
  }
  if (daysToExpiry < 0) {
    return { pct: 100, tone: 'danger', label: `Caducado hace ${Math.abs(daysToExpiry)} días` }
  }
  if (daysToExpiry <= 30) {
    return { pct: Math.max(8, (daysToExpiry / 30) * 100), tone: 'warn', label: `Caduca en ${daysToExpiry} días` }
  }
  const pct = Math.min(100, Math.max(12, (daysToExpiry / 365) * 100))
  return { pct, tone: 'ok', label: `Vigente · ${daysToExpiry} días` }
}

export function CertDetailDialog({
  open,
  onOpenChange,
  cert,
  typeLabels = {},
}: CertDetailDialogProps) {
  if (!cert) return null

  const validity = validityProgress(cert.daysToExpiry)
  const barColor =
    validity.tone === 'danger'
      ? 'bg-red-500'
      : validity.tone === 'warn'
        ? 'bg-amber-500'
        : 'bg-emerald-500'

  const issuerTip = cert.issuerFull && cert.issuerFull !== cert.issuer ? cert.issuerFull : cert.issuer
  const typeLabel = cert.certificateType
    ? typeLabels[cert.certificateType] || cert.certificateType
    : null

  const notificationsLabel =
    cert.expiryNotificationsEnabled == null
      ? null
      : cert.expiryNotificationsEnabled
        ? formatMilestonesSummary(cert.expiryNotificationMilestones ?? [60, 30])
        : 'Desactivados'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,56rem)] max-w-none sm:max-w-[56rem] min-h-[min(72vh,32rem)] p-0 gap-0 overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#1B2A41] to-[#2d4057] px-8 pt-8 pb-6 text-white shrink-0">
          <DialogHeader className="space-y-0 text-left">
            <div className="flex items-center gap-4 pr-8">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <ShieldCheckIcon className="h-8 w-8 text-[#C6A664]" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-2xl font-bold text-white leading-tight">
                  {cert.titular}
                </DialogTitle>
                {cert.alias && cert.alias !== cert.titular && (
                  <p className="text-sm text-white/70 mt-1">{cert.alias}</p>
                )}
              </div>
              <div className="hidden sm:flex flex-wrap justify-end gap-2 shrink-0 max-w-[280px]">
                <Badge variant="outline" className="border-white/30 bg-white/10 text-white text-xs px-2 py-0.5">
                  {cert.originLabel}
                </Badge>
                <Badge
                  variant={cert.statusVariant || 'outline'}
                  className="border-white/20 bg-white/15 text-white text-xs px-2 py-0.5"
                >
                  {cert.statusLabel}
                </Badge>
                {typeLabel && (
                  <Badge variant="outline" className="border-white/20 bg-white/10 text-white/90 text-xs px-2 py-0.5">
                    {typeLabel}
                  </Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="mt-5">
            <div className="flex justify-between text-sm text-white/80 mb-2">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDaysIcon className="h-4 w-4" />
                Validez
              </span>
              <span>{validity.label}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${validity.pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-white/60 mt-2">
              <span>{cert.validFrom || '—'}</span>
              <span>{cert.expiry}</span>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 bg-[#f6f8fa] flex-1 flex flex-col justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
            <Cell label="Titular" value={cert.titular} />
            <Cell label="DNI / NIF" value={cert.nif} mono />
            <Cell label="Empresa" value={cert.companyName} />
            <Cell label="Emisor" value={cert.issuer} title={issuerTip} />
            <Cell label="Válido desde" value={cert.validFrom} />
            <Cell label="Caduca" value={cert.expiry} />
            {cert.serialNumber && (
              <Cell label="Número de serie" value={cert.serialNumber} mono title={cert.serialNumber} />
            )}
            {cert.thumbprint && (
              <Cell label="Huella SHA-1" value={cert.thumbprint} mono title={cert.thumbprint} />
            )}
            {cert.organizationalUnit && <Cell label="UO" value={cert.organizationalUnit} />}
            {notificationsLabel && (
              <Cell
                label="Avisos caducidad"
                value={notificationsLabel}
                title={
                  cert.expiryNotificationsEnabled
                    ? `Avisos: ${formatMilestonesSummary(cert.expiryNotificationMilestones ?? [60, 30])}`
                    : 'Avisos desactivados'
                }
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-200">
            <div className="flex sm:hidden flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                {cert.originLabel}
              </Badge>
              <Badge variant={cert.statusVariant || 'outline'} className="text-xs">
                {cert.statusLabel}
              </Badge>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {notificationsLabel && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-sm text-slate-500">
                  {cert.expiryNotificationsEnabled ? (
                    <BellIcon className="h-4 w-4 text-[#1B2A41]" />
                  ) : (
                    <BellSlashIcon className="h-4 w-4 text-slate-400" />
                  )}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 text-sm"
                onClick={() => {
                  const parts = [
                    cert.titular,
                    cert.nif && `NIF: ${cert.nif}`,
                    cert.companyName && `Empresa: ${cert.companyName}`,
                    cert.issuer && `Emisor: ${issuerTip}`,
                    cert.serialNumber && `Serie: ${cert.serialNumber}`,
                    cert.thumbprint && `Huella: ${cert.thumbprint}`,
                    cert.validFrom && `Desde: ${cert.validFrom}`,
                    `Hasta: ${cert.expiry}`,
                    cert.subjectDn && `Subject: ${cert.subjectDn}`,
                  ].filter(Boolean)
                  void navigator.clipboard.writeText(parts.join('\n'))
                }}
              >
                <FingerPrintIcon className="h-3.5 w-3.5" />
                Copiar ficha
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
