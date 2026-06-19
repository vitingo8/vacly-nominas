/**
 * Reglas de precio activas (tabla `pricing_rules`) para el Vacly Store.
 * Fuente de verdad compartida con facturación en vacly-app.
 */

import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import type { StorePricingRule } from '@/lib/store/store-pricing'

export async function GET() {
  try {
    const supabase = getSupabaseClient()

    const { data, error } = await supabase
      .from('pricing_rules')
      .select('module, min_employees, max_employees, monthly_price, includes_vat, type, active')
      .eq('active', true)
      .order('module', { ascending: true })
      .order('min_employees', { ascending: true })

    if (error) {
      console.error('[store/pricing-rules] Error:', error.message)
      return NextResponse.json(
        { success: false, error: 'No se pudieron cargar las tarifas' },
        { status: 500 },
      )
    }

    const rules: StorePricingRule[] = (data ?? []).map((row) => ({
      module: row.module as string,
      min_employees: Number(row.min_employees),
      max_employees: row.max_employees != null ? Number(row.max_employees) : null,
      monthly_price: parseFloat(String(row.monthly_price)),
      includes_vat: Boolean(row.includes_vat),
      type: row.type as string,
      active: Boolean(row.active),
    }))

    return NextResponse.json({ success: true, rules })
  } catch (err) {
    console.error('[store/pricing-rules] Error inesperado:', err)
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 })
  }
}
