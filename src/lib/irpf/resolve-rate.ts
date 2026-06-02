// ============================================================================
// IRPF — Resolución automática del tipo de retención por trabajador
// ----------------------------------------------------------------------------
// Construye el Modelo 145 (IRPFInput) a partir de los datos del empleado,
// estima la retribución anual y la cuota SS, y obtiene el tipo de retención
// llamando al web service de la AEAT. Si la AEAT falla, usa el estimador
// offline para no bloquear la generación de nóminas.
// ============================================================================

import type {
  IRPFInput,
  IRPFOutput,
  SituacionFamiliar,
  TipoContratoIRPF,
  Descendiente,
  Ascendiente,
} from './types';
import { calcularIRPF } from './aeat-service';
import { estimateWorkerSocialSecurityAnnual } from './ss-estimate-annual';
import { estimateIRPFRate } from './fallback-estimator';

export type IrpfRateSource = 'aeat' | 'aeat_employee_irpf_data' | 'estimated' | 'manual';

export interface ResolveIrpfRateParams {
  company: { nif: string; name: string };
  employee: {
    nif: string;
    name: string;
    birthYear?: number | null;
    /** Datos Modelo 145 persistidos (employees.irpf_data). */
    irpfData?: any;
    /** Situación familiar (employees.family_situation). */
    familySituation?: any;
    cotizationGroup?: number | null;
    contractType?: string | null;
  };
  /** Retribución íntegra anual estimada (€). */
  annualGross: number;
  year: number;
  test?: boolean;
}

export interface ResolveIrpfRateResult {
  rate: number;
  source: IrpfRateSource;
  output?: IRPFOutput;
  estimated?: { baseRetencion: number; minimoPersonalFamiliar: number; importeAnualRetenciones: number };
  xmlInput?: string;
  xmlOutput?: string;
  warnings: string[];
  input: IRPFInput;
}

function mapTipoContrato(contractType?: string | null): TipoContratoIRPF {
  const t = (contractType || '').toLowerCase();
  if (t.includes('temp') || t.includes('determinad')) return '2';
  if (t.includes('especial') || t.includes('alta direc')) return '3';
  return '1';
}

function mapSituacionFamiliar(family: any): { situacion: SituacionFamiliar; nifConyuge?: string } {
  if (!family) return { situacion: 'Situacion3' };
  const estado = String(family.marital_status ?? family.estadoCivil ?? '').toLowerCase();
  const monoparental = Boolean(family.single_parent ?? family.monoparental);
  const conyugeSinRentas = Boolean(family.spouse_no_income ?? family.conyugeSinRentas);
  const nifConyuge = family.spouse_nif ?? family.nifConyuge ?? undefined;

  if (monoparental) return { situacion: 'Situacion1' };
  if ((estado.includes('casad') || estado.includes('married')) && conyugeSinRentas && nifConyuge) {
    return { situacion: 'Situacion2', nifConyuge };
  }
  return { situacion: 'Situacion3' };
}

function mapDescendientes(family: any): Descendiente[] {
  const raw = family?.descendientes ?? family?.children_detail ?? family?.children ?? [];
  if (Array.isArray(raw)) {
    return raw
      .map((c: any): Descendiente | null => {
        const anioNacimiento = Number(c?.anioNacimiento ?? c?.birth_year ?? c?.year);
        if (!Number.isFinite(anioNacimiento) || anioNacimiento < 1900) return null;
        return {
          anioNacimiento,
          anioAdopcion: c?.anioAdopcion ?? undefined,
          computadoEntero: c?.computadoEntero ?? c?.full_custody ?? true,
          discapacidad: c?.discapacidad ?? undefined,
        };
      })
      .filter((x): x is Descendiente => x !== null)
      .slice(0, 16);
  }
  // Solo nº de hijos: asumimos custodia total, sin año (no aporta menor de 3).
  const n = Number(family?.children ?? family?.num_children ?? 0);
  if (Number.isFinite(n) && n > 0) {
    const yearNow = new Date().getFullYear();
    return Array.from({ length: Math.min(n, 16) }, () => ({
      anioNacimiento: yearNow - 10,
      computadoEntero: true,
    }));
  }
  return [];
}

function mapAscendientes(family: any): Ascendiente[] {
  const raw = family?.ascendientes ?? family?.dependents ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a: any): Ascendiente | null => {
      const anioNacimiento = Number(a?.anioNacimiento ?? a?.birth_year);
      if (!Number.isFinite(anioNacimiento)) return null;
      return {
        anioNacimiento,
        convivencia: Number(a?.convivencia ?? 1) || 1,
        discapacidad: a?.discapacidad ?? undefined,
      };
    })
    .filter((x): x is Ascendiente => x !== null)
    .slice(0, 6);
}

export function buildIrpfInputFromEmployee(params: ResolveIrpfRateParams): IRPFInput {
  const { company, employee, annualGross, year } = params;
  const irpfData = employee.irpfData ?? {};
  const family = employee.familySituation ?? irpfData.familySituation ?? {};

  const { situacion, nifConyuge } = mapSituacionFamiliar({ ...family, ...irpfData });

  const grupo = Number(employee.cotizationGroup ?? 7) || 7;
  const indefinido = mapTipoContrato(employee.contractType) === '1';
  const cotizaciones =
    Number(irpfData.cotizaciones) > 0
      ? Number(irpfData.cotizaciones)
      : estimateWorkerSocialSecurityAnnual(annualGross, grupo, indefinido, 2, year);

  return {
    nifEmpresa: company.nif || '',
    nombreEmpresa: company.name || '',
    nifTrabajador: employee.nif || '',
    nombreTrabajador: employee.name || '',
    anioNacimiento: Number(employee.birthYear ?? irpfData.anioNacimiento ?? year - 35) || year - 35,
    situacionFamiliar: situacion,
    nifConyuge,
    residenciaCeutaMelilla: Boolean(irpfData.residenciaCeutaMelilla),
    discapacidad: irpfData.discapacidad ?? undefined,
    situacionLaboral: 'TrabajadorActivo',
    tipoContrato: mapTipoContrato(employee.contractType),
    movilidadGeografica: Boolean(irpfData.movilidadGeografica),
    descendientes: mapDescendientes({ ...family, ...irpfData }),
    ascendientes: mapAscendientes({ ...family, ...irpfData }),
    retribAnuales: Math.round(annualGross * 100) / 100,
    cotizaciones,
    irregularidad1: Number(irpfData.irregularidad1) || undefined,
    irregularidad2: Number(irpfData.irregularidad2) || undefined,
    pensionCompensatoria: Number(irpfData.pensionCompensatoria) || undefined,
    anualidadesHijos: Number(irpfData.anualidadesHijos) || undefined,
    pagoPrestamosVivienda: Boolean(irpfData.pagoPrestamosVivienda),
  };
}

/**
 * Resuelve el tipo de retención del trabajador (AEAT con fallback offline).
 */
export async function resolveAnnualIrpfRate(
  params: ResolveIrpfRateParams,
): Promise<ResolveIrpfRateResult> {
  const warnings: string[] = [];
  const input = buildIrpfInputFromEmployee(params);

  if (!input.retribAnuales || input.retribAnuales <= 0) {
    return { rate: 0, source: 'estimated', warnings: ['Retribución anual 0; tipo IRPF = 0%.'], input };
  }

  // Faltan NIFs: la AEAT los exige -> directamente estimación offline.
  if (!input.nifEmpresa || !input.nifTrabajador) {
    const est = estimateIRPFRate(input, params.year);
    warnings.push('Sin NIF de empresa o trabajador; tipo IRPF estimado offline.')
    return {
      rate: est.tipoRetencion,
      source: 'estimated',
      estimated: est,
      warnings,
      input,
    };
  }

  try {
    const res = await calcularIRPF(input, { test: params.test, ejercicio: params.year });
    if (res.ok) {
      return {
        rate: res.data.tipoRetencion,
        source: 'aeat',
        output: res.data,
        xmlInput: res.xmlInput,
        xmlOutput: res.xmlOutput,
        warnings,
        input,
      };
    }
    warnings.push(
      `AEAT no devolvió un tipo válido (${res.errors.map((e) => e.codigo).join(', ')}); se usa estimación offline.`,
    );
  } catch (err: any) {
    warnings.push(`Error llamando a la AEAT (${err?.message ?? err}); se usa estimación offline.`);
  }

  const est = estimateIRPFRate(input, params.year);
  return {
    rate: est.tipoRetencion,
    source: 'estimated',
    estimated: est,
    warnings,
    input,
  };
}
