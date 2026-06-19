'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSearchParam } from '@/lib/embedded-mode'
import type { StoreItem } from '@/lib/store/store-catalog'

export interface StoreCompanyState {
  companyId: string
  hasActiveSubscription: boolean
  planType: string | null
  seats: number
  seatsAnnual: number
  employeeCount: number
  modules: { tiempo: boolean; proyectos: boolean; finanzas: boolean; laboral: boolean }
  permissions: { inbox: boolean; via_chat: boolean; memory: boolean; soporte_remoto: boolean }
}

interface StoreCompanyContextValue {
  companyId: string | null
  state: StoreCompanyState | null
  loading: boolean
  /** Nº de licencias contratadas (o nº de empleados como mejor estimación). */
  seats: number
  /** true si la empresa ya tiene contratado / instalado el item. */
  isInstalled: (item: StoreItem) => boolean
}

const StoreCompanyContext = createContext<StoreCompanyContextValue>({
  companyId: null,
  state: null,
  loading: false,
  seats: 1,
  isInstalled: () => false,
})

export function StoreCompanyProvider({ children }: { children: React.ReactNode }) {
  const companyId = useSearchParam('company_id')
  const [state, setState] = useState<StoreCompanyState | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) {
      setState(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/store/company-state?company_id=${encodeURIComponent(companyId)}`)
      const data = res.ok ? await res.json() : null
      setState(data?.success && data.state ? (data.state as StoreCompanyState) : null)
    } catch {
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  // Refresca el estado tras una compra confirmada en vacly-app.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'vacly-store-refresh') void load()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load])

  const value = useMemo<StoreCompanyContextValue>(() => {
    const seats = Math.max(1, state?.seats || state?.employeeCount || 1)

    const isInstalled = (item: StoreItem): boolean => {
      const ent = item.entitlement
      if (!state || !ent) {
        // Sin datos reales: respetar el badge estático del catálogo.
        return item.badge === 'instalado'
      }
      if (ent.type === 'module') {
        const key = ent.key as keyof StoreCompanyState['modules']
        return !!state.modules[key]
      }
      if (ent.type === 'permission') {
        const key = ent.key as keyof StoreCompanyState['permissions']
        return !!state.permissions[key]
      }
      // Agentes / integraciones aún sin backend de instalación: badge estático.
      return item.badge === 'instalado'
    }

    return { companyId, state, loading, seats, isInstalled }
  }, [companyId, state, loading])

  return <StoreCompanyContext.Provider value={value}>{children}</StoreCompanyContext.Provider>
}

export function useStoreCompany() {
  return useContext(StoreCompanyContext)
}
