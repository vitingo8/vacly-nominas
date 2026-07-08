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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] w-full"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'pointer-events-auto w-full transition-all duration-300 ease-out',
          show ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
        )}
      >
        <div className="w-full border-t border-[#1B2A41]/15 bg-gradient-to-r from-[#1B2A41] to-[#243656] text-white shadow-2xl shadow-[#1B2A41]/40 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:flex lg:flex-1 lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-2">
              <p className="col-span-2 text-sm font-semibold sm:col-span-3 lg:col-span-1 lg:whitespace-nowrap">
                <span className="font-normal text-white/60">Selección:</span>{' '}
                {totals.count} nóminas
              </p>

              <p className="text-sm">
                <span className="text-white/60">Bruto</span>{' '}
                <span className="font-mono font-semibold">{formatCurrency(totals.gross)}</span>
              </p>
              <p className="text-sm">
                <span className="text-white/60">Neto</span>{' '}
                <span className="font-mono font-semibold text-emerald-300">{formatCurrency(totals.net)}</span>
              </p>
              <p className="text-sm">
                <span className="text-white/60">Coste</span>{' '}
                <span className="font-mono font-semibold text-[#C6A664]">{formatCurrency(totals.cost)}</span>
              </p>

              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-100">
                <PaperAirplaneIcon className="h-3.5 w-3.5 shrink-0" />
                {totals.sent} enviada{totals.sent !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-100">
                <CheckBadgeIcon className="h-3.5 w-3.5 shrink-0" />
                {totals.signed} firmada{totals.signed !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap lg:shrink-0">
              <Button
                size="sm"
                onClick={onExport}
                disabled={isExporting}
                className="h-8 flex-1 border-0 bg-[#C6A664] text-[#1B2A41] hover:bg-[#d4b574] sm:flex-none"
              >
                <ArrowDownTrayIcon className={`h-4.5 w-4.5 shrink-0 ${isExporting ? 'animate-pulse' : ''}`} />
                <span className="ml-1.5">{isExporting ? 'Exportando…' : 'Exportar'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="h-8 flex-1 border-white/20 bg-white/5 text-white hover:border-rose-400/30 hover:bg-rose-500/20 hover:text-rose-100 sm:flex-none"
              >
                <TrashIcon className="h-4.5 w-4.5 shrink-0" />
                <span className="ml-1.5">Eliminar</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-8 flex-1 text-white/80 hover:bg-white/10 hover:text-white sm:flex-none"
              >
                <XMarkIcon className="h-4.5 w-4.5 shrink-0" />
                <span className="ml-1">Deseleccionar</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
