// ============================================================================
// IRPF — Tipos TypeScript para el web service oficial de la AEAT
// ----------------------------------------------------------------------------
// Esquema basado en AEATRetenciones2026.xsd.
// Endpoint PROD: https://www2.agenciatributaria.gob.es/wlpl/PRET-R200/mc
// Endpoint TEST: https://prewww2.aeat.es/wlpl/PRET-R200/mc
// (Portado desde vacly-app/lib/irpf para integrar la retención real en el motor)
// ============================================================================

export type SituacionFamiliar = 'Situacion1' | 'Situacion2' | 'Situacion3';
// Situacion1 = Monoparental (al menos 1 hijo en custodia).
// Situacion2 = Casado, cónyuge sin rentas > 1.500 €/año (NIF cónyuge obligatorio).
// Situacion3 = Resto de situaciones (default).

export type TipoContratoIRPF = '1' | '2' | '3';
// '1' = GENERAL (indefinido normal).
// '2' = INFERIORAÑO (temporal < 1 año, mínimo IRPF 2%). Incluye artistas desde 2023.
// '3' = ESPECIAL (relaciones especiales, mínimo IRPF 15%).

export type GradoDiscapacidad = 'Grado1' | 'Grado2';
// Grado1 = 33% a 65%.
// Grado2 = >= 65%.

export interface Discapacidad {
  grado: GradoDiscapacidad;
  movilidadReducida?: boolean; // sólo aplicable si Grado1
}

export interface Descendiente {
  anioNacimiento: number;     // AÑODES (ej: 2015)
  anioAdopcion?: number;      // AÑOADOP — si adopción/acogimiento reciente
  computadoEntero: boolean;   // true = custodia total, false = compartida (0,5)
  discapacidad?: Discapacidad;
}

export interface Ascendiente {
  anioNacimiento: number;     // AÑOAS (ej: 1950)
  convivencia: number;        // Nº personas con quien convive (1-9). 1 = sólo contigo
  discapacidad?: Discapacidad;
}

export interface RegularizacionInput {
  causa: number;                        // 1-11
  retribSatisfechas: number;            // PERCIBIDO
  retencionPracticada: number;          // RETENIDO
  retribAnualesIniciales: number;       // RETRIBA
  retencionAnualInicial: number;        // IMPORTEA
  baseRetencion: number;                // BASEA
  tipoRetencion: number;                // TIPOA
  residenciaInicialCeutaMelilla?: boolean;
  minimoPersonalFamiliarInicial?: number;
  minoracionPrestamosVivienda?: number;
}

export type SituacionLaboral =
  | 'TrabajadorActivo'
  | 'Pensionista'
  | 'Desempleado'
  | 'OtraSituacion';

// ─────────────────────────────────────────────────────────────────────────────
// INPUT principal — equivalente al Modelo 145
// ─────────────────────────────────────────────────────────────────────────────
export interface IRPFInput {
  // Retenedor (empresa)
  nifEmpresa: string;
  nombreEmpresa: string;

  // Retenido (trabajador)
  nifTrabajador: string;
  nombreTrabajador: string;
  anioNacimiento: number;

  // Situación familiar
  situacionFamiliar: SituacionFamiliar;
  nifConyuge?: string;          // obligatorio si Situacion2

  // Residencia
  residenciaCeutaMelilla?: boolean;
  rdtosObtenidosCeutaMelilla?: boolean;

  // Discapacidad del contribuyente
  discapacidad?: Discapacidad;

  // Situación laboral
  situacionLaboral: SituacionLaboral;
  tipoContrato?: TipoContratoIRPF;   // obligatorio si TrabajadorActivo
  movilidadGeografica?: boolean; // +2.000 € gastos movilidad

  // Familia
  descendientes?: Descendiente[]; // máx 16
  ascendientes?: Ascendiente[];   // máx 6

  // Datos económicos ANUALES
  retribAnuales: number;         // salario bruto anual (dinerario + especie)
  irregularidad1?: number;       // reducciones art. 18.2 LIRPF
  irregularidad2?: number;       // reducciones art. 18.3 y DD.TT. LIRPF
  cotizaciones?: number;         // cuota SS trabajador anual
  pensionCompensatoria?: number; // pensión cónyuge fijada judicialmente
  anualidadesHijos?: number;     // anualidades hijos art. 7.k LIRPF
  pagoPrestamosVivienda?: boolean;

  // Regularización mid-year (opcional)
  regularizacion?: RegularizacionInput;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT — resultado devuelto por la AEAT ya parseado
// ─────────────────────────────────────────────────────────────────────────────
export interface IRPFOutput {
  tipoRetencion: number;          // % IRPF
  importeAnualRetenciones: number; // € anuales de retención
  baseRetencion: number;          // base sobre la que se aplica el tipo

  gastos: {
    general: number;
    movilidadGeografica: number;
    discapacidadActivos: number;
    total: number;
    gastosTotales: number;
  };

  rdtoNeto: number;
  rdtoNetoReducido: number;
  minoracionPrestamo: number;

  minimoPersonalFamiliar: {
    minimoContribuyente: { general: number; edad: number; asistencia: number; total: number };
    minimoDescendientes: { general: number; cuidadoHijos: number; total: number };
    minimoAscendientes: { edad: number; asistencia: number; total: number };
    minimoDiscapacidad: {
      contribuyente: { discapacidad: number; asistencia: number; total: number };
      descAsc: {
        discDesc: number;
        asisDesc: number;
        discAsc: number;
        asisAsc: number;
        total: number;
      };
      total: number;
    };
    total: number;
  };

  reduccion: {
    rdtosTrabajo: number;
    reduccionMas2: number;
    pensionista: number;
  };

  descendientes: {
    hijo1: string;
    hijo2: string;
    hijo3: string;
    cuartoYSucesivos: { total: number; porEntero: number };
    menores3: { total: number; porEntero: number };
    resto: { total: number; porEntero: number };
  };
}

export interface IRPFError {
  codigo: string;
  descripcion: string;
}

export type IRPFResult =
  | { ok: true; data: IRPFOutput; xmlInput: string; xmlOutput: string }
  | { ok: false; errors: IRPFError[]; xmlInput?: string; xmlOutput?: string };
