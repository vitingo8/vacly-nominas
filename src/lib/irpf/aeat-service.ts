// ============================================================================
// IRPF — Cliente del Web Service público de la AEAT
// ----------------------------------------------------------------------------
// POST (application/x-www-form-urlencoded)
//   EJER=<año>&PER=0&F01=<XML_URL_ENCODED>
// Sin autenticación. La AEAT devuelve XML con el tipo de retención calculado.
// ============================================================================

import type { IRPFInput, IRPFResult } from './types';
import { buildInputXML } from './xml-builder';
import { parseOutputXML } from './xml-parser';

const AEAT_URL_PROD = 'https://www2.agenciatributaria.gob.es/wlpl/PRET-R200/mc';
const AEAT_URL_TEST = 'https://prewww2.aeat.es/wlpl/PRET-R200/mc';

const DEFAULT_TIMEOUT_MS = 15000;

export interface CalcularIRPFOptions {
  /** Si true, usa el endpoint de pruebas (prewww2.aeat.es). */
  test?: boolean;
  /** Timeout en ms (por defecto 15000). */
  timeoutMs?: number;
  /** Ejercicio fiscal (por defecto 2026). */
  ejercicio?: number;
}

export async function calcularIRPF(
  input: IRPFInput,
  options: CalcularIRPFOptions = {},
): Promise<IRPFResult> {
  const url = options.test ? AEAT_URL_TEST : AEAT_URL_PROD;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ejercicio = options.ejercicio ?? 2026;

  let xmlInput: string;
  try {
    xmlInput = buildInputXML(input, ejercicio);
  } catch (err: any) {
    return {
      ok: false,
      errors: [{ codigo: 'INPUT', descripcion: err?.message ?? String(err) }],
    };
  }

  const body = `EJER=${ejercicio}&PER=0&F01=${encodeURIComponent(xmlInput)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let xmlOutput = '';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/xml, text/xml, */*',
      },
      body,
      signal: controller.signal,
    });
    xmlOutput = await response.text();

    if (response.status === 400) {
      return {
        ok: false,
        errors: [{ codigo: '400', descripcion: 'Datos de entrada incorrectos (HTTP 400).' }],
        xmlInput,
        xmlOutput,
      };
    }
    if (!response.ok && !xmlOutput) {
      return {
        ok: false,
        errors: [
          { codigo: String(response.status), descripcion: `Error HTTP ${response.status} de la AEAT.` },
        ],
        xmlInput,
        xmlOutput,
      };
    }
  } catch (err: any) {
    clearTimeout(timeout);
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      errors: [
        {
          codigo: aborted ? 'TIMEOUT' : 'NETWORK',
          descripcion: aborted
            ? `Tiempo de espera agotado tras ${timeoutMs} ms.`
            : `Error de red llamando a la AEAT: ${err?.message ?? err}`,
        },
      ],
      xmlInput,
    };
  } finally {
    clearTimeout(timeout);
  }

  const parsed = parseOutputXML(xmlOutput);

  if (parsed.ok) {
    return { ok: true, data: parsed.data, xmlInput, xmlOutput };
  }
  return { ok: false, errors: parsed.errors, xmlInput, xmlOutput };
}
