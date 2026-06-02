// ============================================================================
// IRPF — Parser del XML de salida devuelto por la AEAT
// Detecta errores y mapea la respuesta a IRPFOutput.
// ----------------------------------------------------------------------------
// Parser XML ligero y sin dependencias (suficiente para el esquema AEAT, que
// no usa atributos ni CDATA en la respuesta de retenciones). Repite tags ->
// array, igual que fast-xml-parser con ignoreAttributes/parseTagValue=false.
// ============================================================================

import type { IRPFError, IRPFOutput } from './types';

export type ParsedXMLResult =
  | { ok: true; data: IRPFOutput }
  | { ok: false; errors: IRPFError[] };

type XmlNode = string | { [key: string]: XmlNode | XmlNode[] };

/** Parser XML minimalista (sin atributos/CDATA) -> objeto anidado. */
function parseXml(xml: string): Record<string, any> {
  // Quitar prólogo, comentarios y declaraciones.
  let s = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, c) => escapeForText(c))
    .trim();

  const tokenRe = /<\s*(\/)?\s*([A-Za-z_][\w.:-]*)((?:\s+[^<>]*?)?)\s*(\/)?\s*>|([^<]+)/g;
  const root: Record<string, any> = {};
  const stack: Array<Record<string, any>> = [root];
  let textBuffer = '';

  const flushText = () => {
    const text = decodeEntities(textBuffer).trim();
    textBuffer = '';
    return text;
  };

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(s)) !== null) {
    const [, closing, tagName, , selfClose, textChunk] = match;

    if (textChunk != null) {
      textBuffer += textChunk;
      continue;
    }

    const current = stack[stack.length - 1];
    const text = flushText();
    // Si el nodo actual sólo tenía texto, lo guardamos temporalmente.
    if (text) {
      current.__text = (current.__text ?? '') + text;
    }

    if (closing) {
      // Cerrar nodo: convertir __text en valor escalar si no hay hijos.
      stack.pop();
      continue;
    }

    const node: Record<string, any> = {};
    // Añadir el nuevo nodo al padre.
    if (current[tagName] === undefined) {
      current[tagName] = node;
    } else if (Array.isArray(current[tagName])) {
      current[tagName].push(node);
    } else {
      current[tagName] = [current[tagName], node];
    }

    if (!selfClose) {
      stack.push(node);
    }
  }

  return normalize(root);
}

/** Convierte nodos { __text } en string y limpia objetos vacíos. */
function normalize(obj: any): any {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalize);

  const keys = Object.keys(obj);
  // Nodo de sólo texto.
  if (keys.length === 1 && keys[0] === '__text') {
    return obj.__text;
  }
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (key === '__text') {
      // Texto mezclado con hijos: lo descartamos (no aplica al esquema AEAT).
      continue;
    }
    out[key] = normalize(obj[key]);
  }
  // Objeto vacío (tag sin contenido) -> string vacío para compatibilidad.
  return Object.keys(out).length === 0 ? '' : out;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function escapeForText(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function formatLocation(error: any): string {
  const parts = [
    error?.Linea != null ? `línea ${error.Linea}` : '',
    error?.Posicion != null ? `posición ${error.Posicion}` : '',
    error?.XPath ? `XPath ${error.XPath}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function mapAeatError(error: any, fallbackCode: string, prefix = ''): IRPFError {
  const code = toStr(error?.Codigo) || fallbackCode;
  const description =
    toStr(error?.Descripcion) ||
    toStr(error?.descripcion) ||
    'Error de validación devuelto por la AEAT.';
  return {
    codigo: code,
    descripcion: `${prefix}${description}${formatLocation(error)}`,
  };
}

function collectAeatErrors(root: any): IRPFError[] {
  const errors: IRPFError[] = [];

  for (const error of asArray(root?.ErrorGeneral)) {
    errors.push(mapAeatError(error, 'GENERAL'));
  }

  for (const retenedor of asArray(root?.Retenedor)) {
    const retenedorPrefix = retenedor?.Orden != null ? `Retenedor ${retenedor.Orden}: ` : 'Retenedor: ';
    for (const error of asArray(retenedor?.Error)) {
      errors.push(mapAeatError(error, 'RETENEDOR', retenedorPrefix));
    }

    for (const retenido of asArray(retenedor?.Retenido)) {
      const retenidoPrefix = retenido?.Orden != null ? `Retenido ${retenido.Orden}: ` : 'Retenido: ';
      for (const error of asArray(retenido?.Error)) {
        errors.push(mapAeatError(error, 'RETENIDO', retenidoPrefix));
      }

      for (const asc of asArray(retenido?.Ascendiente)) {
        const ascPrefix = asc?.Orden != null
          ? `${retenidoPrefix}Ascendiente ${asc.Orden}: `
          : `${retenidoPrefix}Ascendiente: `;
        for (const error of asArray(asc?.Error)) {
          errors.push(mapAeatError(error, 'ASCENDIENTE', ascPrefix));
        }
      }

      for (const desc of asArray(retenido?.Descendiente)) {
        const descPrefix = desc?.Orden != null
          ? `${retenidoPrefix}Descendiente ${desc.Orden}: `
          : `${retenidoPrefix}Descendiente: `;
        for (const error of asArray(desc?.Error)) {
          errors.push(mapAeatError(error, 'DESCENDIENTE', descPrefix));
        }
      }
    }
  }

  return errors;
}

export function parseOutputXML(xmlString: string): ParsedXMLResult {
  let parsed: any;
  try {
    parsed = parseXml(xmlString);
  } catch (err: any) {
    return {
      ok: false,
      errors: [
        { codigo: 'PARSE', descripcion: `No se pudo parsear la respuesta XML: ${err?.message ?? err}` },
      ],
    };
  }

  // ── Respuesta de error ────────────────────────────────────────────────
  const errorRoot =
    parsed.AEATRetencionesError2026 ||
    parsed.AEATRetencionesError2025 ||
    parsed.AEATRetencionesError;
  if (errorRoot) {
    const errors = collectAeatErrors(errorRoot);
    if (errors.length === 0) {
      return {
        ok: false,
        errors: [{ codigo: 'UNKNOWN', descripcion: 'Respuesta de error de la AEAT sin detalle.' }],
      };
    }
    return { ok: false, errors };
  }

  // ── Respuesta OK ──────────────────────────────────────────────────────
  const salida =
    parsed?.AEATRetencionesSalida2026 ||
    parsed?.AEATRetencionesSalida2025 ||
    parsed?.AEATRetencionesSalida;
  const retenido = salida?.Retenedor?.Retenido;
  if (!retenido) {
    return {
      ok: false,
      errors: [
        {
          codigo: 'UNEXPECTED',
          descripcion: 'Respuesta inesperada de la AEAT (no se encontró el nodo Retenido).',
        },
      ],
    };
  }

  const mpf = retenido.MinimoPersonalFamiliar ?? {};
  const gastos = retenido.Gastos ?? {};
  const otrosGastos = gastos.OtrosGastos ?? {};
  const desc = retenido.Descendientes ?? {};
  const computo = desc.ComputoDescendientes ?? {};

  const output: IRPFOutput = {
    tipoRetencion: toNumber(retenido.TipoRetencion),
    importeAnualRetenciones: toNumber(retenido.ImpAnualRetencionesIngresosCuenta),
    baseRetencion: toNumber(retenido.BaseRetencion),

    gastos: {
      general: toNumber(otrosGastos.General),
      movilidadGeografica: toNumber(otrosGastos.MovilidadGeografica),
      discapacidadActivos: toNumber(otrosGastos.DiscapacidadTrabajadoresActivos),
      total: toNumber(otrosGastos.Total),
      gastosTotales: toNumber(gastos.Total),
    },

    rdtoNeto: toNumber(retenido.RdtoNeto),
    rdtoNetoReducido: toNumber(retenido.RdtoNetoReducido),
    minoracionPrestamo: toNumber(retenido.MinoracionPrestamo),

    minimoPersonalFamiliar: {
      minimoContribuyente: {
        general: toNumber(mpf?.MinimoCtye?.General),
        edad: toNumber(mpf?.MinimoCtye?.Edad),
        asistencia: toNumber(mpf?.MinimoCtye?.Asistencia),
        total: toNumber(mpf?.MinimoCtye?.Total),
      },
      minimoDescendientes: {
        general: toNumber(mpf?.MinimoDescendientes?.General),
        cuidadoHijos: toNumber(mpf?.MinimoDescendientes?.CuidadoHijos),
        total: toNumber(mpf?.MinimoDescendientes?.Total),
      },
      minimoAscendientes: {
        edad: toNumber(mpf?.MinimoAscendientes?.Edad),
        asistencia: toNumber(mpf?.MinimoAscendientes?.Asistencia),
        total: toNumber(mpf?.MinimoAscendientes?.Total),
      },
      minimoDiscapacidad: {
        contribuyente: {
          discapacidad: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadCtye?.Discapacidad),
          asistencia: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadCtye?.Asistencia),
          total: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadCtye?.Total),
        },
        descAsc: {
          discDesc: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadDescAsc?.DiscapacidadDesc),
          asisDesc: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadDescAsc?.AsistenciaDesc),
          discAsc: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadDescAsc?.DiscapacidadAsc),
          asisAsc: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadDescAsc?.AsistenciaAsc),
          total: toNumber(mpf?.MinimoDiscapacidad?.DiscapacidadDescAsc?.Total),
        },
        total: toNumber(mpf?.MinimoDiscapacidad?.Total),
      },
      total: toNumber(mpf?.Total),
    },

    reduccion: {
      rdtosTrabajo: toNumber(retenido.Reduccion?.RdtosTrabajo),
      reduccionMas2: toNumber(retenido.Reduccion?.ReduccionMas2),
      pensionista: toNumber(retenido.Reduccion?.Pensionista),
    },

    descendientes: {
      hijo1: toStr(computo.Hijo1),
      hijo2: toStr(computo.Hijo2),
      hijo3: toStr(computo.Hijo3),
      cuartoYSucesivos: {
        total: toNumber(computo.CuartoySucesivos?.Total),
        porEntero: toNumber(computo.CuartoySucesivos?.PorEntero),
      },
      menores3: {
        total: toNumber(desc.Menores3?.Total),
        porEntero: toNumber(desc.Menores3?.PorEntero),
      },
      resto: {
        total: toNumber(desc.Resto?.Total),
        porEntero: toNumber(desc.Resto?.PorEntero),
      },
    },
  };

  return { ok: true, data: output };
}
