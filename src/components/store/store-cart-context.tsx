'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { StoreItem } from '@/lib/store/store-catalog'
import { isSolesPackItem, optimizeSolesCartLines } from '@/lib/store/soles-cart'
import { useStoreCompany } from '@/components/store/store-company-context'

export interface CartLine {
  item: StoreItem
  quantity: number
}

export interface CartTotals {
  /** Importe recurrente mensual (módulos, agentes, integraciones) */
  monthly: number
  /** Importe de pago único (paquetes de Soles) */
  once: number
}

interface CartContextValue {
  lines: CartLine[]
  isOpen: boolean
  count: number
  totals: CartTotals
  open: () => void
  close: () => void
  toggle: () => void
  has: (id: string) => boolean
  add: (item: StoreItem) => void
  remove: (id: string) => void
  setQuantity: (id: string, quantity: number) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

/** Importe de una línea según su unidad de precio y el nº de licencias. */
export function lineAmount(
  item: StoreItem,
  quantity: number,
  seats: number,
  unitPrice = item.priceAmount ?? 0,
): number {
  const price = unitPrice
  switch (item.priceUnit) {
    case 'per_seat_month':
      return price * Math.max(1, seats)
    case 'month':
      return price
    case 'once':
      return price * Math.max(1, quantity)
    case 'included':
    default:
      return 0
  }
}

export function StoreCartProvider({ children }: { children: React.ReactNode }) {
  const { seats, resolveItemPricing } = useStoreCompany()
  const [lines, setLines] = useState<CartLine[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const has = useCallback((id: string) => lines.some((l) => l.item.id === id), [lines])

  const add = useCallback((item: StoreItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      let next: CartLine[]
      if (existing) {
        // Solo los packs de Soles (pago único) acumulan cantidad.
        if (item.priceUnit === 'once') {
          next = prev.map((l) =>
            l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        } else {
          return prev
        }
      } else {
        next = [...prev, { item, quantity: 1 }]
      }
      return isSolesPackItem(item) ? optimizeSolesCartLines(next) : next
    })
    setIsOpen(true)
  }, [])

  const remove = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.item.id !== id))
  }, [])

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((prev) => {
      const line = prev.find((l) => l.item.id === id)
      const next = prev
        .map((l) => (l.item.id === id ? { ...l, quantity: Math.max(0, quantity) } : l))
        .filter((l) => l.quantity > 0)
      return line && isSolesPackItem(line.item) ? optimizeSolesCartLines(next) : next
    })
  }, [])

  const clear = useCallback(() => setLines([]), [])

  // Tras una compra confirmada en vacly-app, vacía y cierra el carrito.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'vacly-store-refresh') {
        setLines([])
        setIsOpen(false)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const totals = useMemo<CartTotals>(() => {
    return lines.reduce<CartTotals>(
      (acc, l) => {
        const unitPrice = resolveItemPricing(l.item).priceAmount
        const amount = lineAmount(l.item, l.quantity, seats, unitPrice)
        if (l.item.priceUnit === 'once') acc.once += amount
        else acc.monthly += amount
        return acc
      },
      { monthly: 0, once: 0 },
    )
  }, [lines, seats, resolveItemPricing])

  const count = useMemo(
    () => lines.reduce((acc, l) => acc + (l.item.priceUnit === 'once' ? l.quantity : 1), 0),
    [lines],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      isOpen,
      count,
      totals,
      open,
      close,
      toggle,
      has,
      add,
      remove,
      setQuantity,
      clear,
    }),
    [lines, isOpen, count, totals, open, close, toggle, has, add, remove, setQuantity, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useStoreCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useStoreCart debe usarse dentro de StoreCartProvider')
  return ctx
}
