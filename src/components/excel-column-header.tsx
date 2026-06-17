'use client'

import { ChevronDownIcon, ChevronUpIcon, FunnelIcon } from '@heroicons/react/24/outline'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { NominaSortDir } from '@/lib/nomina-list-query'

interface ExcelColumnHeaderProps {
  label: string
  align?: 'left' | 'center' | 'right'
  sortActive?: boolean
  sortDir?: NominaSortDir
  onSort?: () => void
  filterable?: boolean
  filterActive?: boolean
  filterOpen?: boolean
  onFilterToggle?: () => void
  filterPanel?: React.ReactNode
  className?: string
}

export function ExcelColumnHeader({
  label,
  align = 'left',
  sortActive,
  sortDir,
  onSort,
  filterable,
  filterActive,
  filterOpen,
  onFilterToggle,
  filterPanel,
  className,
}: ExcelColumnHeaderProps) {
  return (
    <TableHead className={cn('relative select-none p-0 align-middle', className)}>
      <div
        className={cn(
          'flex items-center gap-0.5 border-b border-transparent px-1.5 py-2',
          align === 'center' && 'justify-center',
          align === 'right' && 'justify-end',
        )}
      >
        <button
          type="button"
          onClick={onSort}
          disabled={!onSort}
          className={cn(
            'inline-flex min-w-0 items-center gap-0.5 rounded px-0.5 text-xs font-semibold text-slate-700',
            onSort && 'hover:bg-slate-200/70',
            align === 'center' && 'justify-center',
            align === 'right' && 'justify-end',
            !onSort && 'cursor-default',
          )}
        >
          <span className="truncate">{label}</span>
          {sortActive && sortDir === 'asc' && (
            <ChevronUpIcon className="h-3.5 w-3.5 shrink-0 text-[#C6A664]" aria-hidden />
          )}
          {sortActive && sortDir === 'desc' && (
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-[#C6A664]" aria-hidden />
          )}
        </button>
        {filterable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onFilterToggle?.()
            }}
            className={cn(
              'shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-600',
              (filterActive || filterOpen) && 'bg-[#C6A664]/15 text-[#1B2A41]',
            )}
            title={`Filtrar: ${label}`}
            aria-expanded={filterOpen}
          >
            <FunnelIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {filterOpen && filterPanel && (
        <div
          className="absolute left-0 top-full z-[200] mt-0.5 min-w-[11rem] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {filterPanel}
        </div>
      )}
    </TableHead>
  )
}
