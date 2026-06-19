'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { StoreItemIcon } from '@/components/store/store-item-icon'
import { StoreHeaderBackground } from '@/components/store/store-header-background'
import { StoreTitleTypewriter } from '@/components/store/store-title-typewriter'
import {
  STORE_FILTERS,
  STORE_ITEMS,
  STORE_LOGOS_BASE,
  type StoreItem,
  type StoreTab,
} from '@/lib/store/store-catalog'

export type StoreViewMode = 'grid' | 'tabla'

/** Sube el número al reemplazar el PNG en Supabase (evita caché del navegador y de Next/Image). */
export const STORE_LOGO_VERSION = '5'

export const STORE_LOGO_URL = `${STORE_LOGOS_BASE}/vacly_store.png?v=${STORE_LOGO_VERSION}`

export const CATEGORY_LABELS: Record<string, string> = {
  tiempo: 'Tiempo',
  proyectos: 'Proyectos',
  laboral: 'Laboral',
  fiscal: 'Fiscal',
  administracion: 'Administración',
  nominas: 'Nóminas',
  rrhh: 'RRHH',
  bancos: 'Bancos',
  documentos: 'Documentos',
  planes: 'Planes',
  paquetes: 'Paquetes',
  consumo: 'Consumo',
  soporte: 'Soporte',
  automatizacion: 'Automatización',
  erp: 'ERP',
  tgss: 'TGSS',
  firmas: 'Firmas',
  correo: 'Correo',
  banca: 'Banca',
  pagos: 'Pagos',
  comunicacion: 'Comunicación',
  ia: 'IA',
}

export const BADGE_STYLES: Record<NonNullable<StoreItem['badge']>, string> = {
  instalado: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20',
  nuevo: 'bg-[#3B9EDE]/10 text-[#2563a8] ring-[#3B9EDE]/25',
  popular: 'bg-[#C6A664]/15 text-[#8a6d2e] ring-[#C6A664]/30',
  pro: 'bg-[#1B2A41]/8 text-[#1B2A41] ring-[#1B2A41]/15',
}

export const BADGE_LABELS: Record<NonNullable<StoreItem['badge']>, string> = {
  instalado: 'Instalado',
  nuevo: 'Nuevo',
  popular: 'Popular',
  pro: 'PRO',
}

export function useStoreCatalog() {
  const [activeTab, setActiveTab] = useState<StoreTab>('modulos')
  const [activeFilter, setActiveFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<StoreViewMode>('grid')

  const filters = STORE_FILTERS[activeTab]

  const visibleItems = useMemo(() => {
    const items = STORE_ITEMS[activeTab]
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesFilter = activeFilter === 'todos' || item.category === activeFilter
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      return matchesFilter && matchesSearch
    })
  }, [activeTab, activeFilter, search])

  const handleTabChange = (tab: StoreTab) => {
    setActiveTab(tab)
    setActiveFilter('todos')
    setSearch('')
  }

  return {
    activeTab,
    activeFilter,
    search,
    viewMode,
    filters,
    visibleItems,
    setActiveFilter,
    setSearch,
    setViewMode,
    handleTabChange,
  }
}

export function getCta(item: StoreItem): { label: string; primary: boolean } {
  if (item.badge === 'instalado') return { label: 'Gestionar', primary: false }
  if (item.badge === 'nuevo') return { label: 'Activar', primary: true }
  if (item.badge === 'popular') return { label: 'Descubrir', primary: true }
  if (item.badge === 'pro') return { label: 'Solicitar acceso', primary: true }
  return { label: 'Explorar', primary: false }
}

export function ItemBadge({ badge }: { badge: NonNullable<StoreItem['badge']> }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset',
        BADGE_STYLES[badge],
      )}
    >
      {BADGE_LABELS[badge]}
    </span>
  )
}

export function ItemVisual({
  item,
  size = 'md',
}: {
  item: StoreItem
  size?: 'sm' | 'md' | 'lg'
}) {
  const box =
    size === 'sm' ? 'h-10 w-10 rounded-xl' : size === 'lg' ? 'h-20 w-20 rounded-2xl' : 'h-12 w-12 rounded-xl'
  const icon = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'
  const img = size === 'sm' ? 40 : size === 'lg' ? 80 : 48

  if (item.imageUrl) {
    return (
      <div className={cn('relative shrink-0', box)}>
        <Image
          src={item.imageUrl}
          alt=""
          width={img}
          height={img}
          className="h-full w-full object-contain"
        />
      </div>
    )
  }

  return (
    <div
      className={cn('flex shrink-0 items-center justify-center text-white', box)}
      style={{ backgroundColor: item.iconBg }}
    >
      <StoreItemIcon name={item.icon} className={icon} />
    </div>
  )
}

export function StorePrice({
  item,
  className,
  align = 'left',
}: {
  item: StoreItem
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <div
      className={cn(
        'min-w-0',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      <p className="text-sm font-bold leading-tight text-[#1B2A41]">{item.priceLabel}</p>
      {item.priceNote && (
        <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{item.priceNote}</p>
      )}
    </div>
  )
}

export function CtaButton({
  item,
  className,
  alwaysVisible = true,
}: {
  item: StoreItem
  className?: string
  alwaysVisible?: boolean
}) {
  const cta = getCta(item)
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all',
        alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        cta.primary
          ? 'bg-[#1B2A41] text-white hover:bg-[#152036]'
          : 'bg-slate-100 text-[#1B2A41] hover:bg-slate-200/80',
        className,
      )}
    >
      {cta.label}
      <ArrowRightIcon className="h-3.5 w-3.5" />
    </button>
  )
}

export function StoreLogoTitle({ subtitle }: { subtitle?: string }) {
  return (
    <header className="relative mb-6 overflow-hidden rounded-2xl border border-[#3DA2E1]/10 bg-gradient-to-br from-white via-[#EBF5FC]/40 to-[#D7EBF9]/60 shadow-sm sm:mb-7">
      <StoreHeaderBackground />
      <div className="relative z-10 flex flex-col items-center gap-2 px-4 py-6 text-center sm:flex-row sm:justify-center sm:gap-4 sm:px-6 sm:py-7">
        <Image
          key={STORE_LOGO_URL}
          src={STORE_LOGO_URL}
          alt=""
          width={320}
          height={100}
          priority
          unoptimized
          className="h-16 w-auto max-w-[min(100%,16rem)] object-contain sm:h-[4.5rem] sm:max-w-[18rem] lg:h-20 lg:max-w-[20rem]"
        />
        <StoreTitleTypewriter className="text-[1.75rem] sm:text-[2.125rem] lg:text-4xl" />
        {subtitle && (
          <p className="w-full max-w-md text-sm leading-relaxed text-slate-500 sm:mt-0">{subtitle}</p>
        )}
      </div>
    </header>
  )
}

export function EmptyResults() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-[#FDFDFD] px-6 py-20 text-center">
      <p className="text-base font-semibold text-[#1B2A41]">Sin resultados</p>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500">
        Prueba con otro filtro o término de búsqueda.
      </p>
    </div>
  )
}
