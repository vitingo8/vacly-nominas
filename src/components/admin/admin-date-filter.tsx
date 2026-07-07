'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDaysIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

interface AdminDateFilterProps {
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
}

function parseIsoDate(value: string): Date | null {
  if (!value) return null
  const d = new Date(`${value}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDisplay(value: string): string {
  const d = parseIsoDate(value)
  if (!d) return ''
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function monthLabel(year: number, month: number): string {
  const d = new Date(year, month, 1)
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

/** Selector de fecha corporativo (calendario en portal, mismo lenguaje que AdminFilterSelect). */
export function AdminDateFilter({ value, onChange, label, className }: AdminDateFilterProps) {
  const [open, setOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = parseIsoDate(value)
  const [viewYear, setViewYear] = useState(() => selected?.getFullYear() ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => selected?.getMonth() ?? new Date().getMonth())

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const d = parseIsoDate(value)
    if (d) {
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [open, value])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
      })
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

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const startPad = (first.getDay() + 6) % 7
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate()
    const items: Array<{ day: number; iso: string } | null> = []
    for (let i = 0; i < startPad; i++) items.push(null)
    for (let day = 1; day <= totalDays; day++) {
      items.push({ day, iso: toIsoDate(viewYear, viewMonth, day) })
    }
    return items
  }, [viewYear, viewMonth])

  const display = value ? formatDisplay(value) : label
  const todayIso = toIsoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

  const menu =
    open && menuRect && portalReady
      ? createPortal(
          <div
            ref={menuRef}
            className="rounded-xl border border-[#1B2A41]/10 bg-white p-3 shadow-2xl"
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 9999,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11)
                    setViewYear((y) => y - 1)
                  } else setViewMonth((m) => m - 1)
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#1B2A41] hover:bg-[#F6F8FA]"
                aria-label="Mes anterior"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold capitalize text-[#1B2A41]">
                {monthLabel(viewYear, viewMonth)}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0)
                    setViewYear((y) => y + 1)
                  } else setViewMonth((m) => m + 1)
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#1B2A41] hover:bg-[#F6F8FA]"
                aria-label="Mes siguiente"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((wd) => (
                <span
                  key={wd}
                  className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5C6B7F]/70"
                >
                  {wd}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell, idx) =>
                cell ? (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      onChange(cell.iso)
                      setOpen(false)
                    }}
                    className={cn(
                      'h-8 rounded-lg text-xs font-medium transition-colors',
                      value === cell.iso
                        ? 'bg-[#1B2A41] text-white shadow-sm'
                        : cell.iso === todayIso
                          ? 'border border-[#C6A664]/40 text-[#1B2A41] hover:bg-[#C6A664]/10'
                          : 'text-[#5C6B7F] hover:bg-[#C6A664]/8 hover:text-[#1B2A41]',
                    )}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <span key={`pad-${idx}`} className="h-8" aria-hidden />
                ),
              )}
            </div>

            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-[#5C6B7F] transition-colors hover:bg-[#F6F8FA] hover:text-[#1B2A41]"
              >
                Limpiar fecha
              </button>
            )}
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
          aria-label={label}
        >
          <CalendarDaysIcon className="h-3.5 w-3.5 shrink-0 text-[#C6A664]" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left text-xs font-medium',
              value ? 'text-[#1B2A41]' : 'text-[#5C6B7F]',
            )}
          >
            {display}
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
