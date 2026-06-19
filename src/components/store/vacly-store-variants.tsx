'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import {
  CheckIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  Squares2X2Icon,
  TableCellsIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { StoreItemIcon } from '@/components/store/store-item-icon'
import { STORE_FILTERS, STORE_TABS, type StoreItem, type StoreTab } from '@/lib/store/store-catalog'
import {
  CATEGORY_LABELS,
  EmptyResults,
  ItemBadge,
  StoreLogoTitle,
  StorePrice,
  type StoreViewMode,
  useStoreCatalog,
} from '@/components/store/vacly-store-shared'
import { StoreCompanyProvider, useStoreCompany } from '@/components/store/store-company-context'
import { StoreCartProvider, useStoreCart } from '@/components/store/store-cart-context'
import { CartButton, CartDrawer } from '@/components/store/store-cart'
import { StoreItemDetail } from '@/components/store/store-item-detail'

const FULL_GRID =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'

const SOLES_GRID =
  'grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

/** Columnas fluidas: icono fijo · módulo · descripción (flex) · precio · categoría · estado · acciones */
const TABLE_ROW_GRID =
  'grid w-full grid-cols-[2.25rem_minmax(7rem,1fr)_minmax(0,3fr)_minmax(5.5rem,0.9fr)_minmax(5rem,0.75fr)_minmax(5.5rem,0.7fr)_minmax(8.5rem,auto)] items-center gap-x-3 sm:gap-x-4 lg:grid-cols-[2.5rem_minmax(9rem,1.1fr)_minmax(0,4fr)_minmax(6.5rem,1fr)_minmax(5.5rem,0.85fr)_minmax(6rem,0.8fr)_minmax(9rem,auto)]'

const TABLE_ACTION_BTN =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-sm transition-colors hover:border-[#3B9EDE]/45 hover:bg-[#3B9EDE]/5 hover:text-[#1B2A41] active:scale-[0.98]'

const TABLE_ROW_GRID_SOLES =
  'grid w-full grid-cols-[4.5rem_minmax(7rem,1fr)_minmax(0,3fr)_minmax(5.5rem,0.9fr)_minmax(5rem,0.75fr)_minmax(5.5rem,0.7fr)_minmax(8.5rem,auto)] items-center gap-x-3 sm:gap-x-4 lg:grid-cols-[5rem_minmax(9rem,1.1fr)_minmax(0,4fr)_minmax(6.5rem,1fr)_minmax(5.5rem,0.85fr)_minmax(6rem,0.8fr)_minmax(9rem,auto)]'

function StoreItemIconInline({
  item,
  size = 'md',
}: {
  item: StoreItem
  size?: 'sm' | 'md' | 'lg'
}) {
  const box =
    size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-14 w-14 sm:h-16 sm:w-16' : 'h-9 w-9'
  const icon = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-8 w-8' : 'h-7 w-7'
  const img = size === 'sm' ? 28 : size === 'lg' ? 64 : 36

  return (
    <div className={cn('flex shrink-0 items-center justify-center', box)}>
      {item.imageUrl ? (
        <Image
          key={item.imageUrl}
          src={item.imageUrl}
          alt=""
          width={img}
          height={img}
          unoptimized
          className="h-full w-full object-contain"
        />
      ) : (
        <span style={{ color: item.iconBg }}>
          <StoreItemIcon name={item.icon} className={icon} />
        </span>
      )}
    </div>
  )
}

function CategoryChip({ item, className }: { item: StoreItem; className?: string }) {
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]',
        className,
      )}
      style={{ backgroundColor: `${item.iconBg}14`, color: item.iconBg }}
    >
      {categoryLabel}
    </span>
  )
}

function StoreShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-h-screen w-full pb-24', className)}>
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">{children}</div>
    </div>
  )
}

function StoreTabs({
  activeTab,
  onChange,
  align = 'center',
}: {
  activeTab: StoreTab
  onChange: (tab: StoreTab) => void
  align?: 'center' | 'start'
}) {
  return (
    <div className="w-full border-b border-slate-200/80">
      <div
        className={cn(
          'flex w-full gap-1 overflow-x-auto pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          align === 'center' ? 'justify-center' : 'justify-start',
        )}
      >
        {STORE_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative shrink-0 px-5 py-3 text-sm font-medium transition-colors',
                isActive ? 'text-[#1B2A41]' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#1B2A41]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StoreViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: StoreViewMode
  onChange: (mode: StoreViewMode) => void
}) {
  return (
    <div
      className="flex shrink-0 items-center overflow-hidden rounded-xl border border-slate-200 bg-white"
      role="group"
      aria-label="Vista del catálogo"
    >
      <button
        type="button"
        title="Vista en grid"
        aria-label="Vista en grid"
        aria-pressed={viewMode === 'grid'}
        onClick={() => onChange('grid')}
        className={cn(
          'p-2.5 transition-colors',
          viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
        )}
      >
        <Squares2X2Icon className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Vista en tabla"
        aria-label="Vista en tabla"
        aria-pressed={viewMode === 'tabla'}
        onClick={() => onChange('tabla')}
        className={cn(
          'p-2.5 transition-colors',
          viewMode === 'tabla' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
        )}
      >
        <TableCellsIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

function StoreFiltersBar({
  filters,
  activeFilter,
  onFilter,
  search,
  onSearch,
  viewMode,
  onViewModeChange,
  showFilters = true,
  stretch = false,
}: {
  filters: (typeof STORE_FILTERS)[StoreTab]
  activeFilter: string
  onFilter: (id: string) => void
  search: string
  onSearch: (v: string) => void
  viewMode: StoreViewMode
  onViewModeChange: (mode: StoreViewMode) => void
  showFilters?: boolean
  stretch?: boolean
}) {
  return (
    <div
      className={cn(
        'mb-6 flex w-full flex-col gap-4 lg:flex-row lg:items-center',
        stretch && (showFilters ? 'lg:justify-between' : 'lg:justify-end'),
      )}
    >
      {showFilters && (
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {filters.map((filter) => {
            const isActive = activeFilter === filter.id
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => onFilter(filter.id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#1B2A41] text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300',
                )}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex w-full shrink-0 items-center gap-3 lg:w-auto">
        <StoreViewToggle viewMode={viewMode} onChange={onViewModeChange} />
        <div className="relative min-w-0 flex-1 lg:w-72">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar..."
            className="h-10 w-full rounded-xl border-slate-200 bg-white pl-9"
          />
        </div>
      </div>
    </div>
  )
}

function EffectiveBadge({ item }: { item: StoreItem }) {
  const { isInstalled } = useStoreCompany()
  if (isInstalled(item)) return <ItemBadge badge="instalado" />
  if (item.badge && item.badge !== 'instalado') return <ItemBadge badge={item.badge} />
  if (item.badge === 'instalado') return null
  return null
}

function CardSolesGrid({
  item,
  onOpenDetail,
}: {
  item: StoreItem
  onOpenDetail: (item: StoreItem) => void
}) {
  return (
    <article
      onClick={() => onOpenDetail(item)}
      className="group relative flex h-full min-h-[17.5rem] cursor-pointer flex-col overflow-hidden rounded-[1.25rem] border border-slate-200/75 bg-white transition-all duration-200 hover:-translate-y-1 hover:border-[#C6A664]/45 hover:shadow-[0_18px_40px_rgba(198,166,100,0.2)]"
    >
      <div className="relative flex h-[9.5rem] items-center justify-center border-b border-slate-100 bg-white sm:h-[10.5rem]">
        <div className="absolute right-3 top-3 z-10">
          <EffectiveBadge item={item} />
        </div>
        {item.imageUrl && (
          <Image
            key={item.imageUrl}
            src={item.imageUrl}
            alt=""
            width={220}
            height={220}
            unoptimized
            className="h-[5.75rem] w-auto object-contain drop-shadow-[0_8px_20px_rgba(27,42,65,0.1)] transition-transform duration-300 group-hover:scale-110 sm:h-[6.75rem] lg:h-[7.5rem]"
          />
        )}
      </div>
      <div className="flex min-h-[7.5rem] flex-1 flex-col p-4 pt-3">
        <h3 className="text-base font-bold leading-tight text-[#1B2A41] sm:text-[17px]">{item.title}</h3>
        <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-snug text-slate-500">{item.description}</p>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-2.5">
          <StorePrice item={item} />
          <StoreItemActions item={item} onOpenDetail={onOpenDetail} />
        </div>
      </div>
    </article>
  )
}

function CardGrid({
  item,
  onOpenDetail,
}: {
  item: StoreItem
  onOpenDetail: (item: StoreItem) => void
}) {
  return (
    <article
      onClick={() => onOpenDetail(item)}
      className="group relative flex h-full min-h-[13.5rem] cursor-pointer flex-col overflow-hidden rounded-[1.25rem] border border-slate-200/75 bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3B9EDE]/30 hover:shadow-[0_14px_30px_rgba(27,42,65,0.07)]"
    >
      <div className="flex items-center justify-between gap-2">
        <CategoryChip item={item} />
        <EffectiveBadge item={item} />
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <StoreItemIconInline item={item} />
        <h3 className="min-w-0 text-[15px] font-bold leading-tight tracking-tight text-[#1B2A41]">
          {item.title}
        </h3>
      </div>
      <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-snug text-slate-500">
        {item.description}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-2.5">
        <StorePrice item={item} />
        <StoreItemActions item={item} onOpenDetail={onOpenDetail} />
      </div>
    </article>
  )
}

function StoreItemActions({
  item,
  onOpenDetail,
}: {
  item: StoreItem
  onOpenDetail?: (item: StoreItem) => void
}) {
  const { add, has, remove } = useStoreCart()
  const { isInstalled } = useStoreCompany()
  const subscribed = isInstalled(item)
  const inCart = has(item.id)

  return (
    <div className="flex shrink-0 items-center justify-center gap-2">
      <button
        type="button"
        title="Más información"
        aria-label={`Más información sobre ${item.title}`}
        className={TABLE_ACTION_BTN}
        onClick={(e) => {
          e.stopPropagation()
          onOpenDetail?.(item)
        }}
      >
        <DocumentTextIcon className="h-5 w-5" strokeWidth={1.75} />
      </button>
      {subscribed ? (
        <span
          title="Ya contratado"
          aria-label={`${item.title} ya contratado`}
          className={cn(TABLE_ACTION_BTN, 'cursor-default text-emerald-600')}
        >
          <CheckIcon className="h-5 w-5" strokeWidth={2} />
        </span>
      ) : inCart ? (
        <button
          type="button"
          title="Quitar del carrito"
          aria-label={`Quitar ${item.title} del carrito`}
          onClick={(e) => {
            e.stopPropagation()
            remove(item.id)
          }}
          className={cn(
            TABLE_ACTION_BTN,
            'text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700',
          )}
        >
          <XCircleIcon className="h-5 w-5" strokeWidth={1.75} />
        </button>
      ) : (
        <button
          type="button"
          title="Añadir al carrito"
          aria-label={`Añadir ${item.title} al carrito`}
          onClick={(e) => {
            e.stopPropagation()
            add(item)
          }}
          className={cn(TABLE_ACTION_BTN, 'text-[#1B2A41] hover:border-[#1B2A41]/25 hover:bg-[#1B2A41]/5')}
        >
          <ShoppingCartIcon className="h-5 w-5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

function RowCompact({
  item,
  largeVisual = false,
  onOpenDetail,
}: {
  item: StoreItem
  largeVisual?: boolean
  onOpenDetail: (item: StoreItem) => void
}) {
  const { isInstalled } = useStoreCompany()
  const installed = isInstalled(item)
  const effectiveBadge = installed ? 'instalado' : item.badge && item.badge !== 'instalado' ? item.badge : null

  return (
    <div
      onClick={() => onOpenDetail(item)}
      className={cn(
        largeVisual ? TABLE_ROW_GRID_SOLES : TABLE_ROW_GRID,
        'min-h-[3.25rem] cursor-pointer border-b border-slate-100 bg-white px-3 py-3.5 transition-colors last:border-b-0 hover:bg-slate-50/60 sm:px-5',
        largeVisual && 'min-h-[4.5rem] py-4',
      )}
    >
      <div className="flex justify-center">
        <StoreItemIconInline item={item} size={largeVisual ? 'lg' : 'sm'} />
      </div>
      <h3 className="min-w-0 break-words text-sm font-bold leading-snug text-[#1B2A41]">{item.title}</h3>
      <p className="min-w-0 break-words text-sm leading-relaxed text-slate-500">{item.description}</p>
      <StorePrice item={item} align="center" />
      <div className="flex justify-center">
        <CategoryChip item={item} className="max-w-full" />
      </div>
      <div className="flex justify-center">
        {effectiveBadge ? (
          <ItemBadge badge={effectiveBadge} />
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </div>
      <StoreItemActions item={item} onOpenDetail={onOpenDetail} />
    </div>
  )
}

function StoreTable({
  items,
  largeVisual = false,
  onOpenDetail,
}: {
  items: StoreItem[]
  largeVisual?: boolean
  onOpenDetail: (item: StoreItem) => void
}) {
  const rowGrid = largeVisual ? TABLE_ROW_GRID_SOLES : TABLE_ROW_GRID
  return (
    <div className="w-full overflow-x-auto rounded-[1.25rem] border border-slate-200/75 bg-white">
      <div className="w-full min-w-[36rem]">
        <div
          className={cn(
            rowGrid,
            'min-h-[2.75rem] border-b border-slate-200/80 bg-[#F5F5F7] px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-5',
          )}
        >
          <span />
          <span>{largeVisual ? 'Paquete' : 'Módulo'}</span>
          <span>Descripción</span>
          <span className="text-center">Precio</span>
          <span className="text-center">Categoría</span>
          <span className="text-center">Estado</span>
          <span className="text-center">Acciones</span>
        </div>
        {items.map((item) => (
          <RowCompact
            key={item.id}
            item={item}
            largeVisual={largeVisual}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

/** Saldo de Soles de la empresa, junto al carrito (misma altura que CartButton). */
function SolesBalancePill() {
  const { solesBalance } = useStoreCompany()
  return (
    <span
      className="inline-flex items-center gap-3 rounded-2xl border border-[#C6A664]/40 bg-[#FBF6EC] px-4 py-3 shadow-sm"
      title="Saldo de Soles de tu empresa"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C6A664]/20 text-xl leading-none">
        <span aria-hidden>☀️</span>
      </span>
      <span className="hidden flex-col items-start leading-tight sm:flex">
        <span className="text-sm font-semibold text-[#8A6D2F]">
          {solesBalance.toLocaleString('es-ES')}
        </span>
        <span className="text-xs font-medium text-[#A98B4F]">Soles</span>
      </span>
    </span>
  )
}

/** Store principal — grid o tabla */
function VaclyStoreInner() {
  const catalog = useStoreCatalog()
  const isSolesTab = catalog.activeTab === 'soles'
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null)
  const { isOpen: cartOpen, close: closeCart } = useStoreCart()
  const hasOpenDialog = !!selectedItem || cartOpen

  useEffect(() => {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'vacly-store-dialog', open: hasOpenDialog }, '*')
    }
  }, [hasOpenDialog])

  useEffect(() => {
    if (!hasOpenDialog) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (cartOpen) closeCart()
      else setSelectedItem(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasOpenDialog, cartOpen, closeCart])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'vacly-store-escape') return
      if (cartOpen) closeCart()
      else setSelectedItem(null)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [cartOpen, closeCart])

  return (
    <StoreShell className="bg-[#F5F5F7]">
      <StoreLogoTitle
        actions={
          <div className="flex items-center gap-2">
            <SolesBalancePill />
            <CartButton />
          </div>
        }
        tabs={<StoreTabs activeTab={catalog.activeTab} onChange={catalog.handleTabChange} />}
      />
      <StoreFiltersBar
        filters={catalog.filters}
        activeFilter={catalog.activeFilter}
        onFilter={catalog.setActiveFilter}
        search={catalog.search}
        onSearch={catalog.setSearch}
        viewMode={catalog.viewMode}
        onViewModeChange={catalog.setViewMode}
        showFilters={catalog.filters.length > 1}
        stretch
      />
      {catalog.visibleItems.length > 0 ? (
        catalog.viewMode === 'grid' ? (
          <div className={isSolesTab ? SOLES_GRID : FULL_GRID}>
            {catalog.visibleItems.map((item) =>
              isSolesTab ? (
                <CardSolesGrid key={item.id} item={item} onOpenDetail={setSelectedItem} />
              ) : (
                <CardGrid key={item.id} item={item} onOpenDetail={setSelectedItem} />
              ),
            )}
          </div>
        ) : (
          <StoreTable
            items={catalog.visibleItems}
            largeVisual={isSolesTab}
            onOpenDetail={setSelectedItem}
          />
        )
      ) : (
        <EmptyResults />
      )}

      <StoreItemDetail item={selectedItem} onClose={() => setSelectedItem(null)} />
      <CartDrawer />
    </StoreShell>
  )
}

export function VaclyStoreView() {
  return (
    <StoreCompanyProvider>
      <StoreCartProvider>
        <VaclyStoreInner />
      </StoreCartProvider>
    </StoreCompanyProvider>
  )
}
