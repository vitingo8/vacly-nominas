// ============================================================================
// payroll-irpf.ts — Resolución de prioridad IRPF (manual > AEAT > fallback)
// ============================================================================

export type IrpfRateSource =
  | 'manual'
  | 'aeat_persisted'
  | 'aeat_live'
  | 'estimated'
  | 'request_fallback'
  | 'none'

export type EmployeeIrpfSource = {
  id?: string
  compensation?: { irpfPercentage?: unknown } | null
  irpf_data?: { lastResult?: { tipoRetencion?: unknown } | null } | null
}

function toValidIrpfPercentage(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null
  return numeric
}

export type ResolvedIrpf = {
  rate: number
  source: IrpfRateSource
  manualRate: number | null
  aeatRate: number | null
  differs: boolean
}

/**
 * Prioridad: % manual en compensation (>0) → AEAT persistido → fallback de petición → 0.
 */
export function resolveEmployeeIrpf(
  persisted: EmployeeIrpfSource | null | undefined,
  fallback: unknown,
): ResolvedIrpf {
  const manualRate = toValidIrpfPercentage(persisted?.compensation?.irpfPercentage)
  const aeatRate = toValidIrpfPercentage(persisted?.irpf_data?.lastResult?.tipoRetencion)
  const requestRate = toValidIrpfPercentage(fallback)

  if (manualRate != null && manualRate > 0) {
    return {
      rate: manualRate,
      source: 'manual',
      manualRate,
      aeatRate,
      differs: aeatRate != null && Math.abs(manualRate - aeatRate) > 0.01,
    }
  }
  if (aeatRate != null && aeatRate > 0) {
    return {
      rate: aeatRate,
      source: 'aeat_persisted',
      manualRate,
      aeatRate,
      differs: false,
    }
  }
  if (requestRate != null && requestRate > 0) {
    return {
      rate: requestRate,
      source: 'request_fallback',
      manualRate,
      aeatRate,
      differs: false,
    }
  }
  return {
    rate: 0,
    source: 'none',
    manualRate,
    aeatRate,
    differs: false,
  }
}

/** Compatibilidad con código existente que espera solo el número. */
export function resolveEmployeeIrpfPercentage(
  persisted: EmployeeIrpfSource | null | undefined,
  fallback: unknown,
): number {
  return resolveEmployeeIrpf(persisted, fallback).rate
}
