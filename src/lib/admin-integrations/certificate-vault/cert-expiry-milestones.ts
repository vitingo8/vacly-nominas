/** Hitos por defecto: 2 meses y 1 mes antes de la caducidad. */
export const DEFAULT_CERT_EXPIRY_MILESTONES = [60, 30] as const

export const CERT_EXPIRY_MILESTONE_OPTIONS = [
  { days: 90, label: '3 meses antes' },
  { days: 60, label: '2 meses antes' },
  { days: 30, label: '1 mes antes' },
  { days: 14, label: '2 semanas antes' },
  { days: 7, label: '1 semana antes' },
  { days: 1, label: '1 día antes' },
] as const

const ALLOWED_DAYS = new Set<number>(CERT_EXPIRY_MILESTONE_OPTIONS.map((o) => o.days))

export const MAX_CERT_EXPIRY_MILESTONE_DAYS = Math.max(...CERT_EXPIRY_MILESTONE_OPTIONS.map((o) => o.days))

/** Normaliza y valida hitos guardados en BD (descendente: 90, 60, 30…). */
export function normalizeExpiryMilestones(input: number[] | null | undefined): number[] {
  const source = input?.length ? input : [...DEFAULT_CERT_EXPIRY_MILESTONES]
  const unique = [...new Set(source.filter((d) => ALLOWED_DAYS.has(d)))]
  unique.sort((a, b) => b - a)
  return unique.length ? unique : [...DEFAULT_CERT_EXPIRY_MILESTONES]
}

/** Hito alcanzado según días restantes y la configuración del certificado. */
export function milestoneForDays(daysToExpiry: number | null, milestones: number[]): number | null {
  if (daysToExpiry == null || daysToExpiry < 0) return null
  const sorted = [...milestones].sort((a, b) => a - b)
  for (const m of sorted) {
    if (daysToExpiry <= m) return m
  }
  return null
}

export function milestoneLabel(days: number): string {
  const opt = CERT_EXPIRY_MILESTONE_OPTIONS.find((o) => o.days === days)
  if (opt) return opt.label
  if (days === 1) return '1 día antes'
  return `${days} días antes`
}

export function formatMilestonesSummary(milestones: number[]): string {
  const normalized = normalizeExpiryMilestones(milestones)
  return normalized.map((d) => milestoneLabel(d)).join(', ')
}
