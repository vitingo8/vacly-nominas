// ============================================================================
// irpf.ts — Cálculo de la retención del IRPF (Impuesto sobre la Renta)
// Legislación española 2025
// ============================================================================
//
// El IRPF se calcula aplicando el porcentaje de retención comunicado por la
// empresa al trabajador sobre la base sujeta a IRPF.
//
// El porcentaje lo determina la empresa según las tablas de Hacienda,
// teniendo en cuenta:
//   - Retribución anual bruta estimada
//   - Situación familiar (estado civil, hijos, ascendientes...)
//   - Tipo de contrato
//   - Discapacidad
//   - Movilidad geográfica
//   - Comunidad autónoma
//
// En este módulo NO calculamos el porcentaje (eso lo hace el módulo de
// estimación de IRPF o viene como input del usuario). Solo aplicamos
// la retención sobre la base correspondiente.
//
// Base IRPF = Total devengos salariales (incluye horas extras,
//             pagas extras pagadas, prestación IT empresa)
//           - Cotizaciones SS del trabajador (opcional según método)
//
// NOTA: La práctica más común es aplicar el % sobre el bruto total
// (devengos salariales - cotizaciones SS = base fiscal), pero el tipo
// ya tiene esto en cuenta internamente. En la nómina se aplica:
//
//   Retención IRPF = Base IRPF × (porcentaje / 100)
//
// ============================================================================

/** Redondea a 2 decimales */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calcula la retención de IRPF del mes.
 *
 * Aplica el porcentaje de retención sobre la base sujeta a IRPF.
 *
 * @param baseIRPF - Base sobre la que se aplica la retención (€).
 *                   Normalmente = total devengos salariales del mes.
 * @param irpfPercentage - Porcentaje de retención (ej: 15.0 para el 15%)
 * @returns Importe de la retención de IRPF (€)
 */
export function calculateIRPF(baseIRPF: number, irpfPercentage: number): number {
  if (irpfPercentage < 0 || irpfPercentage > 100) {
    throw new Error(
      `Porcentaje de IRPF inválido: ${irpfPercentage}%. Debe estar entre 0 y 100.`
    );
  }

  if (baseIRPF <= 0) {
    return 0;
  }

  return round2((baseIRPF * irpfPercentage) / 100);
}

/**
 * Calcula la base sujeta a IRPF del mes.
 *
 * La base IRPF incluye todos los devengos salariales:
 * - Salario base
 * - Complementos salariales
 * - Comisiones e incentivos
 * - Horas extras (normales y fuerza mayor)
 * - Paga extra si se cobra este mes
 * - Prestación IT a cargo de la empresa
 * - Otros devengos salariales
 *
 * NO incluye:
 * - Complementos no salariales exentos (dietas, plus transporte...)
 * - Prestación IT a cargo de la SS (la SS ya retiene)
 * - Indemnizaciones exentas
 *
 * @param totalSalaryAccruals - Total devengos salariales del mes
 * @param bonusPayment - Paga extra cobrada este mes (si aplica)
 * @param itCompanyBenefit - Prestación IT a cargo de la empresa
 * @returns Base sujeta a IRPF (€)
 */
export function calculateIRPFBase(
  totalSalaryAccruals: number,
  bonusPayment: number,
  itCompanyBenefit: number
): number {
  // La paga extra ya está incluida en totalSalaryAccruals si se paga este mes,
  // y la prestación IT empresa también se incluye como devengo salarial.
  // Devolvemos el total directamente.
  return round2(totalSalaryAccruals + bonusPayment + itCompanyBenefit);
}

/**
 * Tipos mínimos de retención IRPF según situación.
 * Se usan como referencia; el porcentaje real lo introduce el usuario.
 *
 * 2025:
 * - General: 2% (contratos temporales < 1 año)
 * - Contratos indefinidos: según tablas de Hacienda
 * - Contratos en prácticas: 2% (primer año)
 * - Cursos, conferencias: 15%
 * - Administradores: 35% (entidades < 100.000€ facturación: 19%)
 */
export const IRPF_MINIMUM_RATES = {
  /** Contratos temporales de duración inferior a 1 año */
  temporalShort: 2.0,
  /** Contratos en prácticas (primer empleo) */
  practicas: 2.0,
  /** Tipo general mínimo para contratos indefinidos */
  generalMinimum: 0.0,
  /** Máximo legal */
  maximum: 47.0,
} as const;

/**
 * Valida que el porcentaje de IRPF esté dentro de rangos razonables.
 * No es un error usar 0% (puede haber exención), pero se avisa.
 */
export function validateIRPFPercentage(percentage: number): string[] {
  const warnings: string[] = [];

  if (percentage === 0) {
    warnings.push(
      'El porcentaje de IRPF es 0%. Verifique que el trabajador está exento de retención.'
    );
  }

  if (percentage > IRPF_MINIMUM_RATES.maximum) {
    warnings.push(
      `El porcentaje de IRPF (${percentage}%) supera el máximo habitual ` +
      `(${IRPF_MINIMUM_RATES.maximum}%). Verifique el cálculo.`
    );
  }

  if (percentage < 0) {
    warnings.push('El porcentaje de IRPF no puede ser negativo.');
  }

  return warnings;
}
