'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, FunnelIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export type NotificationViewFilter = 'admin_pending' | 'vacly_active' | 'all'

const OPTIONS: Array<{ value: NotificationViewFilter; label: string; description: string }> = [
  {
    value: 'admin_pending',
    label: 'Pendientes',
    description: 'Sin comparecer ante la administración',
  },
  {
    value: 'vacly_active',
    label: 'Activas en Vacly',
    description: 'Todas excepto cerradas en gestión',
  },
  {
    value: 'all',
    label: 'Todas',
    description: 'Incluye cerradas y accedidas',
  },
]

const VIEWPORT_PADDING = 12
const MENU_MIN_WIDTH = 280

function computeMenuRect(trigger: DOMRect): { top: number; left: number; width: number } {
  const maxWidth = Math.max(0, window.innerWidth - VIEWPORT_PADDING * 2)
  const width = Math.min(Math.max(trigger.width, MENU_MIN_WIDTH), maxWidth)
  let left = trigger.right - width
  left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - width - VIEWPORT_PADDING))
  return {
    top: trigger.bottom + 6,
    left,
    width,
  }
}

interface NotificationViewFilterSelectProps {
  value: NotificationViewFilter
  onChange: (value: NotificationViewFilter) => void
}

export function NotificationViewFilterSelect({ value, onChange }: NotificationViewFilterSelectProps) {
  const [open, setOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      if (!triggerRef.current) return
      setMenuRect(computeMenuRect(triggerRef.current.getBoundingClientRect()))
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const menu =
    open && menuRect && portalReady
      ? createPortal(
          <div
            ref={menuRef}
            className="max-w-[calc(100vw-1.5rem)] rounded-xl border border-[#1B2A41]/15 bg-white py-1.5 shadow-2xl"
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 9999,
            }}
          >
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors',
                  value === option.value
                    ? 'bg-[#C6A664]/12 text-[#1B2A41]'
                    : 'text-slate-700 hover:bg-[#1B2A41]/5',
                )}
              >
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-[11px] text-slate-500">{option.description}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          id="notif-status-filter"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'inline-flex h-9 min-w-[12.5rem] items-center gap-2 rounded-lg border border-[#1B2A41]/20 bg-white px-3 text-sm font-medium text-[#1B2A41] shadow-sm',
            'transition-colors hover:border-[#C6A664]/50 hover:bg-[#1B2A41]/[0.02]',
            'focus:outline-none focus:ring-2 focus:ring-[#C6A664]/35',
            open && 'border-[#C6A664]/45 ring-2 ring-[#C6A664]/20',
          )}
        >
          <FunnelIcon className="h-4 w-4 shrink-0 text-[#C6A664]" aria-hidden />
          <span className="min-w-0 flex-1 text-left">{selected.label}</span>
          <ChevronDownIcon
            className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>
      {menu}
    </>
  )
}
