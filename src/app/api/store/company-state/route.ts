/**
 * Estado de la empresa para personalizar el Vacly Store.
 *
 * Devuelve qué módulos y permisos tiene contratados la empresa (tabla `billing`),
 * el número de licencias (`seats`) y si existe una suscripción activa en Stripe.
 * Se usa para marcar los items del Store como instalados / ya contratados.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

const ACTIVE_SUBSCRIPTION_STATES = ['active', 'trialing', 'past_due']

interface BillingRow {
  plan_type: string | null
  seats: number | null
  seats_annual: number | null
  stripe_subscription_id: string | null
  stripe_subscription_status: string | null
  module_tiempo: boolean | null
  module_proyectos: boolean | null
  module_finanzas: boolean | null
  module_laboral: boolean | null
  permission_inbox: boolean | null
  permission_via_chat: boolean | null
  permission_memory: boolean | null
  permission_soporte_remoto: boolean | null
}

export interface StoreCompanyState {
  companyId: string
  hasActiveSubscription: boolean
  planType: string | null
  seats: number
  seatsAnnual: number
  employeeCount: number
  modules: {
    tiempo: boolean
    proyectos: boolean
    finanzas: boolean
    laboral: boolean
  }
  permissions: {
    inbox: boolean
    via_chat: boolean
    memory: boolean
    soporte_remoto: boolean
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ success: false, error: 'company_id es requerido' }, { status: 400 })
  }

  try {
    const supabase = getSupabaseClient()

    const { data, error } = await supabase
      .from('billing')
      .select(
        'plan_type, seats, seats_annual, stripe_subscription_id, stripe_subscription_status, ' +
          'module_tiempo, module_proyectos, module_finanzas, module_laboral, ' +
          'permission_inbox, permission_via_chat, permission_memory, permission_soporte_remoto',
      )
      .eq('company_id', companyId)
      .maybeSingle()

    const billing = data as BillingRow | null

    if (error) {
      console.error('[store/company-state] Error leyendo billing:', error.message)
      return NextResponse.json(
        { success: false, error: 'No se pudo leer el estado de facturación' },
        { status: 500 },
      )
    }

    const { count: employeeCount } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)

    const isPremium = billing?.plan_type === 'premium'
    const subStatus = (billing?.stripe_subscription_status as string | null) ?? null
    const hasActiveSubscription =
      !!billing?.stripe_subscription_id &&
      !!subStatus &&
      ACTIVE_SUBSCRIPTION_STATES.includes(subStatus)

    const state: StoreCompanyState = {
      companyId,
      hasActiveSubscription,
      planType: billing?.plan_type ?? null,
      seats: Number(billing?.seats ?? 0) || 0,
      seatsAnnual: Number(billing?.seats_annual ?? 0) || 0,
      employeeCount: employeeCount ?? 0,
      modules: {
        tiempo: isPremium && !!billing?.module_tiempo,
        proyectos: isPremium && !!billing?.module_proyectos,
        finanzas: isPremium && !!billing?.module_finanzas,
        laboral: isPremium && !!billing?.module_laboral,
      },
      permissions: {
        inbox: !!billing?.permission_inbox,
        via_chat: !!billing?.permission_via_chat,
        memory: !!billing?.permission_memory,
        soporte_remoto: !!billing?.permission_soporte_remoto,
      },
    }

    return NextResponse.json({ success: true, state })
  } catch (err) {
    console.error('[store/company-state] Error inesperado:', err)
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 })
  }
}
