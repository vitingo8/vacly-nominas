'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export interface AdminFilterSelectOption {
  value: string
  label: string
}

interface AdminFilterSelectProps {
  value: string
  onChange: (value: string) => void
  options: AdminFilterSelectOption[]
  placeholder: string
  className?: string
  minWidth?: number
}

/** Desplegable corporativo para barras de filtro (mismo lenguaje que EmployeeFilterSelect). */
export function AdminFilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  minWidth = 160,
}: AdminFilterSelectProps) {
  const [open, setOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const displayLabel = selected?.label || placeholder

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, minWidth),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, minWidth])

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
            className="max-h-72 overflow-y-auto rounded-xl border border-[#1B2A41]/10 bg-white py-1 shadow-2xl"
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 9999,
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value || '__all__'}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-left text-xs transition-colors hover:bg-[#C6A664]/8',
                  value === opt.value && 'bg-[#C6A664]/12 font-medium text-[#1B2A41]',
                  value !== opt.value && 'text-slate-700',
                )}
              >
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div ref={rootRef} className={cn('relative min-w-0', className)}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-[#1B2A41]/12 bg-white px-2.5 shadow-sm',
            'transition-colors hover:border-[#C6A664]/40 focus:outline-none focus:ring-2 focus:ring-[#C6A664]/30',
            value && 'border-[#C6A664]/35 bg-gradient-to-r from-white to-[#C6A664]/5',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-[#1B2A41]">
            {displayLabel}
          </span>
          <ChevronDownIcon
            className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>
      {menu}
    </>
  )
}
