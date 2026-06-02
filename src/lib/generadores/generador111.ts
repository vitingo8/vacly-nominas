// ============================================================================
// generador111.ts — Modelo 111 (Retenciones IRPF rendimientos del trabajo)
// ----------------------------------------------------------------------------
// Declaración trimestral (o mensual para grandes empresas) de las retenciones
// e ingresos a cuenta del IRPF practicados sobre rendimientos del trabajo.
// Genera un resumen estructurado + una representación de texto y CSV.
// ============================================================================

export interface Modelo111Perceptor {
  nif: string;
  nombre: string;
  /** Percepciones íntegras dinerarias del periodo (€). */
  percepcionesDinerarias: number;
  /** Retenciones dinerarias practicadas (€). */
  retencionesDinerarias: number;
  /** Percepciones en especie (€). */
  percepcionesEspecie: number;
  /** Ingresos a cuenta sobre especie (€). */
  ingresosACuentaEspecie: number;
}

export interface Modelo111Input {
  ejercicio: number;
  /** Periodo: '1T'..'4T' (trimestral) o '01'..'12' (mensual). */
  periodo: string;
  empresa: { nif: string; nombre: string };
  perceptores: Modelo111Perceptor[];
}

export interface Modelo111Result {
  ejercicio: number;
  periodo: string;
  /** Casilla 01: nº de perceptores dinerarios. */
  numeroPerceptoresDinerarios: number;
  /** Casilla 02: importe percepciones dinerarias. */
  basePercepcionesDinerarias: number;
  /** Casilla 03: retenciones dinerarias. */
  retencionesDinerarias: number;
  /** Casilla 04: nº de perceptores en especie. */
  numeroPerceptoresEspecie: number;
  /** Casilla 05: valor percepciones en especie. */
  basePercepcionesEspecie: number;
  /** Casilla 06: ingresos a cuenta en especie. */
  ingresosACuentaEspecie: number;
  /** Casilla 28: total retenciones e ingresos a cuenta a ingresar. */
  totalAIngresar: number;
  text: string;
  csv: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateModelo111(input: Modelo111Input): Modelo111Result {
  const dinerarios = input.perceptores.filter((p) => p.percepcionesDinerarias > 0 || p.retencionesDinerarias > 0);
  const especie = input.perceptores.filter((p) => p.percepcionesEspecie > 0 || p.ingresosACuentaEspecie > 0);

  const basePercepcionesDinerarias = round2(
    dinerarios.reduce((s, p) => s + p.percepcionesDinerarias, 0),
  );
  const retencionesDinerarias = round2(dinerarios.reduce((s, p) => s + p.retencionesDinerarias, 0));
  const basePercepcionesEspecie = round2(especie.reduce((s, p) => s + p.percepcionesEspecie, 0));
  const ingresosACuentaEspecie = round2(especie.reduce((s, p) => s + p.ingresosACuentaEspecie, 0));
  const totalAIngresar = round2(retencionesDinerarias + ingresosACuentaEspecie);

  const text = [
    '════════════════════════════════════════════════',
    `  MODELO 111 — Retenciones IRPF (trabajo)`,
    `  Ejercicio: ${input.ejercicio}   Periodo: ${input.periodo}`,
    `  Declarante: ${input.empresa.nombre} (${input.empresa.nif})`,
    '────────────────────────────────────────────────',
    '  I. Rendimientos del trabajo',
    `  [01] Nº perceptores (dinerario):     ${dinerarios.length}`,
    `  [02] Percepciones dinerarias:        ${fmt(basePercepcionesDinerarias)} €`,
    `  [03] Retenciones dinerarias:         ${fmt(retencionesDinerarias)} €`,
    `  [04] Nº perceptores (especie):       ${especie.length}`,
    `  [05] Percepciones en especie:        ${fmt(basePercepcionesEspecie)} €`,
    `  [06] Ingresos a cuenta especie:      ${fmt(ingresosACuentaEspecie)} €`,
    '────────────────────────────────────────────────',
    `  [28] TOTAL A INGRESAR:               ${fmt(totalAIngresar)} €`,
    '════════════════════════════════════════════════',
  ].join('\n');

  const csvLines = [
    'nif;nombre;percepciones_dinerarias;retenciones_dinerarias;percepciones_especie;ingresos_a_cuenta',
    ...input.perceptores.map((p) =>
      [
        p.nif,
        p.nombre,
        fmt(p.percepcionesDinerarias),
        fmt(p.retencionesDinerarias),
        fmt(p.percepcionesEspecie),
        fmt(p.ingresosACuentaEspecie),
      ].join(';'),
    ),
  ];

  return {
    ejercicio: input.ejercicio,
    periodo: input.periodo,
    numeroPerceptoresDinerarios: dinerarios.length,
    basePercepcionesDinerarias,
    retencionesDinerarias,
    numeroPerceptoresEspecie: especie.length,
    basePercepcionesEspecie,
    ingresosACuentaEspecie,
    totalAIngresar,
    text,
    csv: csvLines.join('\n'),
  };
}
