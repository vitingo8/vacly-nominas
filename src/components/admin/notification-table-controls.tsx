'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FunnelIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import {
  NOTIFICATION_CATEGORIES,
  VACLY_NOTIFICATION_STATUSES,
} from '@/lib/admin-integrations/notifications/notification-workflow'

export type NotifTableRow = {
  id: string
  companyId: string
  companyName?: string | null
  provider: string
  externalId: string
  subject: string
  receivedAt: string
  accessDeadline: string | null
  adminStatus: { code: string; label: string }
  vaclyStatus: string
  vaclyStatusLabel: string
  category: string | null
  categoryLabel: string
  assignedUserId: string | null
  assignedUserName: string | null
}

export type SortColumn =
  | 'company'
  | 'provider'
  | 'subject'
  | 'category'
  | 'receivedAt'
  | 'deadline'
  | 'adminStatus'
  | 'vaclyStatus'
  | 'assignee'

export type SortDirection = 'asc' | 'desc'

export type FilterColumn =
  | 'company'
  | 'provider'
  | 'category'
  | 'adminStatus'
  | 'vaclyStatus'
  | 'assignee'

export type ColumnFilters = Partial<Record<FilterColumn, Set<string>>>

const PROVIDER_LABEL: Record<string, string> = { dehu: 'DEHú LEMA', aeat: 'AEAT', tgss: 'TGSS WSCN' }

const UNASSIGNED = '__none__'

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base' })
}

function compareDate(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? new Date(a).getTime() : 0
  const tb = b ? new Date(b).getTime() : 0
  return ta - tb
}

function deadlineOf(row: NotifTableRow): string | null {
  if (row.accessDeadline) return row.accessDeadline
  const base = new Date(row.receivedAt)
  if (Number.isNaN(base.getTime())) return null
  const d = new Date(base)
  d.setDate(d.getDate() + 10)
  return d.toISOString()
}

export function sortNotificationRows<T extends NotifTableRow>(
  rows: T[],
  column: SortColumn | null,
  direction: SortDirection,
): T[] {
  if (!column) return rows
  const sorted = [...rows]
  const dir = direction === 'asc' ? 1 : -1

  sorted.sort((a, b) => {
    let cmp = 0
    switch (column) {
      case 'company':
        cmp = compareText(a.companyName || a.companyId, b.companyName || b.companyId)
        break
      case 'provider':
        cmp = compareText(PROVIDER_LABEL[a.provider] || a.provider, PROVIDER_LABEL[b.provider] || b.provider)
        break
      case 'subject':
        cmp = compareText(
          `${a.externalId || ''}\t${a.subject}`,
          `${b.externalId || ''}\t${b.subject}`,
        )
        break
      case 'category':
        cmp = compareText(a.categoryLabel || a.category || '', b.categoryLabel || b.category || '')
        break
      case 'receivedAt':
        cmp = compareDate(a.receivedAt, b.receivedAt)
        break
      case 'deadline':
        cmp = compareDate(deadlineOf(a), deadlineOf(b))
        break
      case 'adminStatus':
        cmp = compareText(a.adminStatus.label, b.adminStatus.label)
        break
      case 'vaclyStatus':
        cmp = compareText(a.vaclyStatusLabel, b.vaclyStatusLabel)
        break
      case 'assignee':
        cmp = compareText(a.assignedUserName || 'zzz', b.assignedUserName || 'zzz')
        break
    }
    return cmp * dir
  })

  return sorted
}

export function filterNotificationRows<T extends NotifTableRow>(rows: T[], filters: ColumnFilters): T[] {
  return rows.filter((row) => {
    const companyKey = row.companyName || row.companyId
    if (filters.company?.size && !filters.company.has(companyKey)) return false

    if (filters.provider?.size && !filters.provider.has(row.provider)) return false

    const categoryKey = row.category || 'otro'
    if (filters.category?.size && !filters.category.has(categoryKey)) return false

    if (filters.adminStatus?.size && !filters.adminStatus.has(row.adminStatus.label)) return false

    if (filters.vaclyStatus?.size && !filters.vaclyStatus.has(row.vaclyStatus)) return false

    const assigneeKey = row.assignedUserId || UNASSIGNED
    if (filters.assignee?.size && !filters.assignee.has(assigneeKey)) return false

    return true
  })
}

export function buildFilterOptions(rows: NotifTableRow[]): Record<FilterColumn, Array<{ value: string; label: string }>> {
  const companies = new Map<string, string>()
  const providers = new Map<string, string>()
  const categories = new Map<string, string>()
  const adminStatuses = new Map<string, string>()
  const vaclyStatuses = new Map<string, string>()
  const assignees = new Map<string, string>()

  for (const row of rows) {
    const companyKey = row.companyName || row.companyId
    companies.set(companyKey, row.companyName || companyKey)

    providers.set(row.provider, PROVIDER_LABEL[row.provider] || row.provider)

    const cat = row.category || 'otro'
    const catLabel = NOTIFICATION_CATEGORIES.find((c) => c.id === cat)?.label || row.categoryLabel || 'Otro'
    categories.set(cat, catLabel)

    adminStatuses.set(row.adminStatus.label, row.adminStatus.label)

    vaclyStatuses.set(row.vaclyStatus, row.vaclyStatusLabel)

    const assigneeKey = row.assignedUserId || UNASSIGNED
    assignees.set(assigneeKey, row.assignedUserName || 'Sin asignar')
  }

  const sortOptions = (entries: Map<string, string>) =>
    [...entries.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => compareText(a.label, b.label))

  return {
    company: sortOptions(companies),
    provider: sortOptions(providers),
    category: sortOptions(categories),
    adminStatus: sortOptions(adminStatuses),
    vaclyStatus: sortOptions(vaclyStatuses).sort((a, b) => {
      const order: string[] = VACLY_NOTIFICATION_STATUSES.map((s) => s.id)
      return order.indexOf(a.value) - order.indexOf(b.value)
    }),
    assignee: sortOptions(assignees),
  }
}

export function countActiveFilters(filters: ColumnFilters): number {
  return Object.values(filters).filter((set) => set && set.size > 0).length
}

function FilterChecklist({
  options,
  selected,
  onChange,
  onClose,
}: {
  options: Array<{ value: string; label: string }>
  selected: Set<string> | undefined
  onChange: (next: Set<string> | undefined) => void
  onClose: () => void
}) {
  const effective = selected ?? new Set(options.map((o) => o.value))
  const allSelected = effective.size === options.length

  const toggle = (value: string) => {
    const next = new Set(effective)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    if (next.size === 0 || next.size === options.length) onChange(undefined)
    else onChange(next)
  }

  return (
    <div className="w-56 rounded-xl border border-[#1B2A41]/15 bg-white p-2 shadow-2xl">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#1B2A41]/8 pb-2">
        <span className="text-xs font-semibold text-[#1B2A41]">Filtrar</span>
        <div className="flex gap-1">
          <button
            type="button"
            className="text-[10px] text-[#1B2A41] hover:underline"
            onClick={() => onChange(undefined)}
          >
            Todo
          </button>
          <span className="text-[#1B2A41]/20">·</span>
          <button
            type="button"
            className="text-[10px] text-[#5C6B7F] hover:underline"
            onClick={() => onChange(new Set())}
          >
            Ninguno
          </button>
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto space-y-0.5">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[#F6F8FA]"
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[#1B2A41]/20 accent-[#1B2A41]"
              checked={effective.has(opt.value)}
              onChange={() => toggle(opt.value)}
            />
            <span className="truncate text-[#1B2A41]">{opt.label}</span>
          </label>
        ))}
      </div>
      {options.length === 0 && <p className="px-2 py-1 text-xs text-[#5C6B7F]">Sin valores</p>}
      <div className="mt-2 flex justify-end border-t border-[#1B2A41]/8 pt-2">
        <button
          type="button"
          className="text-xs font-medium text-[#1B2A41] hover:underline"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

export function NotificationColumnHeader({
  label,
  sortKey,
  filterKey,
  sortColumn,
  sortDirection,
  onSort,
  filterOptions,
  columnFilters,
  onFilterChange,
  className,
}: {
  label: string
  sortKey?: SortColumn
  filterKey?: FilterColumn
  sortColumn: SortColumn | null
  sortDirection: SortDirection
  onSort: (column: SortColumn) => void
  filterOptions: Array<{ value: string; label: string }>
  columnFilters: ColumnFilters
  onFilterChange: (column: FilterColumn, values: Set<string> | undefined) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number } | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isSorted = sortKey && sortColumn === sortKey
  const filterActive = filterKey && columnFilters[filterKey]?.size

  useEffect(() => setPortalReady(true), [])

  useEffect(() => {
    if (!open) return
    const update = () => {
      if (!btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      setMenuRect({ top: rect.bottom + 4, left: Math.max(8, rect.right - 224) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const menu =
    open && portalReady && menuRect && filterKey ? (
      createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, zIndex: 9999 }}
        >
          <FilterChecklist
            options={filterOptions}
            selected={columnFilters[filterKey]}
            onChange={(next) => onFilterChange(filterKey, next)}
            onClose={() => setOpen(false)}
          />
        </div>,
        document.body,
      )
    ) : null

  return (
    <>
      <th className={cn('p-2 text-center align-middle', className)}>
        <div className="flex w-full items-center justify-center gap-0.5">
          <button
            type="button"
            disabled={!sortKey}
            onClick={() => sortKey && onSort(sortKey)}
            className={cn(
              'inline-flex max-w-full items-center justify-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium transition-colors',
              sortKey ? 'text-[#5C6B7F] hover:bg-[#F6F8FA] hover:text-[#1B2A41]' : 'text-[#5C6B7F] cursor-default',
              isSorted && 'text-[#1B2A41]',
            )}
          >
            <span className="whitespace-normal text-center leading-tight">{label}</span>
            {isSorted &&
              (sortDirection === 'asc' ? (
                <ChevronUpIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
              ))}
          </button>
          {filterKey && (
            <button
              ref={btnRef}
              type="button"
              title="Filtrar"
              aria-label={`Filtrar ${label}`}
              onClick={() => setOpen((v) => !v)}
              className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
                filterActive
                  ? 'bg-[#C6A664]/25 text-[#1B2A41]'
                  : 'text-[#5C6B7F]/70 hover:bg-[#F6F8FA] hover:text-[#1B2A41]',
              )}
            >
              <FunnelIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </th>
      {menu}
    </>
  )
}

export function useNotificationTableView<T extends NotifTableRow>(rows: T[]) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>('receivedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({})

  const filterOptions = useMemo(() => buildFilterOptions(rows), [rows])

  const displayedRows = useMemo(() => {
    const filtered = filterNotificationRows(rows, columnFilters)
    return sortNotificationRows(filtered, sortColumn, sortDirection)
  }, [rows, columnFilters, sortColumn, sortDirection])

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleFilterChange = (column: FilterColumn, values: Set<string> | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      if (!values) delete next[column]
      else next[column] = values
      return next
    })
  }

  const clearAllFilters = () => setColumnFilters({})

  return {
    displayedRows,
    sortColumn,
    sortDirection,
    columnFilters,
    filterOptions,
    handleSort,
    handleFilterChange,
    clearAllFilters,
    activeFilterCount: countActiveFilters(columnFilters),
  }
}

export function TableToolbarHint({
  shown,
  total,
  activeFilterCount,
  onClearFilters,
  children,
}: {
  shown: number
  total: number
  activeFilterCount: number
  onClearFilters: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5C6B7F]">
      {children}
      {activeFilterCount > 0 && (
        <>
          <span className="text-[#1B2A41]/20">·</span>
          <span>
            {shown} de {total} tras filtros de columna
          </span>
          <button type="button" className="font-medium text-[#1B2A41] hover:underline" onClick={onClearFilters}>
            Limpiar filtros
          </button>
        </>
      )}
    </div>
  )
}
