// ============================================================================
// IRPF — Constructor del XML de entrada para el WS de la AEAT
// Genera XML conforme a AEATRetenciones20XX.xsd
// ============================================================================

import type {
  Ascendiente,
  Descendiente,
  Discapacidad,
  IRPFInput,
  RegularizacionInput,
} from './types';

export function buildInputXML(input: IRPFInput, ejercicio = 2026): string {
  const sitFam = buildSituacionFamiliar(input);
  const discPer = input.discapacidad ? buildDiscapacidadWrapper(input.discapacidad) : '';
  const situLab = buildSituacionLaboral(input);
  const descList = (input.descendientes ?? []).map(buildDescendiente).join('\n');
  const ascList = (input.ascendientes ?? []).map(buildAscendiente).join('\n');
  const reducciones = buildReducciones(input);
  const regu = input.regularizacion ? buildRegularizacion(input.regularizacion) : '';

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<AEATRetencionesEntrada${ejercicio} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="AEATRetenciones${ejercicio}.xsd">`,
    '  <IdDoc>',
    '    <CodModelo>RET</CodModelo>',
    `    <Ejercicio>${ejercicio}</Ejercicio>`,
    '  </IdDoc>',
    '  <Retenedor>',
    `    <Nif>${escapeXML(input.nifEmpresa)}</Nif>`,
    `    <ApellidosNombre>${escapeXML(input.nombreEmpresa)}</ApellidosNombre>`,
    '    <Retenido>',
    `      <Nif>${escapeXML(input.nifTrabajador)}</Nif>`,
    `      <ApellidosNombre>${escapeXML(input.nombreTrabajador)}</ApellidosNombre>`,
    `      <Nacimiento>${input.anioNacimiento}</Nacimiento>`,
    input.residenciaCeutaMelilla ? '      <ResidenciaCeutaMelilla/>' : '',
    `      <SituacionFamiliar>${sitFam}</SituacionFamiliar>`,
    discPer ? `      <Discapacidad>${discPer}</Discapacidad>` : '',
    `      <SituacionLaboral>${situLab}</SituacionLaboral>`,
    descList,
    ascList,
    `      <RetribAnuales>${money(input.retribAnuales)}</RetribAnuales>`,
    reducciones,
    input.cotizaciones && input.cotizaciones > 0
      ? `      <Cotizaciones>${money(input.cotizaciones)}</Cotizaciones>`
      : '',
    input.pensionCompensatoria
      ? `      <PensionCompensatoria>${money(input.pensionCompensatoria)}</PensionCompensatoria>`
      : '',
    input.anualidadesHijos
      ? `      <AnualidadesHijos>${money(input.anualidadesHijos)}</AnualidadesHijos>`
      : '',
    input.rdtosObtenidosCeutaMelilla ? '      <RdtosObtenidosCeutaMelilla/>' : '',
    input.pagoPrestamosVivienda ? '      <PagoPrestamosVivienda/>' : '',
    regu,
    '    </Retenido>',
    '  </Retenedor>',
    `</AEATRetencionesEntrada${ejercicio}>`,
  ];

  return lines.filter((l) => l !== '').join('\n');
}

// ─── Situación familiar ─────────────────────────────────────────────────────
function buildSituacionFamiliar(input: IRPFInput): string {
  if (input.situacionFamiliar === 'Situacion2') {
    if (!input.nifConyuge) {
      throw new Error('NIF del cónyuge obligatorio para Situacion2');
    }
    return `<Situacion2><NifConyuge>${escapeXML(input.nifConyuge)}</NifConyuge></Situacion2>`;
  }
  return `<${input.situacionFamiliar}/>`;
}

// ─── Discapacidad (wrapper interno) ─────────────────────────────────────────
function buildDiscapacidadWrapper(d: Discapacidad): string {
  if (d.grado === 'Grado1') {
    return `<Grado1>${d.movilidadReducida ? '<MovilidadReducida/>' : ''}</Grado1>`;
  }
  return '<Grado2/>';
}

// ─── Situación laboral ──────────────────────────────────────────────────────
function buildSituacionLaboral(input: IRPFInput): string {
  switch (input.situacionLaboral) {
    case 'TrabajadorActivo':
      return `<TrabajadorActivo><Contrato>${input.tipoContrato ?? '1'}</Contrato>${
        input.movilidadGeografica ? '<MovilidadGeografica/>' : ''
      }</TrabajadorActivo>`;
    case 'Pensionista':
      return '<Pensionista/>';
    case 'Desempleado':
      return '<Desempleado/>';
    case 'OtraSituacion':
      return '<OtraSituacion/>';
  }
}

// ─── Descendientes / Ascendientes ───────────────────────────────────────────
function buildDescendiente(d: Descendiente): string {
  const parts: string[] = [`<Nacimiento>${d.anioNacimiento}</Nacimiento>`];
  if (d.anioAdopcion) parts.push(`<Adopcion>${d.anioAdopcion}</Adopcion>`);
  if (d.computadoEntero) parts.push('<ComputadoEntero/>');
  if (d.discapacidad) parts.push(`<Discapacidad>${buildDiscapacidadWrapper(d.discapacidad)}</Discapacidad>`);
  return `      <Descendiente>${parts.join('')}</Descendiente>`;
}

function buildAscendiente(a: Ascendiente): string {
  const parts: string[] = [
    `<Nacimiento>${a.anioNacimiento}</Nacimiento>`,
    `<Convivencia>${a.convivencia}</Convivencia>`,
  ];
  if (a.discapacidad) parts.push(`<Discapacidad>${buildDiscapacidadWrapper(a.discapacidad)}</Discapacidad>`);
  return `      <Ascendiente>${parts.join('')}</Ascendiente>`;
}

// ─── Reducciones ────────────────────────────────────────────────────────────
function buildReducciones(input: IRPFInput): string {
  if (!input.irregularidad1 && !input.irregularidad2) return '';
  const parts: string[] = [];
  if (input.irregularidad1)
    parts.push(`<Irregularidad1>${money(input.irregularidad1)}</Irregularidad1>`);
  if (input.irregularidad2)
    parts.push(`<Irregularidad2>${money(input.irregularidad2)}</Irregularidad2>`);
  return `      <Reducciones>${parts.join('')}</Reducciones>`;
}

// ─── Regularización ─────────────────────────────────────────────────────────
function buildRegularizacion(r: RegularizacionInput): string {
  const parts: string[] = [
    `<Causa>${r.causa}</Causa>`,
    `<RetribSatisfechas>${money(r.retribSatisfechas)}</RetribSatisfechas>`,
    `<RetencionPracticada>${money(r.retencionPracticada)}</RetencionPracticada>`,
    `<RetribAnualesIniciales>${money(r.retribAnualesIniciales)}</RetribAnualesIniciales>`,
    `<RetencionAnualInicial>${money(r.retencionAnualInicial)}</RetencionAnualInicial>`,
    `<BaseRetencion>${money(r.baseRetencion)}</BaseRetencion>`,
    `<TipoRetencion>${r.tipoRetencion}</TipoRetencion>`,
  ];
  if (r.residenciaInicialCeutaMelilla) parts.push('<ResidenciaInicialCeutaMelilla/>');
  if (r.minimoPersonalFamiliarInicial)
    parts.push(`<MinimoPersonalFamiliarInicial>${money(r.minimoPersonalFamiliarInicial)}</MinimoPersonalFamiliarInicial>`);
  if (r.minoracionPrestamosVivienda)
    parts.push(`<MinoracionPrestamosVivienda>${money(r.minoracionPrestamosVivienda)}</MinoracionPrestamosVivienda>`);
  return `      <Regularizacion>${parts.join('')}</Regularizacion>`;
}

// ─── Utils ──────────────────────────────────────────────────────────────────
function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function escapeXML(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
