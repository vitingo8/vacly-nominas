'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { cn } from '@/lib/utils'

export interface NotificationTeamMember {
  id: string
  name: string
  avatar?: string | null
  email?: string | null
}

interface NotificationAssigneeSelectProps {
  value: string | null
  members: NotificationTeamMember[]
  onChange: (userId: string | null) => void
  disabled?: boolean
  className?: string
}

export function NotificationAssigneeSelect({
  value,
  members,
  onChange,
  disabled,
  className,
}: NotificationAssigneeSelectProps) {
  const [open, setOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = members.find((m) => m.id === value)

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
        width: Math.max(rect.width, 240),
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

  const menu =
    open && menuRect && portalReady
      ? createPortal(
          <div
            ref={menuRef}
            className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl"
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 9999,
            }}
          >
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-slate-50',
                !value && 'bg-slate-50',
              )}
            >
              <PersonAvatar name="Sin asignar" size="xs" />
              <span className="text-sm text-slate-600">Sin asignar</span>
            </button>
            <div className="my-1 border-t border-slate-100" />
            {members.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">No hay usuarios disponibles</p>
            )}
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  onChange(member.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#C6A664]/8',
                  value === member.id && 'bg-[#C6A664]/12',
                )}
              >
                <PersonAvatar name={member.name} imageUrl={member.avatar} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{member.name}</p>
                  {member.email && <p className="truncate text-[11px] text-slate-500">{member.email}</p>}
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div ref={rootRef} className={cn('relative inline-flex', className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          title={selected?.name || 'Asignar responsable'}
          aria-label={selected ? `Responsable: ${selected.name}` : 'Asignar responsable'}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-sm',
            'transition-colors hover:border-[#C6A664]/40 focus:outline-none focus:ring-2 focus:ring-[#C6A664]/30',
            value ? 'border-[#C6A664]/45' : 'border-slate-200/80',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <PersonAvatar
            name={selected?.name || 'Sin asignar'}
            imageUrl={selected?.avatar}
            size="xs"
          />
          <ChevronDownIcon
            className={cn(
              'pointer-events-none absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-white text-slate-400 shadow-sm transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>
      {menu}
    </>
  )
}
