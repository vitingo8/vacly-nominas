'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { StoreItem } from '@/lib/store/store-catalog'
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
export function lineAmount(item: StoreItem, quantity: number, seats: number): number {
  const price = item.priceAmount ?? 0
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
  const { seats } = useStoreCompany()
  const [lines, setLines] = useState<CartLine[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const has = useCallback((id: string) => lines.some((l) => l.item.id === id), [lines])

  const add = useCallback((item: StoreItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      if (existing) {
        // Solo los packs de Soles (pago único) acumulan cantidad.
        if (item.priceUnit === 'once') {
          return prev.map((l) =>
            l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        }
        return prev
      }
      return [...prev, { item, quantity: 1 }]
    })
    setIsOpen(true)
  }, [])

  const remove = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.item.id !== id))
  }, [])

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.item.id === id ? { ...l, quantity: Math.max(0, quantity) } : l))
        .filter((l) => l.quantity > 0),
    )
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
        const amount = lineAmount(l.item, l.quantity, seats)
        if (l.item.priceUnit === 'once') acc.once += amount
        else acc.monthly += amount
        return acc
      },
      { monthly: 0, once: 0 },
    )
  }, [lines, seats])

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
