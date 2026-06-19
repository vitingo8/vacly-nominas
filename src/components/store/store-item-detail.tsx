'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CheckIcon,
  ShoppingCartIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { StoreDetailFeature, StoreIncludesSection, StoreItem } from '@/lib/store/store-catalog'
import { StoreItemIcon } from '@/components/store/store-item-icon'
import {
  ItemBadge,
  ItemVisual,
  StorePrice,
} from '@/components/store/vacly-store-shared'
import { getDetailLogoCandidates } from '@/lib/store/store-detail-logos'
import { useStoreCart } from '@/components/store/store-cart-context'
import { useStoreCompany } from '@/components/store/store-company-context'

function normalizeDetailFeature(entry: string | StoreDetailFeature): StoreDetailFeature {
  return typeof entry === 'string' ? { label: entry } : entry
}

function DetailLogo({
  item,
  label,
  imageUrl,
  size = 'sm',
}: {
  item: StoreItem
  label: string
  imageUrl?: string
  size?: 'sm' | 'md'
}) {
  const candidates = useMemo(() => {
    const resolved = getDetailLogoCandidates(item, label)
    if (imageUrl) return [imageUrl, ...resolved.filter((url) => url !== imageUrl)]
    return resolved
  }, [item, label, imageUrl])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const src = candidates[candidateIndex]
  const box = size === 'md' ? 'h-10 w-10' : 'h-9 w-9'
  const img = size === 'md' ? 40 : 36

  useEffect(() => {
    setCandidateIndex(0)
  }, [candidates])

  if (!src || candidateIndex >= candidates.length) {
    return (
      <div className={cn('flex shrink-0 items-center justify-center', box)}>
        <span style={{ color: item.iconBg }}>
          <StoreItemIcon name={item.icon} className={size === 'md' ? 'h-7 w-7' : 'h-6 w-6'} />
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex shrink-0 items-center justify-center', box)}>
      <Image
        key={src}
        src={src}
        alt=""
        width={img}
        height={img}
        unoptimized
        className="h-full w-full object-contain"
        onError={() => setCandidateIndex((i) => i + 1)}
      />
    </div>
  )
}

function DetailMiniCard({
  item,
  label,
  imageUrl,
}: {
  item: StoreItem
  label: string
  imageUrl?: string
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[1.25rem] border border-slate-200/75 bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3B9EDE]/30 hover:shadow-[0_14px_30px_rgba(27,42,65,0.07)]">
      <div className="flex items-center gap-2.5">
        <DetailLogo item={item} label={label} imageUrl={imageUrl} />
        <h3 className="min-w-0 text-[14px] font-bold leading-tight tracking-tight text-[#1B2A41]">
          {label}
        </h3>
      </div>
    </article>
  )
}

function DetailSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-[1.25rem] border border-slate-200/60 bg-[#FAFAFB] p-4 sm:p-5',
        className,
      )}
    >
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function DetailIncludesSection({
  section,
}: {
  section: StoreIncludesSection
}) {
  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-slate-200/75 bg-white p-3.5 shadow-[0_10px_24px_rgba(27,42,65,0.06)] sm:p-4">
      <div className="flex items-start gap-3">
        {section.imageUrl && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Image
              src={section.imageUrl}
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-full w-full object-contain"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-tight tracking-tight text-[#1B2A41]">
            {section.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-snug text-slate-600">{section.description}</p>
        </div>
      </div>
    </section>
  )
}

function DetailHeroCard({
  item,
  installed,
  longDescription,
  onClose,
}: {
  item: StoreItem
  installed: boolean
  longDescription?: string
  onClose: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.25rem] border border-slate-200/75 bg-white p-3.5 shadow-[0_10px_24px_rgba(27,42,65,0.06)] sm:p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1B2A41]"
        aria-label="Cerrar detalle"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-7">
        <div className="flex shrink-0 items-center justify-center">
          {item.imageUrl ? (
            <Image
              key={item.imageUrl}
              src={item.imageUrl}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="h-14 w-14 object-contain drop-shadow-[0_4px_12px_rgba(27,42,65,0.1)]"
            />
          ) : (
            <ItemVisual item={item} size="md" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold leading-tight tracking-tight text-[#1B2A41]">
              {item.title}
            </h2>
            {installed ? (
              <ItemBadge badge="instalado" />
            ) : (
              item.badge && <ItemBadge badge={item.badge} />
            )}
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-slate-500">{item.description}</p>
          {longDescription && (
            <p className="mt-1.5 text-[13px] leading-snug text-slate-600">{longDescription}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Panel inferior con toda la información del item seleccionado. */
export function StoreItemDetail({
  item,
  onClose,
}: {
  item: StoreItem | null
  onClose: () => void
}) {
  const { add, has } = useStoreCart()
  const { isInstalled, resolveItemPricing } = useStoreCompany()

  const open = !!item
  const installed = item ? isInstalled(item) : false
  const inCart = item ? has(item.id) : false
  const details = item?.details
  const pricingModel = useMemo(() => {
    if (!item) return undefined
    return resolveItemPricing(item).pricingModel ?? details?.pricingModel
  }, [item, details?.pricingModel, resolveItemPricing])

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[55] bg-[#1B2A41]/30 backdrop-blur-[2px] transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />
      <section
        className={cn(
          'fixed inset-x-0 bottom-0 z-[56] mx-auto flex max-h-[80vh] w-full max-w-5xl flex-col rounded-t-[1.75rem] border border-slate-200/80 bg-[#F5F5F7] shadow-[0_-20px_60px_rgba(27,42,65,0.28)] transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={item ? `Detalle de ${item.title}` : 'Detalle'}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-slate-300/80" aria-hidden />

        {item && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-7">
              <DetailHeroCard
                item={item}
                installed={installed}
                longDescription={details?.longDescription}
                onClose={onClose}
              />

              {details?.features && details.features.length > 0 && (
                <DetailSection title="Qué incluye">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {details.features.map((feature) => {
                      const { label, imageUrl } = normalizeDetailFeature(feature)
                      return (
                        <DetailMiniCard
                          key={label}
                          item={item}
                          label={label}
                          imageUrl={imageUrl}
                        />
                      )
                    })}
                  </div>
                </DetailSection>
              )}

              {details?.includesSection ? (
                <DetailIncludesSection section={details.includesSection} />
              ) : (
                details?.includes &&
                details.includes.length > 0 && (
                  <DetailSection title="Informes y extras">
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                      {details.includes.map((include) => {
                        const { label, imageUrl } = normalizeDetailFeature(include)
                        return (
                          <DetailMiniCard
                            key={label}
                            item={item}
                            label={label}
                            imageUrl={imageUrl}
                          />
                        )
                      })}
                    </div>
                  </DetailSection>
                )
              )}

              {details?.requires && details.requires.length > 0 && (
                <DetailSection title="Requisitos">
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {details.requires.map((requirement) => (
                      <li
                        key={requirement}
                        className="flex items-start gap-2.5 rounded-[1rem] border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 text-xs leading-snug text-amber-900/90"
                      >
                        <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <span>{requirement}</span>
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              )}

              {pricingModel && (
                <div className="rounded-[1.25rem] border border-[#1B2A41]/10 bg-[#1B2A41] px-4 py-3.5 text-xs leading-relaxed text-slate-200">
                  {pricingModel}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-4 border-t border-slate-200/80 bg-white px-5 py-4 sm:px-7">
              <StorePrice item={item} className="[&_p:first-child]:text-lg" />
              {installed ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-500/15">
                  <CheckIcon className="h-4 w-4" /> Ya contratado
                </span>
              ) : inCart ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-[#1B2A41]">
                  <CheckIcon className="h-4 w-4" /> En el carrito
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => add(item)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1B2A41] px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-[#152036] active:scale-[0.99]"
                >
                  <ShoppingCartIcon className="h-4 w-4" /> Añadir al carrito
                </button>
              )}
            </footer>
          </>
        )}
      </section>
    </>
  )
}
