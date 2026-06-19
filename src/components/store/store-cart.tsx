'use client'

import { useState } from 'react'
import {
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { StoreItem } from '@/lib/store/store-catalog'
import { lineAmount, useStoreCart } from '@/components/store/store-cart-context'
import { useStoreCompany } from '@/components/store/store-company-context'

const STORE_CHECKOUT_MESSAGE = 'vacly-store-checkout'
const STORE_ADDONS_MESSAGE = 'vacly-store-addons'
const STORE_SOLES_MESSAGE = 'vacly-store-soles'

/** Extrae la cantidad de Soles de un item del catálogo (id `soles-<amount>`). */
const SOLES_PACK_VALUES = [5, 50, 500, 1000, 5000]
function solesAmountFromItem(item: StoreItem): number {
  const fromId = Number(item.id.replace('soles-', ''))
  return SOLES_PACK_VALUES.includes(fromId) ? fromId : 0
}

function formatEuro(amount: number): string {
  return amount.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Botón "Mi Carrito" arriba a la derecha. */
export function CartButton({ className }: { className?: string }) {
  const { count, toggle, totals } = useStoreCart()
  const recurring = totals.monthly + totals.once

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm transition-all hover:border-[#1B2A41]/25 hover:shadow-md active:scale-[0.98]',
        className,
      )}
      aria-label="Abrir Mi Carrito"
    >
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#1B2A41] text-white">
        <ShoppingCartIcon className="h-5 w-5" strokeWidth={1.9} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#C6A664] px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {count}
          </span>
        )}
      </span>
      <span className="hidden flex-col items-start leading-tight sm:flex">
        <span className="text-[13px] font-semibold text-[#1B2A41]">Mi Carrito</span>
        <span className="text-[11px] text-slate-500">
          {count === 0 ? 'Vacío' : formatEuro(recurring)}
        </span>
      </span>
    </button>
  )
}

function CartLineRow({ item, quantity }: { item: StoreItem; quantity: number }) {
  const { seats } = useStoreCompany()
  const { remove, setQuantity } = useStoreCart()
  const amount = lineAmount(item, quantity, seats)
  const isOnce = item.priceUnit === 'once'
  const isPerSeat = item.priceUnit === 'per_seat_month'
  const isIncluded = item.priceUnit === 'included'

  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-3.5 last:border-b-0">
      <span
        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: item.iconBg }}
      >
        <span className="text-[13px] font-bold">{item.title.charAt(0)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#1B2A41]">{item.title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {isIncluded
            ? 'Incluido'
            : isPerSeat
              ? `${formatEuro(item.priceAmount ?? 0)} × ${seats} empl./mes`
              : isOnce
                ? `${formatEuro(item.priceAmount ?? 0)} · pago único`
                : `${formatEuro(item.priceAmount ?? 0)} /mes`}
        </p>
        {isOnce && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setQuantity(item.id, quantity - 1)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Reducir cantidad"
            >
              <MinusIcon className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.5rem] text-center text-xs font-semibold text-[#1B2A41]">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(item.id, quantity + 1)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Aumentar cantidad"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm font-bold text-[#1B2A41]">{formatEuro(amount)}</span>
        <button
          type="button"
          onClick={() => remove(item.id)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          aria-label={`Quitar ${item.title}`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Panel lateral del carrito. */
export function CartDrawer() {
  const { lines, isOpen, close, totals, count, clear } = useStoreCart()
  const { companyId, seats, hasActiveSubscription } = useStoreCompany()
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const billableModules = lines.filter(
    (l) => l.item.entitlement?.type === 'module' && l.item.priceUnit !== 'included',
  )
  const addonLines = lines.filter(
    (l) =>
      l.item.entitlement?.type === 'agent' || l.item.entitlement?.type === 'integration',
  )
  const solesLines = lines.filter((l) => l.item.priceUnit === 'once')
  const includedOnly = lines.filter((l) => l.item.priceUnit === 'included')

  const postToParent = (type: string, payload: unknown): boolean => {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({ type, payload }, '*')
      return true
    }
    return false
  }

  const handleCheckout = () => {
    if (billableModules.length === 0) {
      setMessage('Añade un módulo para tramitar la suscripción.')
      return
    }
    const moduleKeys = Array.from(
      new Set(billableModules.map((l) => l.item.entitlement!.key)),
    )
    const payload = { companyId, seats, periodicity: 'monthly' as const, modules: moduleKeys }
    setSubmitting(true)
    setMessage(null)
    try {
      if (postToParent(STORE_CHECKOUT_MESSAGE, payload)) {
        setMessage('Procesando el pago en una nueva pantalla...')
      } else {
        setMessage('Abre el Store desde Vacly para completar el pago con Stripe.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddonsCheckout = () => {
    if (addonLines.length === 0) return
    if (!hasActiveSubscription) {
      setMessage('Necesitas una suscripción activa (un módulo) para activar agentes o integraciones.')
      return
    }
    const addons = addonLines.map((l) => ({
      type: l.item.entitlement!.type as 'agent' | 'integration',
      key: l.item.entitlement!.key,
      title: l.item.title,
      priceEur: l.item.priceAmount ?? 0,
    }))
    setSubmitting(true)
    setMessage(null)
    try {
      if (postToParent(STORE_ADDONS_MESSAGE, { companyId, addons })) {
        setMessage('Activando agentes e integraciones en tu suscripción...')
      } else {
        setMessage('Abre el Store desde Vacly para activar agentes e integraciones.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSolesCheckout = () => {
    if (solesLines.length === 0) return
    const packs = solesLines
      .map((l) => ({ amount: solesAmountFromItem(l.item), quantity: l.quantity }))
      .filter((p) => p.amount > 0)
    if (packs.length === 0) return
    setSubmitting(true)
    setMessage(null)
    try {
      if (postToParent(STORE_SOLES_MESSAGE, { companyId, packs })) {
        setMessage('Procesando la compra de Soles en una nueva pantalla...')
      } else {
        setMessage('Abre el Store desde Vacly para comprar Soles con Stripe.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[60] bg-[#1B2A41]/30 backdrop-blur-[2px] transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={close}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-[61] flex w-full max-w-[26rem] flex-col bg-white shadow-[0_0_60px_rgba(27,42,65,0.25)] transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Mi Carrito"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#1B2A41] text-white">
              <ShoppingCartIcon className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <div>
              <p className="text-base font-bold text-[#1B2A41]">Mi Carrito</p>
              <p className="text-[11px] text-slate-500">{count} elemento{count === 1 ? '' : 's'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-[#1B2A41]"
            aria-label="Cerrar carrito"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center">
              <ShoppingCartIcon className="h-12 w-12 text-slate-300" strokeWidth={1.25} />
              <p className="mt-4 text-sm font-semibold text-[#1B2A41]">Tu carrito está vacío</p>
              <p className="mt-1 max-w-[16rem] text-xs text-slate-500">
                Añade módulos, agentes o integraciones para verlos aquí.
              </p>
            </div>
          ) : (
            <div className="py-1">
              {billableModules.length > 0 && (
                <section className="pt-2">
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Suscripción mensual
                  </h3>
                  {billableModules.map((l) => (
                    <CartLineRow key={l.item.id} item={l.item} quantity={l.quantity} />
                  ))}
                </section>
              )}
              {addonLines.length > 0 && (
                <section className="pt-4">
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Agentes e integraciones (/mes)
                  </h3>
                  {addonLines.map((l) => (
                    <CartLineRow key={l.item.id} item={l.item} quantity={l.quantity} />
                  ))}
                  {!hasActiveSubscription && (
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-600">
                      Requieren una suscripción activa: contrata primero un módulo.
                    </p>
                  )}
                </section>
              )}
              {solesLines.length > 0 && (
                <section className="pt-4">
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Paquetes de Soles (pago único)
                  </h3>
                  {solesLines.map((l) => (
                    <CartLineRow key={l.item.id} item={l.item} quantity={l.quantity} />
                  ))}
                </section>
              )}
              {includedOnly.length > 0 && (
                <section className="pt-4">
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Incluido en tu plan
                  </h3>
                  {includedOnly.map((l) => (
                    <CartLineRow key={l.item.id} item={l.item} quantity={l.quantity} />
                  ))}
                </section>
              )}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <footer className="border-t border-slate-200 px-5 py-4">
            <div className="space-y-1.5">
              {totals.monthly > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Suscripción mensual</span>
                  <span className="font-bold text-[#1B2A41]">{formatEuro(totals.monthly)}/mes</span>
                </div>
              )}
              {totals.once > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Pago único (Soles)</span>
                  <span className="font-bold text-[#1B2A41]">{formatEuro(totals.once)}</span>
                </div>
              )}
            </div>

            {message && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                {message}
              </p>
            )}

            <div className="mt-3 space-y-2">
              {billableModules.length > 0 && (
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={submitting}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B2A41] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#152036] active:scale-[0.99]',
                    submitting && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {submitting ? 'Procesando...' : 'Tramitar suscripción de módulos'}
                </button>
              )}
              {addonLines.length > 0 && (
                <button
                  type="button"
                  onClick={handleAddonsCheckout}
                  disabled={submitting || !hasActiveSubscription}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C6A664] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#b3934f] active:scale-[0.99]',
                    (submitting || !hasActiveSubscription) && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {submitting ? 'Procesando...' : 'Activar agentes e integraciones'}
                </button>
              )}
              {solesLines.length > 0 && (
                <button
                  type="button"
                  onClick={handleSolesCheckout}
                  disabled={submitting}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#1B2A41]/15 bg-white px-4 py-3 text-sm font-semibold text-[#1B2A41] transition-all hover:bg-slate-50 active:scale-[0.99]',
                    submitting && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {submitting ? 'Procesando...' : `Comprar Soles (${formatEuro(totals.once)})`}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={clear}
              className="mt-2 inline-flex w-full items-center justify-center text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              Vaciar carrito
            </button>
          </footer>
        )}
      </aside>
    </>
  )
}
