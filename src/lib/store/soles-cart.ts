import {
  SOLES_PACK_AMOUNTS,
  SOLES_PACK_ITEMS,
  SOLES_PRICE_BY_AMOUNT,
  type StoreItem,
} from '@/lib/store/store-catalog'

interface SolesCartLine {
  item: StoreItem
  quantity: number
}

export function solesAmountFromPackId(id: string): number {
  const amount = Number(id.replace('soles-', ''))
  return (SOLES_PACK_AMOUNTS as readonly number[]).includes(amount) ? amount : 0
}

const SOLES_ITEM_BY_AMOUNT = new Map(
  SOLES_PACK_ITEMS.map((item) => [solesAmountFromPackId(item.id), item] as const),
)

export function isSolesPackItem(item: StoreItem): boolean {
  return item.priceUnit === 'once' && solesAmountFromPackId(item.id) > 0
}

export function solesInPackLine(item: StoreItem, quantity: number): number {
  return solesAmountFromPackId(item.id) * Math.max(1, quantity)
}

export function totalSolesInLines(
  lines: Array<{ item: StoreItem; quantity: number }>,
): number {
  return lines.reduce(
    (sum, line) => sum + (isSolesPackItem(line.item) ? solesInPackLine(line.item, line.quantity) : 0),
    0,
  )
}

export function formatSolesCount(amount: number): string {
  return `${amount.toLocaleString('es-ES')} Soles`
}

/**
 * Dado un carrito con líneas de Soles, devuelve la combinación de packs de menor
 * coste que abone al menos los Soles acumulados (p. ej. 6×5 → 1×50).
 */
export function optimizeSolesPackQuantities(
  quantities: Partial<Record<(typeof SOLES_PACK_AMOUNTS)[number], number>>,
): Map<(typeof SOLES_PACK_AMOUNTS)[number], number> {
  const targetSoles = SOLES_PACK_AMOUNTS.reduce(
    (sum, amount) => sum + amount * (quantities[amount] ?? 0),
    0,
  )

  const result = new Map<(typeof SOLES_PACK_AMOUNTS)[number], number>()
  if (targetSoles === 0) return result

  const maxTier = SOLES_PACK_AMOUNTS[SOLES_PACK_AMOUNTS.length - 1]
  const limit = targetSoles + maxTier

  const dp = new Float64Array(limit + 1).fill(Number.POSITIVE_INFINITY)
  const choice = new Int32Array(limit + 1).fill(-1)
  dp[0] = 0

  for (let soles = 0; soles <= limit; soles++) {
    if (!Number.isFinite(dp[soles])) continue
    for (const amount of SOLES_PACK_AMOUNTS) {
      const next = soles + amount
      if (next > limit) continue
      const cost = dp[soles] + SOLES_PRICE_BY_AMOUNT[amount]
      if (cost < dp[next]) {
        dp[next] = cost
        choice[next] = amount
      }
    }
  }

  let bestSoles = targetSoles
  let bestCost = dp[targetSoles]
  for (let soles = targetSoles + 1; soles <= limit; soles++) {
    if (dp[soles] < bestCost) {
      bestCost = dp[soles]
      bestSoles = soles
    }
  }

  let soles = bestSoles
  while (soles > 0 && choice[soles] !== -1) {
    const amount = choice[soles] as (typeof SOLES_PACK_AMOUNTS)[number]
    result.set(amount, (result.get(amount) ?? 0) + 1)
    soles -= amount
  }

  return result
}

/** Reemplaza las líneas de Soles del carrito por la combinación optimizada. */
export function optimizeSolesCartLines<T extends SolesCartLine>(lines: T[]): T[] {
  const solesLines = lines.filter((l) => isSolesPackItem(l.item))
  if (solesLines.length === 0) return lines

  const quantities: Partial<Record<(typeof SOLES_PACK_AMOUNTS)[number], number>> = {}
  for (const line of solesLines) {
    const amount = solesAmountFromPackId(line.item.id) as (typeof SOLES_PACK_AMOUNTS)[number]
    quantities[amount] = (quantities[amount] ?? 0) + line.quantity
  }

  const optimized = optimizeSolesPackQuantities(quantities)
  const otherLines = lines.filter((l) => !isSolesPackItem(l.item))

  const optimizedLines: T[] = []
  for (const amount of SOLES_PACK_AMOUNTS) {
    const quantity = optimized.get(amount) ?? 0
    if (quantity <= 0) continue
    const item = SOLES_ITEM_BY_AMOUNT.get(amount)
    if (!item) continue
    optimizedLines.push({ item, quantity })
  }

  return [...otherLines, ...optimizedLines]
}
