import {
  DEFAULT_CONFIG_2025,
  DEFAULT_CONFIG_2026,
  getDefaultPayrollConfig,
} from '@/lib/calculadora';
import type { PayrollConfigInput } from '@/lib/calculadora';

export type PeriodSmi = {
  monthly: number;
  effectiveFrom: string;
};

export type PayrollParameterResolution = {
  config: PayrollConfigInput;
  smiForPeriod: PeriodSmi;
  sourceYear: number;
  sourceEffectiveFrom: string;
  warnings: string[];
};

type PayrollParameterRecord = {
  year?: unknown;
  effectiveFrom?: unknown;
  effective_from?: unknown;
  config?: unknown;
  parameters?: unknown;
  payrollConfig?: unknown;
  values?: unknown;
  [key: string]: unknown;
};

type NormalizedParameterRecord = {
  year?: number;
  effectiveFrom: string;
  config: Record<string, unknown>;
};

const BUILT_IN_PARAMETER_RECORDS: Array<{
  year: number;
  effectiveFrom: string;
  config: PayrollConfigInput;
}> = [
  { year: 2025, effectiveFrom: '2025-01-01', config: DEFAULT_CONFIG_2025 },
  { year: 2026, effectiveFrom: '2026-01-01', config: DEFAULT_CONFIG_2026 },
];

const BUILT_IN_SMI_RECORDS: PeriodSmi[] = [
  { effectiveFrom: '2023-02-15', monthly: 1080 },
  { effectiveFrom: '2024-01-01', monthly: 1134 },
  { effectiveFrom: '2025-01-01', monthly: 1184 },
  { effectiveFrom: '2026-03-01', monthly: 1221 },
];

const HISTORY_KEYS = new Set([
  'parameterHistory',
  'parametersHistory',
  'payrollParametersHistory',
  'annualParameterHistory',
  'annualParametersHistory',
  'history',
  'years',
  'byYear',
  'smiHistory',
  'smiEffectiveFrom',
]);

export function getSmiForDate(onDate: string, annualParameters?: unknown): PeriodSmi {
  const params = asRecord(annualParameters);
  const records = [...BUILT_IN_SMI_RECORDS];

  if (Array.isArray(params?.smiHistory)) {
    params.smiHistory.forEach((row) => {
      const record = asRecord(row);
      const effectiveFrom = toIsoDate(record?.effectiveFrom ?? record?.effective_from);
      const monthly = toPositiveNumber(record?.monthly ?? record?.smiMonthly ?? record?.smi);
      if (effectiveFrom && monthly) records.push({ effectiveFrom, monthly });
    });
  }

  collectParameterHistory(params).forEach((row) => {
    const effectiveFrom = row.effectiveFrom;
    const config = row.config;
    const monthly = toPositiveNumber(config.smiMonthly ?? config.smi);
    if (effectiveFrom && monthly) records.push({ effectiveFrom, monthly });
  });

  if (params?.smiEffectiveFrom && (params?.smiMonthly || params?.smi)) {
    const effectiveFrom = toIsoDate(params.smiEffectiveFrom);
    const monthly = toPositiveNumber(params.smiMonthly ?? params.smi);
    if (effectiveFrom && monthly) records.push({ effectiveFrom, monthly });
  }

  const sorted = records
    .filter((record) => record.effectiveFrom && record.monthly > 0)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return sorted.find((record) => record.effectiveFrom <= onDate) ?? sorted[sorted.length - 1];
}

export function resolvePayrollConfigForDate(
  onDate: string,
  annualParameters?: unknown,
): PayrollParameterResolution {
  const targetYear = Number(onDate.slice(0, 4)) || new Date(onDate).getFullYear();
  const params = asRecord(annualParameters);
  const warnings: string[] = [];
  const builtIn = resolveBuiltInConfig(targetYear);
  const historyRows = collectParameterHistory(params)
    .filter((row) => row.effectiveFrom <= onDate)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  let config = cloneConfig(builtIn.config);
  let sourceYear = builtIn.year;
  let sourceEffectiveFrom = builtIn.effectiveFrom;

  historyRows.forEach((row) => {
    config = mergePayrollConfig(config, row.config);
    sourceYear = row.year ?? sourceYear;
    sourceEffectiveFrom = row.effectiveFrom;
  });

  const legacyFlatOverrides = extractConfigShape(params);
  if (legacyFlatOverrides) {
    config = mergePayrollConfig(config, legacyFlatOverrides);
  }

  const smiForPeriod = getSmiForDate(onDate, annualParameters);
  config.smiMonthly = smiForPeriod.monthly;
  config.year = targetYear;

  const hasExactYearHistory = historyRows.some((row) => row.year === targetYear);
  if (targetYear > latestBuiltInYear() && !hasExactYearHistory) {
    warnings.push(
      `No hay parámetros oficiales cargados para ${targetYear}; se usan los últimos parámetros vigentes (${sourceYear}) salvo SMI si existe historial.`,
    );
  } else if (sourceYear < targetYear && historyRows.length > 0) {
    warnings.push(
      `Los parámetros vigentes para ${onDate} proceden de ${sourceYear}; cargue ${targetYear} si ya están publicados.`,
    );
  }

  return {
    config,
    smiForPeriod,
    sourceYear,
    sourceEffectiveFrom,
    warnings,
  };
}

function resolveBuiltInConfig(targetYear: number): {
  year: number;
  effectiveFrom: string;
  config: PayrollConfigInput;
} {
  const selected =
    BUILT_IN_PARAMETER_RECORDS
      .filter((record) => record.year <= targetYear)
      .sort((a, b) => b.year - a.year)[0] ?? BUILT_IN_PARAMETER_RECORDS[0];

  return {
    year: selected.year,
    effectiveFrom: selected.effectiveFrom,
    config: getDefaultPayrollConfig(selected.year),
  };
}

function latestBuiltInYear(): number {
  return Math.max(...BUILT_IN_PARAMETER_RECORDS.map((record) => record.year));
}

function collectParameterHistory(
  annualParameters: Record<string, unknown> | null,
): NormalizedParameterRecord[] {
  if (!annualParameters) return [];

  const rawRows: PayrollParameterRecord[] = [];
  const arrayKeys = [
    'parameterHistory',
    'parametersHistory',
    'payrollParametersHistory',
    'annualParameterHistory',
    'annualParametersHistory',
    'history',
  ];

  arrayKeys.forEach((key) => {
    if (Array.isArray(annualParameters[key])) {
      rawRows.push(...(annualParameters[key] as PayrollParameterRecord[]));
    }
  });

  const years = annualParameters.years ?? annualParameters.byYear;
  if (years && typeof years === 'object' && !Array.isArray(years)) {
    Object.entries(years as Record<string, unknown>).forEach(([year, value]) => {
      const record = asRecord(value);
      if (record) rawRows.push({ ...record, year: Number(year) });
    });
  }

  const normalized: NormalizedParameterRecord[] = [];

  rawRows.forEach((row) => {
      const record = asRecord(row);
      if (!record) return;

      const year = toYear(record.year);
      const effectiveFrom =
        toIsoDate(record.effectiveFrom ?? record.effective_from) ??
        (year ? `${year}-01-01` : null);
      const payload =
        asRecord(record.config) ??
        asRecord(record.parameters) ??
        asRecord(record.payrollConfig) ??
        asRecord(record.values) ??
        record;
      const config = extractConfigShape(payload);

      if (!effectiveFrom || !config) return;
      normalized.push({
        ...(year ? { year } : {}),
        effectiveFrom,
        config,
      });
    });

  return normalized;
}

function extractConfigShape(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;

  const config: Record<string, unknown> = {};
  const directKeys = ['year', 'smiMonthly', 'smi', 'maxCotizationBase', 'maxOvertimeHoursYear'];
  directKeys.forEach((key) => {
    if (value[key] !== undefined) config[key] = value[key];
  });

  if (Array.isArray(value.groupLimits)) config.groupLimits = value.groupLimits;
  if (asRecord(value.workerRates)) config.workerRates = value.workerRates;
  if (asRecord(value.companyRates)) config.companyRates = value.companyRates;

  Object.keys(config).forEach((key) => {
    if (HISTORY_KEYS.has(key)) delete config[key];
  });

  return Object.keys(config).length > 0 ? config : null;
}

function mergePayrollConfig(base: PayrollConfigInput, overrides: Record<string, unknown>): PayrollConfigInput {
  const next = cloneConfig(base);
  const year = toYear(overrides.year);
  const smiMonthly = toPositiveNumber(overrides.smiMonthly ?? overrides.smi);
  const maxCotizationBase = toPositiveNumber(overrides.maxCotizationBase);
  const maxOvertimeHoursYear = toPositiveNumber(overrides.maxOvertimeHoursYear);

  if (year) next.year = year;
  if (smiMonthly) next.smiMonthly = smiMonthly;
  if (maxCotizationBase) next.maxCotizationBase = maxCotizationBase;
  if (maxOvertimeHoursYear) next.maxOvertimeHoursYear = maxOvertimeHoursYear;
  if (Array.isArray(overrides.groupLimits)) {
    next.groupLimits = overrides.groupLimits.map((row) => ({ ...(row as PayrollConfigInput['groupLimits'][number]) }));
  }

  const workerRates = asRecord(overrides.workerRates);
  if (workerRates) {
    next.workerRates = { ...next.workerRates, ...numberOnly(workerRates) };
  }

  const companyRates = asRecord(overrides.companyRates);
  if (companyRates) {
    next.companyRates = { ...next.companyRates, ...numberOnly(companyRates) };
  }

  return next;
}

function cloneConfig(config: PayrollConfigInput): PayrollConfigInput {
  return {
    ...config,
    groupLimits: config.groupLimits.map((row) => ({ ...row })),
    workerRates: { ...config.workerRates },
    companyRates: { ...config.companyRates },
  };
}

function numberOnly(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key, Number(raw)])
      .filter(([, raw]) => Number.isFinite(raw as number)),
  ) as Record<string, number>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toPositiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function toYear(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 1900 ? numeric : undefined;
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
