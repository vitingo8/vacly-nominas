// ============================================================================
// generador190.ts — Modelo 190 (Resumen anual de retenciones IRPF)
// ----------------------------------------------------------------------------
// Resumen anual del modelo 111: detalle por perceptor de las percepciones
// íntegras y retenciones del ejercicio. Clave A = rendimientos del trabajo
// (empleados por cuenta ajena).
// ============================================================================

export interface Modelo190Perceptor {
  nif: string;
  nombre: string;
  /** Clave de percepción (A para empleados). */
  clave: string;
  subclave?: string;
  percepcionesIntegras: number;
  retenciones: number;
  percepcionesEspecie: number;
  ingresosACuentaEspecie: number;
  ceutaMelilla?: boolean;
}

export interface Modelo190Input {
  ejercicio: number;
  empresa: { nif: string; nombre: string };
  perceptores: Modelo190Perceptor[];
}

export interface Modelo190Result {
  ejercicio: number;
  numeroPerceptores: number;
  totalPercepcionesIntegras: number;
  totalRetenciones: number;
  totalPercepcionesEspecie: number;
  totalIngresosACuenta: number;
  text: string;
  csv: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateModelo190(input: Modelo190Input): Modelo190Result {
  // Consolidar por NIF (un perceptor puede tener varias nóminas).
  const byNif = new Map<string, Modelo190Perceptor>();
  for (const p of input.perceptores) {
    const existing = byNif.get(p.nif);
    if (existing) {
      existing.percepcionesIntegras = round2(existing.percepcionesIntegras + p.percepcionesIntegras);
      existing.retenciones = round2(existing.retenciones + p.retenciones);
      existing.percepcionesEspecie = round2(existing.percepcionesEspecie + p.percepcionesEspecie);
      existing.ingresosACuentaEspecie = round2(existing.ingresosACuentaEspecie + p.ingresosACuentaEspecie);
    } else {
      byNif.set(p.nif, { ...p });
    }
  }
  const consolidated = Array.from(byNif.values());

  const totalPercepcionesIntegras = round2(consolidated.reduce((s, p) => s + p.percepcionesIntegras, 0));
  const totalRetenciones = round2(consolidated.reduce((s, p) => s + p.retenciones, 0));
  const totalPercepcionesEspecie = round2(consolidated.reduce((s, p) => s + p.percepcionesEspecie, 0));
  const totalIngresosACuenta = round2(consolidated.reduce((s, p) => s + p.ingresosACuentaEspecie, 0));

  const text = [
    '════════════════════════════════════════════════',
    `  MODELO 190 — Resumen anual retenciones IRPF`,
    `  Ejercicio: ${input.ejercicio}`,
    `  Declarante: ${input.empresa.nombre} (${input.empresa.nif})`,
    '────────────────────────────────────────────────',
    `  Nº perceptores:                ${consolidated.length}`,
    `  Percepciones íntegras:         ${fmt(totalPercepcionesIntegras)} €`,
    `  Retenciones:                   ${fmt(totalRetenciones)} €`,
    `  Percepciones en especie:       ${fmt(totalPercepcionesEspecie)} €`,
    `  Ingresos a cuenta:             ${fmt(totalIngresosACuenta)} €`,
    '════════════════════════════════════════════════',
  ].join('\n');

  const csvLines = [
    'nif;nombre;clave;subclave;percepciones_integras;retenciones;percepciones_especie;ingresos_a_cuenta',
    ...consolidated.map((p) =>
      [
        p.nif,
        p.nombre,
        p.clave || 'A',
        p.subclave || '01',
        fmt(p.percepcionesIntegras),
        fmt(p.retenciones),
        fmt(p.percepcionesEspecie),
        fmt(p.ingresosACuentaEspecie),
      ].join(';'),
    ),
  ];

  return {
    ejercicio: input.ejercicio,
    numeroPerceptores: consolidated.length,
    totalPercepcionesIntegras,
    totalRetenciones,
    totalPercepcionesEspecie,
    totalIngresosACuenta,
    text,
    csv: csvLines.join('\n'),
  };
}
