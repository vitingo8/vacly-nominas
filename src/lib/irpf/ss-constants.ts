// Bases mínimas/máximas cotización (€/mes) por año, para estimar la cuota anual
// de SS del trabajador que alimenta el campo <Cotizaciones> del XML AEAT.

export type GrupoCotizacion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface SsGroupLimit {
  group: GrupoCotizacion;
  minBase: number;
  maxBase: number;
}

export const SMI_MONTHLY_BY_YEAR: Record<number, number> = {
  2025: 1184,
  2026: 1221,
};

export const MAX_BASE_COTIZACION_MENSUAL_BY_YEAR: Record<number, number> = {
  2025: 4720.5,
  2026: 5101.2,
};

const GROUP_LIMITS_2025: ReadonlyArray<SsGroupLimit> = [
  { group: 1, minBase: 1903.5, maxBase: 4720.5 },
  { group: 2, minBase: 1578.3, maxBase: 4720.5 },
  { group: 3, minBase: 1373.4, maxBase: 4720.5 },
  { group: 4, minBase: 1362.0, maxBase: 4720.5 },
  { group: 5, minBase: 1362.0, maxBase: 4720.5 },
  { group: 6, minBase: 1362.0, maxBase: 4720.5 },
  { group: 7, minBase: 1362.0, maxBase: 4720.5 },
  { group: 8, minBase: 1362.0, maxBase: 4720.5 },
  { group: 9, minBase: 1362.0, maxBase: 4720.5 },
  { group: 10, minBase: 1362.0, maxBase: 4720.5 },
  { group: 11, minBase: 1362.0, maxBase: 4720.5 },
];

const GROUP_LIMITS_2026: ReadonlyArray<SsGroupLimit> = [
  { group: 1, minBase: 1989.3, maxBase: 5101.2 },
  { group: 2, minBase: 1649.7, maxBase: 5101.2 },
  { group: 3, minBase: 1435.2, maxBase: 5101.2 },
  { group: 4, minBase: 1424.4, maxBase: 5101.2 },
  { group: 5, minBase: 1424.4, maxBase: 5101.2 },
  { group: 6, minBase: 1424.4, maxBase: 5101.2 },
  { group: 7, minBase: 1424.4, maxBase: 5101.2 },
  { group: 8, minBase: 1424.4, maxBase: 5101.2 },
  { group: 9, minBase: 1424.4, maxBase: 5101.2 },
  { group: 10, minBase: 1424.4, maxBase: 5101.2 },
  { group: 11, minBase: 1424.4, maxBase: 5101.2 },
];

export function getGroupLimitsForYear(year: number): ReadonlyArray<SsGroupLimit> {
  return year >= 2026 ? GROUP_LIMITS_2026 : GROUP_LIMITS_2025;
}

export function getMaxBaseForYear(year: number): number {
  return MAX_BASE_COTIZACION_MENSUAL_BY_YEAR[year] ?? (year >= 2026 ? 5101.2 : 4720.5);
}

export function getSmiMonthlyForYear(year: number): number {
  return SMI_MONTHLY_BY_YEAR[year] ?? (year >= 2026 ? 1221 : 1184);
}
