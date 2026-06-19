import type { StoreItem } from '@/lib/store/store-catalog'

export interface StorePricingRule {
  module: string
  min_employees: number
  max_employees: number | null
  monthly_price: number
  includes_vat: boolean
  type: 'employee' | 'month' | string
  active: boolean
}

export interface ResolvedStorePricing {
  priceAmount: number
  priceLabel: string
  priceNote?: string
  pricingModel?: string
}

export function formatStorePriceLabel(amount: number): string {
  return `${amount.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

function vatNote(includesVat: boolean): string {
  return includesVat ? 'IVA incl.' : '+ IVA 21%'
}

function tierRangeLabel(min: number, max: number | null): string {
  if (max === null) return `${min}+ empleados`
  if (min === 0) return `hasta ${max} empleados`
  return `${min}–${max} empleados`
}

function activeTierLabel(employees: number, rule: StorePricingRule): string {
  return tierRangeLabel(rule.min_employees, rule.max_employees)
}

export function getPriceForModule(
  module: string,
  employees: number,
  rules: StorePricingRule[],
): StorePricingRule | null {
  return (
    rules.find((rule) => {
      if (rule.module !== module || !rule.active) return false
      if (rule.type === 'month') {
        return rule.min_employees === 0 && rule.max_employees === null
      }
      const minMatch = employees >= rule.min_employees
      const maxMatch = rule.max_employees === null || employees <= rule.max_employees
      return minMatch && maxMatch
    }) ?? null
  )
}

export function buildModulePricingModel(module: string, rules: StorePricingRule[]): string | undefined {
  const moduleRules = rules
    .filter((r) => r.module === module && r.active)
    .sort((a, b) => a.min_employees - b.min_employees)

  if (moduleRules.length === 0) return undefined

  if (moduleRules[0].type === 'month') {
    const rule = moduleRules[0]
    return `Suscripción mensual de precio fijo: ${formatStorePriceLabel(rule.monthly_price)} (${vatNote(rule.includes_vat).toLowerCase()}).`
  }

  const tiers = moduleRules
    .map((rule) => `${formatStorePriceLabel(rule.monthly_price)} (${tierRangeLabel(rule.min_employees, rule.max_employees)})`)
    .join('; ')

  return `Suscripción por empleado/mes: ${tiers}.`
}

export function resolveStoreItemPricing(
  item: StoreItem,
  employees: number,
  rules: StorePricingRule[],
): ResolvedStorePricing {
  const seats = Math.max(1, employees)

  if (item.entitlement?.type === 'module' && rules.length > 0) {
    const moduleKey = item.entitlement.key
    const rule = getPriceForModule(moduleKey, seats, rules)

    if (rule) {
      const priceAmount = rule.monthly_price
      const priceLabel = formatStorePriceLabel(priceAmount)

      if (rule.type === 'month') {
        return {
          priceAmount,
          priceLabel,
          priceNote: `/mes · ${vatNote(rule.includes_vat)}`,
          pricingModel: buildModulePricingModel(moduleKey, rules),
        }
      }

      return {
        priceAmount,
        priceLabel,
        priceNote: `por empleado/mes · ${vatNote(rule.includes_vat)} · ${activeTierLabel(seats, rule)}`,
        pricingModel: buildModulePricingModel(moduleKey, rules),
      }
    }
  }

  return {
    priceAmount: item.priceAmount ?? 0,
    priceLabel: item.priceLabel,
    priceNote: item.priceNote,
    pricingModel: item.details?.pricingModel,
  }
}
