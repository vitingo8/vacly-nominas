'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

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

  if (!mounted || !portalReady) return null

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[9999]"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'pointer-events-auto w-full transition-all duration-300 ease-out',
          show ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
        )}
      >
        <div className="border-t border-[#1B2A41]/15 bg-gradient-to-r from-[#1B2A41] to-[#243656] text-white shadow-2xl shadow-[#1B2A41]/40 px-4 py-2.5 sm:px-6">
          <div className="flex flex-nowrap items-center justify-between gap-3 overflow-x-auto">
            <div className="flex flex-nowrap items-center gap-x-4 gap-y-0 shrink-0">
              <p className="whitespace-nowrap text-sm font-semibold">
                <span className="text-white/60 font-normal">Selección:</span>{' '}
                {totals.count} nóminas
              </p>

              <div className="h-5 w-px shrink-0 bg-white/15" />

              <p className="whitespace-nowrap text-sm">
                <span className="text-white/60">Bruto</span>{' '}
                <span className="font-mono font-semibold">{formatCurrency(totals.gross)}</span>
              </p>
              <p className="whitespace-nowrap text-sm">
                <span className="text-white/60">Neto</span>{' '}
                <span className="font-mono font-semibold text-emerald-300">{formatCurrency(totals.net)}</span>
              </p>
              <p className="whitespace-nowrap text-sm">
                <span className="text-white/60">Coste</span>{' '}
                <span className="font-mono font-semibold text-[#C6A664]">{formatCurrency(totals.cost)}</span>
              </p>

              <div className="h-5 w-px shrink-0 bg-white/15" />

              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-100">
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
                {totals.sent} enviada{totals.sent !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-100">
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                {totals.signed} firmada{totals.signed !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex shrink-0 flex-nowrap items-center gap-2">
              <Button
                size="sm"
                onClick={onExport}
                disabled={isExporting}
                className="h-8 shrink-0 border-0 bg-[#C6A664] text-[#1B2A41] hover:bg-[#d4b574]"
              >
                <ArrowDownTrayIcon className={`w-4 h-4 ${isExporting ? 'animate-pulse' : ''}`} />
                <span className="ml-1.5 whitespace-nowrap">{isExporting ? 'Exportando…' : 'Exportar'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="h-8 shrink-0 border-white/20 bg-white/5 text-white hover:border-rose-400/30 hover:bg-rose-500/20 hover:text-rose-100"
              >
                <TrashIcon className="w-4 h-4" />
                <span className="ml-1.5 whitespace-nowrap">Eliminar</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-8 shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <XMarkIcon className="w-4 h-4" />
                <span className="ml-1 whitespace-nowrap">Deseleccionar</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
