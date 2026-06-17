'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ArrowDownTrayIcon,
  CheckBadgeIcon,
  PaperAirplaneIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export interface SelectionTotals {
  count: number
  gross: number
  net: number
  cost: number
  signed: number
  sent: number
}

interface NominasSelectionBannerProps {
  visible: boolean
  totals: SelectionTotals
  isExporting: boolean
  onExport: () => void
  onClear: () => void
  onDelete: () => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function NominasSelectionBanner({
  visible,
  totals,
  isExporting,
  onExport,
  onClear,
  onDelete,
}: NominasSelectionBannerProps) {
  const [mounted, setMounted] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setShow(true))
      return () => cancelAnimationFrame(frame)
    }

    setShow(false)
    const timer = window.setTimeout(() => setMounted(false), 280)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (!mounted) return null

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 transition-all duration-300 ease-out',
        show ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-[#1B2A41]/15 bg-gradient-to-r from-[#1B2A41] to-[#243656] text-white shadow-2xl shadow-[#1B2A41]/40 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Selección</p>
              <p className="text-lg font-semibold">{totals.count} nóminas</p>
            </div>

            <div className="hidden h-10 w-px bg-white/15 sm:block" />

            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/60">Bruto total</p>
              <p className="font-mono text-sm font-semibold">{formatCurrency(totals.gross)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/60">Neto total</p>
              <p className="font-mono text-sm font-semibold text-emerald-300">{formatCurrency(totals.net)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/60">Coste empresa</p>
              <p className="font-mono text-sm font-semibold text-[#C6A664]">{formatCurrency(totals.cost)}</p>
            </div>

            <div className="hidden h-10 w-px bg-white/15 md:block" />

            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2.5 py-1 text-sky-100">
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
                {totals.sent} enviada{totals.sent !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-emerald-100">
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                {totals.signed} firmada{totals.signed !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onExport}
              disabled={isExporting}
              className="bg-[#C6A664] text-[#1B2A41] hover:bg-[#d4b574] border-0 h-9"
            >
              <ArrowDownTrayIcon className={`w-4 h-4 ${isExporting ? 'animate-pulse' : ''}`} />
              <span className="ml-2">{isExporting ? 'Exportando…' : 'Exportar selección'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="h-9 border-white/20 bg-white/5 text-white hover:bg-rose-500/20 hover:text-rose-100 hover:border-rose-400/30"
            >
              <TrashIcon className="w-4 h-4" />
              <span className="ml-2">Eliminar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-9 text-white/80 hover:text-white hover:bg-white/10"
            >
              <XMarkIcon className="w-4 h-4" />
              <span className="ml-1.5">Deseleccionar</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
