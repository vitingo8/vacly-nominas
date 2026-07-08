// ============================================================================
// payroll-complements.ts — Resolución de complementos fijos del empleado
// Cruza compensation.fixedComplements (número o array) con el catálogo
// salary_concepts para separar importes cotizables / no cotizables.
// ============================================================================

export type SalaryConceptCatalogRow = {
  id: string
  code?: string | null
  name: string
  type?: 'salary' | 'non_salary' | string | null
  cotizes_ss?: boolean | null
  tributes_irpf?: boolean | null
  agreement_id?: string | null
  active?: boolean | null
}

export type EmployeeComplementLine = {
  concept: string
  amount: number
  conceptId?: string | null
  type: 'salary' | 'non_salary'
  cotizesSS: boolean
  tributesIRPF: boolean
  source: 'employee_compensation'
}

export type ResolvedEmployeeComplements = {
  cotizableAmount: number
  nonCotizableAmount: number
  lines: EmployeeComplementLine[]
  warnings: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function normalizeConceptName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function inferConceptType(concept: string): 'salary' | 'non_salary' {
  const normalized = normalizeConceptName(concept)
  const nonSalaryKeywords = [
    'dieta',
    'kilometraje',
    'km',
    'indemnizacion',
    'suplido',
    'desplazamiento',
    'locomocion',
    'transporte',
    'manutencion',
    'alojamiento',
    'mentor',
    'mentories',
  ]
  return nonSalaryKeywords.some((keyword) => normalized.includes(keyword)) ? 'non_salary' : 'salary'
}

function resolveCatalogEntry(
  catalog: SalaryConceptCatalogRow[],
  conceptId?: string | null,
  conceptName?: string | null,
): SalaryConceptCatalogRow | undefined {
  if (conceptId) {
    const byId = catalog.find((c) => c.id === conceptId && c.active !== false)
    if (byId) return byId
  }
  const normalizedName = normalizeConceptName(conceptName)
  if (!normalizedName) return undefined
  return catalog.find(
    (c) => c.active !== false && normalizeConceptName(c.name) === normalizedName,
  )
}

function flagsFromCatalog(
  catalogConcept: SalaryConceptCatalogRow | undefined,
  conceptName: string,
): { type: 'salary' | 'non_salary'; cotizesSS: boolean; tributesIRPF: boolean } {
  const type =
    catalogConcept?.type === 'salary' || catalogConcept?.type === 'non_salary'
      ? catalogConcept.type
      : inferConceptType(conceptName)
  const cotizesSS = catalogConcept?.cotizes_ss ?? type === 'salary'
  const tributesIRPF = catalogConcept?.tributes_irpf ?? type === 'salary'
  return { type, cotizesSS, tributesIRPF }
}

/**
 * Resuelve los complementos fijos del empleado cruzándolos con el catálogo.
 * Acepta un número escalar (legacy) o un array de { conceptId, conceptName, amount }.
 */
export function resolveEmployeeComplements(
  fixedComplements: unknown,
  catalog: SalaryConceptCatalogRow[],
): ResolvedEmployeeComplements {
  const warnings: string[] = []
  const lines: EmployeeComplementLine[] = []

  if (typeof fixedComplements === 'number' && Number.isFinite(fixedComplements) && fixedComplements > 0) {
    lines.push({
      concept: 'Complementos fijos',
      amount: round2(fixedComplements),
      conceptId: null,
      type: 'salary',
      cotizesSS: true,
      tributesIRPF: true,
      source: 'employee_compensation',
    })
    warnings.push(
      'Los complementos fijos vienen como importe único sin desglose; se tratan como cotizables.',
    )
  } else if (Array.isArray(fixedComplements)) {
    for (const item of fixedComplements) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const amount = Number(row.amount)
      if (!Number.isFinite(amount) || amount <= 0) continue
      const conceptName = String(row.conceptName ?? row.name ?? row.concept ?? 'Complemento')
      const conceptId = typeof row.conceptId === 'string' ? row.conceptId : null
      const catalogConcept = resolveCatalogEntry(catalog, conceptId, conceptName)
      const flags = flagsFromCatalog(catalogConcept, conceptName)
      if (!catalogConcept) {
        warnings.push(
          `Complemento "${conceptName}" no está en el catálogo; se asume cotizable.`,
        )
      }
      lines.push({
        concept: conceptName,
        amount: round2(amount),
        conceptId: catalogConcept?.id ?? conceptId,
        type: flags.type,
        cotizesSS: flags.cotizesSS,
        tributesIRPF: flags.tributesIRPF,
        source: 'employee_compensation',
      })
    }
  }

  let cotizableAmount = 0
  let nonCotizableAmount = 0
  for (const line of lines) {
    if (line.cotizesSS) cotizableAmount += line.amount
    else nonCotizableAmount += line.amount
  }

  return {
    cotizableAmount: round2(cotizableAmount),
    nonCotizableAmount: round2(nonCotizableAmount),
    lines,
    warnings,
  }
}

/** Suma importes de conceptos de convenio según flag cotizesSS (no solo type). */
export function sumAgreementConceptAmounts(
  concepts: Array<{ amount: number; cotizesSS: boolean; type: 'salary' | 'non_salary' }>,
): { cotizable: number; nonCotizable: number } {
  let cotizable = 0
  let nonCotizable = 0
  for (const c of concepts) {
    if (c.cotizesSS) cotizable += c.amount
    else nonCotizable += c.amount
  }
  return { cotizable: round2(cotizable), nonCotizable: round2(nonCotizable) }
}
