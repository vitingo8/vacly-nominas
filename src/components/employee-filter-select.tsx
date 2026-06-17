'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, UserIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export interface EmployeeFilterOption {
  id: string
  name: string
  nif?: string
  hire_date?: string | null
  image_url?: string | null
}

function EmployeeAvatar({
  name,
  imageUrl,
  size = 'sm',
}: {
  name: string
  imageUrl?: string | null
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8'
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn(dim, 'shrink-0 rounded-full border border-slate-200/80 object-cover')}
      />
    )
  }
  return (
    <div
      className={cn(
        dim,
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1B2A41] to-[#C6A664]',
      )}
    >
      <UserIcon className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', 'text-white')} />
    </div>
  )
}

interface EmployeeFilterSelectProps {
  value: string
  onChange: (id: string) => void
  employees: EmployeeFilterOption[]
  className?: string
}

export function EmployeeFilterSelect({ value, onChange, employees, className }: EmployeeFilterSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = employees.find((e) => e.id === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={cn('relative min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2 shadow-sm',
          'transition-colors hover:border-[#C6A664]/40 focus:outline-none focus:ring-2 focus:ring-[#C6A664]/30',
          value && 'border-[#C6A664]/35 bg-gradient-to-r from-white to-[#C6A664]/5',
        )}
      >
        <EmployeeAvatar name={selected?.name || 'Todos'} imageUrl={selected?.image_url} />
        <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-800 sm:text-sm">
          {selected ? selected.name : 'Todos los empleados'}
        </span>
        <ChevronDownIcon
          className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[200] mt-1 max-h-72 w-full min-w-[15rem] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
              !value && 'bg-[#C6A664]/10',
            )}
          >
            <EmployeeAvatar name="Todos" size="md" />
            <span className="font-medium text-slate-700">Todos los empleados</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          {employees.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => {
                onChange(emp.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#C6A664]/8',
                value === emp.id && 'bg-[#C6A664]/12',
              )}
            >
              <EmployeeAvatar name={emp.name} imageUrl={emp.image_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{emp.name}</p>
                {emp.nif && <p className="truncate text-xs text-slate-500">{emp.nif}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
