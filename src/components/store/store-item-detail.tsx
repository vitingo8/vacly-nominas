'use client'

import Image from 'next/image'
import {
  CheckCircleIcon,
  CheckIcon,
  ShoppingCartIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { StoreItem } from '@/lib/store/store-catalog'
import { StoreItemIcon } from '@/components/store/store-item-icon'
import { ItemBadge } from '@/components/store/vacly-store-shared'
import { useStoreCart } from '@/components/store/store-cart-context'
import { useStoreCompany } from '@/components/store/store-company-context'

function DetailVisual({ item }: { item: StoreItem }) {
  if (item.imageUrl) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center">
        <Image
          src={item.imageUrl}
          alt=""
          width={64}
          height={64}
          unoptimized
          className="h-full w-full object-contain"
        />
      </div>
    )
  }
  return (
    <span
      className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white"
      style={{ backgroundColor: item.iconBg }}
    >
      <StoreItemIcon name={item.icon} className="h-8 w-8" />
    </span>
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
  const { isInstalled } = useStoreCompany()

  const open = !!item
  const installed = item ? isInstalled(item) : false
  const inCart = item ? has(item.id) : false
  const details = item?.details

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[55] bg-[#1B2A41]/25 backdrop-blur-[1px] transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />
      <section
        className={cn(
          'fixed inset-x-0 bottom-0 z-[56] mx-auto flex max-h-[72vh] w-full max-w-5xl flex-col rounded-t-[1.75rem] border border-slate-200/80 bg-white shadow-[0_-20px_60px_rgba(27,42,65,0.25)] transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={item ? `Detalle de ${item.title}` : 'Detalle'}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-slate-200" aria-hidden />
        {item && (
          <>
            <header className="flex items-start gap-4 px-5 pb-4 pt-4 sm:px-7">
              <DetailVisual item={item} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-[#1B2A41]">{item.title}</h2>
                  {installed ? (
                    <ItemBadge badge="instalado" />
                  ) : (
                    item.badge && <ItemBadge badge={item.badge} />
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-[#1B2A41]"
                aria-label="Cerrar detalle"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 pb-4 sm:px-7">
              {details?.longDescription && (
                <p className="text-sm leading-relaxed text-slate-600">{details.longDescription}</p>
              )}

              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                {details?.features && details.features.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Qué incluye
                    </h3>
                    <ul className="mt-2.5 space-y-1.5">
                      {details.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#3B9EDE]" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {details?.includes && details.includes.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Informes y extras
                    </h3>
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {details.includes.map((f) => (
                        <li
                          key={f}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                        >
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {details?.requires && details.requires.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Requisitos
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {details.requires.map((r) => (
                      <li key={r} className="text-sm text-slate-500">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {details?.pricingModel && (
                <p className="mt-5 rounded-xl bg-[#F5F5F7] px-4 py-3 text-xs leading-relaxed text-slate-500">
                  {details.pricingModel}
                </p>
              )}
            </div>

            <footer className="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-4 sm:px-7">
              <div>
                <p className="text-lg font-bold leading-tight text-[#1B2A41]">{item.priceLabel}</p>
                {item.priceNote && (
                  <p className="text-[11px] text-slate-400">{item.priceNote}</p>
                )}
              </div>
              {installed ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
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
