export type StoreTab = 'modulos' | 'soles' | 'agentes' | 'integraciones'

export const STORE_LOGOS_BASE =
  'https://niztpeedjtnvskscnwds.supabase.co/storage/v1/object/public/admin/logos'

export function storeModuleLogo(file: string): string {
  return `${STORE_LOGOS_BASE}/${file}`
}

/** Sube al reemplazar PNGs de paquetes Soles en Supabase. */
export const STORE_SOLES_LOGO_VERSION = '2'

export function storeSolesLogo(amount: number): string {
  return `${storeModuleLogo(`soles${amount}.png`)}?v=${STORE_SOLES_LOGO_VERSION}`
}

export interface StoreFilter {
  id: string
  label: string
}

/** Unidad de precio para sumar importes en el carrito. */
export type StorePriceUnit = 'per_seat_month' | 'month' | 'once' | 'included'

/** Vincula un item del Store con un derecho real de la empresa (tabla billing). */
export interface StoreEntitlement {
  /** module → columnas module_*; permission → permission_*; agent/integration → catálogo (sin backend aún) */
  type: 'module' | 'permission' | 'agent' | 'integration'
  key: string
}

/** Información ampliada que se muestra en el panel inferior de detalle. */
export interface StoreDetailFeature {
  label: string
  imageUrl?: string
}

export interface StoreIncludesSection {
  title: string
  imageUrl?: string
  description: string
}

export interface StoreItemDetails {
  longDescription: string
  features?: (string | StoreDetailFeature)[]
  includes?: (string | StoreDetailFeature)[]
  includesSection?: StoreIncludesSection
  requires?: string[]
  pricingModel?: string
}

function storeFeature(label: string, logoFile?: string): StoreDetailFeature {
  return logoFile ? { label, imageUrl: storeModuleLogo(logoFile) } : { label }
}

export interface StoreItem {
  id: string
  title: string
  description: string
  category: string
  icon: string
  iconBg: string
  /** Imagen del módulo (icono 3D, logo, etc.) en lugar del icono SVG */
  imageUrl?: string
  badge?: 'instalado' | 'nuevo' | 'popular' | 'pro'
  /** Texto de precio visible en el store, p. ej. "12 €/mes" */
  priceLabel: string
  priceNote?: string
  /** Importe numérico (IVA incl.) usado por el carrito */
  priceAmount?: number
  /** Cómo se cobra el importe */
  priceUnit?: StorePriceUnit
  /** Derecho real asociado para personalización por empresa */
  entitlement?: StoreEntitlement
  /** Contenido del panel de detalle */
  details?: StoreItemDetails
}

export const SOLES_PACK_AMOUNTS = [5, 50, 500, 1000, 5000] as const

export const SOLES_PRICE_BY_AMOUNT: Record<(typeof SOLES_PACK_AMOUNTS)[number], number> = {
  5: 4.99,
  50: 29,
  500: 199,
  1000: 249,
  5000: 599,
}

const SOLES_TAGLINE_BY_AMOUNT: Record<(typeof SOLES_PACK_AMOUNTS)[number], string> = {
  5: 'Para probar Vacly',
  50: 'Ideal para empezar',
  500: 'Para uso frecuente',
  1000: 'Mejor elección',
  5000: 'Mejor precio por Sol',
}

function formatSolesPackPrice(price: number): string {
  const formatted =
    price % 1 === 0
      ? price.toLocaleString('es-ES')
      : price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${formatted} €`
}

/** Paquetes de Soles del bucket `admin/logos`. */
export const SOLES_PACK_ITEMS: StoreItem[] = SOLES_PACK_AMOUNTS.map((amount) => {
  const price = SOLES_PRICE_BY_AMOUNT[amount]
  return {
    id: `soles-${amount}`,
    title: `Pack ${amount.toLocaleString('es-ES')} Soles`,
    description: SOLES_TAGLINE_BY_AMOUNT[amount],
    category: 'paquetes',
    icon: 'coins',
    iconBg: amount >= 1000 ? '#B45309' : '#C6A664',
    imageUrl: storeSolesLogo(amount),
    badge: amount === 1000 ? 'popular' : amount === 5000 ? 'pro' : undefined,
    priceLabel: formatSolesPackPrice(price),
    priceNote: 'pago único · IVA incl.',
    priceAmount: price,
    priceUnit: 'once',
    details: {
      longDescription:
        `Los Soles son la moneda interna de Vacly para consumir funciones de IA y procesamiento: ` +
        `consultas con agentes V.IA, extracción de documentos, OCR de facturas y automatizaciones. ` +
        `Este paquete abona ${amount.toLocaleString('es-ES')} Soles a tu monedero de empresa.`,
      features: [
        'Consultas con agentes V.IA y chat',
        'Extracción y OCR de documentos / facturas',
        'Automatizaciones y avisos proactivos',
        'Sin caducidad mientras la cuenta esté activa',
      ],
      pricingModel: 'Pago único. Los Soles se suman al monedero de la empresa.',
    },
  }
})

export const STORE_TABS: { id: StoreTab; label: string }[] = [
  { id: 'modulos', label: 'Módulos' },
  { id: 'soles', label: 'Soles' },
  { id: 'agentes', label: 'Agentes' },
  { id: 'integraciones', label: 'Integraciones' },
]

export const STORE_FILTERS: Record<StoreTab, StoreFilter[]> = {
  modulos: [{ id: 'todos', label: 'Todos' }],
  soles: [{ id: 'todos', label: 'Todos' }],
  agentes: [
    { id: 'todos', label: 'Todos' },
    { id: 'nominas', label: 'Nóminas' },
    { id: 'fiscal', label: 'Fiscal' },
    { id: 'soporte', label: 'Soporte' },
    { id: 'automatizacion', label: 'Automatización' },
  ],
  integraciones: [
    { id: 'todos', label: 'Todos' },
    { id: 'correo', label: 'Correo' },
    { id: 'erp', label: 'ERP' },
    { id: 'banca', label: 'Banca' },
    { id: 'pagos', label: 'Pagos' },
    { id: 'rrhh', label: 'RRHH' },
    { id: 'comunicacion', label: 'Comunicación' },
    { id: 'ia', label: 'IA' },
    { id: 'tgss', label: 'TGSS' },
    { id: 'firmas', label: 'Firmas' },
  ],
}

/** Agente V.IA del catálogo (sección 5.1 del catálogo de Vacly Store). */
interface AgentSeed {
  slug: string
  title: string
  description: string
  category: 'nominas' | 'fiscal' | 'soporte' | 'automatizacion'
  iconBg: string
  badge?: StoreItem['badge']
  price: number
  rol: string
  mcp: string
  tipo: string
  acciones: string
}

const AGENT_SEEDS: AgentSeed[] = [
  { slug: 'mi-dia', title: 'V.IA · Mi día', description: 'Resumen diario del empleado: fichajes, tareas y avisos.', category: 'soporte', iconBg: '#3B9EDE', price: 9, rol: 'Empleado', mcp: 'brain, hr', tipo: 'Informativo', acciones: 'Resumen e información contextual del día.' },
  { slug: 'convenio', title: 'V.IA · Convenio', description: 'Responde sobre tu convenio colectivo con citas a la fuente.', category: 'soporte', iconBg: '#1B2A41', price: 12, rol: 'RRHH', mcp: 'brain, docs-read', tipo: 'Informativo', acciones: 'Citas y consulta del convenio aplicable.' },
  { slug: 'fichaje', title: 'V.IA · Fichaje', description: 'Consulta y registra fichajes por chat.', category: 'automatizacion', iconBg: '#10B981', badge: 'popular', price: 12, rol: 'Empleado', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Consulta + acciones de fichaje.' },
  { slug: 'vacaciones', title: 'V.IA · Vacaciones', description: 'Solicita y consulta vacaciones de forma conversacional.', category: 'automatizacion', iconBg: '#3B9EDE', price: 12, rol: 'Empleado', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Solicitar vacaciones, ver saldo.' },
  { slug: 'nominas', title: 'V.IA · Nóminas', description: 'Consulta tus nóminas y resuelve dudas sobre conceptos.', category: 'nominas', iconBg: '#7C3AED', price: 15, rol: 'Empleado', mcp: 'brain, hr', tipo: 'Informativo', acciones: 'Consulta de nóminas propias.' },
  { slug: 'gastos', title: 'V.IA · Gastos', description: 'Sube tickets, clasifícalos y prepara su envío.', category: 'fiscal', iconBg: '#8B5CF6', badge: 'nuevo', price: 12, rol: 'Empleado', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Tickets, clasificación y envío de gastos.' },
  { slug: 'equipo', title: 'V.IA · Equipo', description: 'Vista del estado del equipo para managers.', category: 'soporte', iconBg: '#0EA5E9', price: 15, rol: 'Manager', mcp: 'brain, hr', tipo: 'Informativo', acciones: 'Estado y resumen del equipo.' },
  { slug: 'documentos', title: 'V.IA · Documentos', description: 'Consulta políticas internas y documentación de empresa.', category: 'soporte', iconBg: '#1B2A41', price: 12, rol: 'RRHH', mcp: 'brain, docs-read', tipo: 'Informativo', acciones: 'Búsqueda en políticas y documentos.' },
  { slug: 'inbox', title: 'V.IA · Inbox', description: 'Gestiona correo, calendario y envíos desde el chat.', category: 'automatizacion', iconBg: '#EF4444', badge: 'pro', price: 19, rol: 'Manager', mcp: 'inbox, brain, actions', tipo: 'Operativo', acciones: 'Email, calendario, enviar mensajes.' },
  { slug: 'ausencias', title: 'V.IA · Ausencias', description: 'Solicita bajas y permisos conversando.', category: 'automatizacion', iconBg: '#10B981', price: 12, rol: 'Empleado', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Solicitar bajas y permisos.' },
  { slug: 'validaciones', title: 'V.IA · Validaciones', description: 'Aprueba o rechaza solicitudes pendientes.', category: 'automatizacion', iconBg: '#3B9EDE', price: 15, rol: 'Manager', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Aprobar / rechazar validaciones.' },
  { slug: 'contratos', title: 'V.IA · Contratos', description: 'Resume contratos y hace seguimiento de cláusulas.', category: 'nominas', iconBg: '#7C3AED', price: 15, rol: 'RRHH', mcp: 'brain, docs-read, hr', tipo: 'Informativo', acciones: 'Resumen y seguimiento de contratos.' },
  { slug: 'nominas-admin', title: 'V.IA · Nóminas Admin', description: 'Genera nóminas, exporta SEPA y RED.', category: 'nominas', iconBg: '#1B2A41', badge: 'pro', price: 25, rol: 'RRHH', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Generar nómina, SEPA, RED.' },
  { slug: 'irpf', title: 'V.IA · IRPF', description: 'Calcula IRPF y prepara modelos AEAT.', category: 'fiscal', iconBg: '#F0806A', price: 19, rol: 'RRHH', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Cálculo IRPF y modelos.' },
  { slug: 'turnos', title: 'V.IA · Turnos', description: 'Consulta y cambia turnos del cuadrante.', category: 'automatizacion', iconBg: '#0EA5E9', price: 12, rol: 'Empleado', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Cambio de turno (swap), consulta.' },
  { slug: 'planificacion', title: 'V.IA · Planificación', description: 'Imputa horas y gestiona asignaciones.', category: 'automatizacion', iconBg: '#D97706', price: 15, rol: 'Manager', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Imputar horas, asignaciones.' },
  { slug: 'facturas', title: 'V.IA · Facturas', description: 'OCR y conciliación de facturas recibidas.', category: 'fiscal', iconBg: '#8B5CF6', price: 19, rol: 'Admin', mcp: 'brain, actions', tipo: 'Operativo', acciones: 'OCR y conciliación de facturas.' },
  { slug: 'informes', title: 'V.IA · Informes', description: 'Genera informes a medida sobre tus datos.', category: 'soporte', iconBg: '#3B9EDE', price: 19, rol: 'Manager', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Generación de informes.' },
  { slug: 'formacion', title: 'V.IA · Formación', description: 'Acompaña cursos y onboarding del equipo.', category: 'soporte', iconBg: '#10B981', price: 12, rol: 'Empleado', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Cursos y onboarding.' },
  { slug: 'configuracion', title: 'V.IA · Configuración', description: 'Ajusta parámetros de la empresa por chat.', category: 'soporte', iconBg: '#1B2A41', price: 15, rol: 'Admin', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Ajustes de empresa.' },
  { slug: 'notificaciones', title: 'V.IA · Notificaciones', description: 'Gestiona y marca notificaciones como leídas.', category: 'soporte', iconBg: '#EF4444', price: 9, rol: 'Empleado', mcp: 'brain, hr, actions', tipo: 'Operativo', acciones: 'Marcar notificaciones leídas.' },
]

const AGENT_ITEMS: StoreItem[] = AGENT_SEEDS.map((a) => ({
  id: `agente-${a.slug}`,
  title: a.title,
  description: a.description,
  category: a.category,
  icon: 'robot',
  iconBg: a.iconBg,
  badge: a.badge,
  priceLabel: `${a.price} €`,
  priceNote: '/mes · IVA incl.',
  priceAmount: a.price,
  priceUnit: 'month',
  entitlement: { type: 'agent', key: a.slug },
  details: {
    longDescription: `${a.description} Agente V.IA de tipo ${a.tipo.toLowerCase()} orientado al rol ${a.rol}.`,
    features: [
      `Rol objetivo: ${a.rol}`,
      `Tipo: ${a.tipo}`,
      `Acciones: ${a.acciones}`,
      `Conectores MCP: ${a.mcp}`,
    ],
    requires: ['V.IA Chat activo en la empresa'],
    pricingModel: 'Suscripción mensual por agente instalado en la empresa.',
  },
}))

/** Integración del catálogo (sección 4 del catálogo de Vacly Store). */
interface IntegrationSeed {
  id: string
  title: string
  description: string
  category: string
  icon: string
  iconBg: string
  badge?: StoreItem['badge']
  priceLabel: string
  priceNote?: string
  priceAmount?: number
  priceUnit?: StorePriceUnit
  longDescription: string
  capacidades: string[]
}

const INTEGRATION_SEEDS: IntegrationSeed[] = [
  { id: 'tgss-red', title: 'TGSS RED', description: 'Altas, bajas y comunicaciones con la Seguridad Social.', category: 'tgss', icon: 'link', iconBg: '#EF4444', badge: 'instalado', priceLabel: 'Incluido', priceNote: 'en tu plan actual', priceAmount: 0, priceUnit: 'included', longDescription: 'Conexión con el Sistema RED de la TGSS para gestionar la afiliación de tu plantilla.', capacidades: ['Altas, bajas y variaciones', 'Comunicaciones con la Seguridad Social', 'Autorizaciones RED'] },
  { id: 'google-workspace', title: 'Google Workspace', description: 'Gmail, Calendar, Contactos y Drive conectados a Vacly.', category: 'correo', icon: 'link', iconBg: '#4285F4', priceLabel: 'Gratis', priceNote: 'conexión OAuth', priceAmount: 0, priceUnit: 'month', longDescription: 'Integra Gmail, Calendar, Contactos, Tareas y Drive vía MCP con OAuth y scopes mínimos.', capacidades: ['Gmail y Calendar', 'Contactos y Tareas', 'Drive (documentos)'] },
  { id: 'microsoft-365', title: 'Microsoft 365', description: 'Outlook, Calendar, Contactos y OneDrive.', category: 'correo', icon: 'link', iconBg: '#0078D4', priceLabel: 'Gratis', priceNote: 'conexión OAuth', priceAmount: 0, priceUnit: 'month', longDescription: 'Conecta Outlook, Calendar, Contactos y OneDrive vía MCP con OAuth.', capacidades: ['Outlook y Calendar', 'Contactos', 'OneDrive'] },
  { id: 'whatsapp-business', title: 'WhatsApp Business', description: 'Fichaje, notificaciones y menús interactivos por WhatsApp.', category: 'comunicacion', icon: 'link', iconBg: '#25D366', badge: 'popular', priceLabel: '9 €', priceNote: '/mes', priceAmount: 9, priceUnit: 'month', longDescription: 'Fichaje conversacional, notificaciones de RRHH y menús interactivos sobre WhatsApp Business API.', capacidades: ['Fichaje y geocerca', 'Notificaciones RRHH', 'Menús interactivos'] },
  { id: 'stripe', title: 'Stripe', description: 'Suscripciones, facturas y pools de licencias.', category: 'pagos', icon: 'bank', iconBg: '#635BFF', badge: 'instalado', priceLabel: 'Incluido', priceNote: 'facturación Vacly', priceAmount: 0, priceUnit: 'included', longDescription: 'Motor de facturación nativo de Vacly: suscripciones, facturas y gestión de licencias.', capacidades: ['Suscripciones y módulos', 'Facturas y portal de cliente', 'Pools de licencias'] },
  { id: 'holded', title: 'Holded', description: 'Sincroniza contactos, facturas y tesorería.', category: 'erp', icon: 'link', iconBg: '#0050E6', badge: 'nuevo', priceLabel: '12 €', priceNote: '/mes', priceAmount: 12, priceUnit: 'month', longDescription: 'Sincronización de contactos, facturas, productos y tesorería con Holded vía MCP.', capacidades: ['Contactos y facturas', 'Productos', 'Tesorería'] },
  { id: 'sage', title: 'Sage', description: 'Exportación contable y plan contable.', category: 'erp', icon: 'link', iconBg: '#00DC06', priceLabel: '12 €', priceNote: '/mes', priceAmount: 12, priceUnit: 'month', longDescription: 'Exportación contable y plan contable hacia Sage vía MCP.', capacidades: ['Export contable', 'Plan contable', 'Asientos'] },
  { id: 'a3', title: 'A3 / Wolters Kluwer', description: 'Exportación de nóminas y contabilidad.', category: 'erp', icon: 'link', iconBg: '#F59E0B', priceLabel: '12 €', priceNote: '/mes', priceAmount: 12, priceUnit: 'month', longDescription: 'Importación y exportación de datos de nómina y contabilidad con A3 / Wolters Kluwer.', capacidades: ['Export nóminas', 'Export contabilidad', 'Sincronización de datos'] },
  { id: 'santander', title: 'Banco Santander', description: 'Conciliación bancaria y domiciliaciones de nómina.', category: 'banca', icon: 'bank', iconBg: '#EC0000', priceLabel: '9 €', priceNote: '/mes', priceAmount: 9, priceUnit: 'month', longDescription: 'Conciliación bancaria y domiciliaciones de nómina con Banco Santander.', capacidades: ['Conciliación bancaria', 'Domiciliaciones', 'Extractos'] },
  { id: 'bbva', title: 'BBVA Empresas', description: 'Pagos masivos y extractos para tesorería.', category: 'banca', icon: 'bank', iconBg: '#004481', priceLabel: '9 €', priceNote: '/mes', priceAmount: 9, priceUnit: 'month', longDescription: 'Pagos masivos y extractos para la tesorería de nóminas con BBVA Empresas.', capacidades: ['Pagos masivos', 'Extractos', 'Tesorería'] },
  { id: 'gocardless', title: 'GoCardless', description: 'Domiciliaciones SEPA automatizadas.', category: 'pagos', icon: 'bank', iconBg: '#F1F252', priceLabel: '7 €', priceNote: '/mes', priceAmount: 7, priceUnit: 'month', longDescription: 'Domiciliaciones SEPA automatizadas vía GoCardless.', capacidades: ['Domiciliaciones SEPA', 'Cobros recurrentes', 'Conciliación'] },
  { id: 'qonto', title: 'Qonto', description: 'Conciliación bancaria y movimientos.', category: 'banca', icon: 'bank', iconBg: '#1D1D1B', priceLabel: '9 €', priceNote: '/mes', priceAmount: 9, priceUnit: 'month', longDescription: 'Conciliación bancaria y movimientos de cuenta con Qonto.', capacidades: ['Movimientos', 'Conciliación', 'Tesorería'] },
  { id: 'fnmt', title: 'FNMT / @firma', description: 'Firma electrónica de contratos y documentos.', category: 'firmas', icon: 'pen', iconBg: '#1B2A41', priceLabel: '5 €', priceNote: '/mes', priceAmount: 5, priceUnit: 'month', longDescription: 'Firma electrónica de contratos y documentos laborales con certificado FNMT / @firma.', capacidades: ['Firma de contratos', 'Documentos laborales', 'Validez legal'] },
  { id: 'payfit', title: 'Payfit', description: 'Sincroniza nóminas y empleados.', category: 'rrhh', icon: 'link', iconBg: '#0F6FFF', priceLabel: '12 €', priceNote: '/mes', priceAmount: 12, priceUnit: 'month', longDescription: 'Sincronización de nóminas y empleados con Payfit.', capacidades: ['Sync nóminas', 'Sync empleados', 'Datos laborales'] },
  { id: 'factorial', title: 'Factorial', description: 'Importa empleados y ausencias.', category: 'rrhh', icon: 'link', iconBg: '#FF6B57', priceLabel: '12 €', priceNote: '/mes', priceAmount: 12, priceUnit: 'month', longDescription: 'Importación de empleados y ausencias desde Factorial.', capacidades: ['Import empleados', 'Ausencias', 'HRIS sync'] },
  { id: 'slack', title: 'Slack', description: 'Notificaciones de RRHH y comandos.', category: 'comunicacion', icon: 'link', iconBg: '#4A154B', priceLabel: '5 €', priceNote: '/mes', priceAmount: 5, priceUnit: 'month', longDescription: 'Notificaciones de RRHH y comandos desde Slack.', capacidades: ['Notificaciones RRHH', 'Comandos', 'Alertas'] },
  { id: 'teams', title: 'Microsoft Teams', description: 'Notificaciones y bot de fichaje.', category: 'comunicacion', icon: 'link', iconBg: '#6264A7', priceLabel: '5 €', priceNote: '/mes', priceAmount: 5, priceUnit: 'month', longDescription: 'Notificaciones y bot de fichaje dentro de Microsoft Teams.', capacidades: ['Notificaciones', 'Bot de fichaje', 'Alertas'] },
  { id: 'anthropic', title: 'Claude (Anthropic)', description: 'IA para extracción de PDF, docs y nóminas.', category: 'ia', icon: 'sparkles', iconBg: '#D97706', badge: 'instalado', priceLabel: 'Incluido', priceNote: 'motor IA Vacly', priceAmount: 0, priceUnit: 'included', longDescription: 'Modelo Claude de Anthropic para extracción de PDF, documentos y nóminas.', capacidades: ['Extracción de PDF', 'Análisis de documentos', 'Procesado de nóminas'] },
  { id: 'elevenlabs', title: 'ElevenLabs', description: 'Voz conversacional para el asistente.', category: 'ia', icon: 'sparkles', iconBg: '#1B2A41', badge: 'nuevo', priceLabel: '12 €', priceNote: '/mes', priceAmount: 12, priceUnit: 'month', longDescription: 'Voz conversacional para el asistente V.IA con ElevenLabs.', capacidades: ['Voz conversacional', 'Asistente por voz', 'TTS'] },
  { id: 'zapier', title: 'Zapier', description: 'Triggers y acciones genéricas con miles de apps.', category: 'comunicacion', icon: 'link', iconBg: '#FF4F00', priceLabel: '9 €', priceNote: '/mes', priceAmount: 9, priceUnit: 'month', longDescription: 'Automatizaciones genéricas con triggers y acciones hacia miles de apps vía Zapier.', capacidades: ['Triggers', 'Acciones', 'Automatizaciones'] },
]

const INTEGRATION_ITEMS: StoreItem[] = INTEGRATION_SEEDS.map((i) => ({
  id: i.id,
  title: i.title,
  description: i.description,
  category: i.category,
  icon: i.icon,
  iconBg: i.iconBg,
  badge: i.badge,
  priceLabel: i.priceLabel,
  priceNote: i.priceNote,
  priceAmount: i.priceAmount,
  priceUnit: i.priceUnit,
  entitlement: { type: 'integration', key: i.id },
  details: {
    longDescription: i.longDescription,
    features: i.capacidades,
    requires: ['Conexión segura vía MCP con OAuth y auditoría'],
    pricingModel:
      i.priceUnit === 'included'
        ? 'Incluido en tu plan actual.'
        : i.priceAmount === 0
          ? 'Conexión gratuita vía OAuth.'
          : 'Suscripción mensual por conexión activa.',
  },
}))

export const STORE_ITEMS: Record<StoreTab, StoreItem[]> = {
  modulos: [
    {
      id: 'mod-tiempo',
      title: 'Tiempo',
      description:
        'Fichaje, vacaciones, ausencias, organigrama, empleados, control horario, turnos e informes.',
      category: 'tiempo',
      icon: 'clock',
      iconBg: '#3B9EDE',
      imageUrl: storeModuleLogo('tiempo.png'),
      badge: 'instalado',
      priceLabel: '11,89 €',
      priceNote: 'por empleado/mes · + IVA 21% (hasta 5 empleados)',
      priceAmount: 11.89,
      priceUnit: 'per_seat_month',
      entitlement: { type: 'module', key: 'tiempo' },
      details: {
        longDescription:
          'Gestión completa del tiempo de tu equipo: fichaje web y móvil, control horario, turnos, ' +
          'vacaciones, ausencias y un potente módulo de informes. Incluye organigrama, departamentos, ' +
          'gestión de empleados y notificaciones.',
        features: [
          storeFeature('Fichaje Geolocalizado', 'location.png'),
          storeFeature('Fichaje Whatsapp', 'whatsapp.png'),
          storeFeature('Vacaciones', 'vacaciones.png'),
          storeFeature('Ausencias', 'ausencias.png'),
          storeFeature('Turnos', 'calendar.png'),
          storeFeature('Validaciones', 'proyectos.png'),
          storeFeature('Organigrama', 'proyectos.png'),
          storeFeature('Departamentos', 'departamento.png'),
          storeFeature('Empleados', 'empleados.png'),
          storeFeature('Notificaciones', 'notificaciones.png'),
          storeFeature('Control Horario', 'control_horario.png'),
        ],
        includesSection: {
          title: 'Informes Incluidos',
          imageUrl: storeModuleLogo('chart.png'),
          description:
            'Ocho grupos de informes para analizar el tiempo de tu equipo: Resumen ejecutivo, Fichajes, ' +
            'Horas trabajadas, Planificado vs Real, Capacidad, Ausencias, Productividad y Alertas.',
        },
        pricingModel:
          'Suscripción por empleado/mes: 11,89 € (hasta 5); 10,27 € (6–25); 8,89 € (26+). Precios base + IVA 21% salvo tramo 26+.',
      },
    },
    {
      id: 'mod-proyectos',
      title: 'Proyectos',
      description:
        'Programas, asignaciones, documentos por proyecto y gestor documental centralizado.',
      category: 'proyectos',
      icon: 'cube',
      iconBg: '#D97706',
      imageUrl: storeModuleLogo('proyecto.png'),
      priceLabel: '9,90 €',
      priceNote: '/mes · IVA incl.',
      priceAmount: 9.9,
      priceUnit: 'month',
      entitlement: { type: 'module', key: 'proyectos' },
      details: {
        longDescription:
          'Organiza el trabajo por proyectos y programas, con asignaciones, imputación de horas y un ' +
          'gestor documental centralizado por proyecto.',
        features: [
          'Programas y proyectos',
          'Planificación y asignaciones',
          'Documentos por proyecto',
          'Gestor documental centralizado',
          'Imputación de horas a proyectos',
        ],
        includes: [
          'Informes: Resumen',
          'Estado',
          'Asignaciones',
          'Horas por proyecto',
          'Avance',
          'Rentabilidad',
          'Carga futura',
          'Alertas',
        ],
        pricingModel: 'Suscripción mensual de precio fijo.',
      },
    },
    {
      id: 'mod-laboral',
      title: 'Laboral',
      description:
        'Nóminas, contratos, conceptos, generación de nóminas, simuladores, SEPA, RED e informes de personas.',
      category: 'laboral',
      icon: 'briefcase',
      iconBg: '#7C3AED',
      imageUrl: storeModuleLogo('laboral.png'),
      badge: 'instalado',
      priceLabel: '3,50 €',
      priceNote: 'por empleado/mes · IVA incl. (hasta 25 empleados)',
      priceAmount: 3.5,
      priceUnit: 'per_seat_month',
      entitlement: { type: 'module', key: 'laboral' },
      details: {
        longDescription:
          'El motor laboral completo: nóminas, contratos, conceptos salariales, generación de nóminas ' +
          '(wizard y clásico), simuladores de alta y despido, exportaciones SEPA y RED, modelos AEAT e ' +
          'informes de personas. Motor compartido @vacly/payroll-core.',
        features: [
          'Mis Nóminas y subir nóminas PDF (extracción IA)',
          'Ver nóminas históricas',
          'Generación de nóminas (wizard + clásico)',
          'Conceptos salariales y contratos',
          'Simulador de alta y de despido / finiquito',
          'Exportación SEPA y RED / TGSS',
          'Modelos 111 y 190 AEAT, cálculo IRPF / XML',
          'Informes de Personas',
        ],
        includes: [
          'Informes: Resumen',
          'Plantilla',
          'Roles y estructura',
          'Altas y bajas',
          'Desempeño',
          'Formación',
          'Documentación',
          'Alertas',
        ],
        pricingModel:
          'Suscripción por empleado/mes: 3,50 € hasta 25 empleados; 2,50 € a partir de 26.',
      },
    },
    {
      id: 'mod-fiscal',
      title: 'Fiscal',
      description:
        'Mis gastos, control de gastos, facturas recibidas e informes financieros de la empresa.',
      category: 'fiscal',
      icon: 'trending',
      iconBg: '#F0806A',
      imageUrl: storeModuleLogo('Fiscal.png'),
      priceLabel: '9,90 €',
      priceNote: '/mes · IVA incl.',
      priceAmount: 9.9,
      priceUnit: 'month',
      entitlement: { type: 'module', key: 'finanzas' },
      details: {
        longDescription:
          'Controla las finanzas de la empresa: gastos del empleado, control de gastos para manager/gestoría, ' +
          'facturas recibidas e informes financieros, además de Mi Plan / facturación.',
        features: [
          'Mis Gastos (empleado)',
          'Control de Gastos (manager / gestoría)',
          'Facturas recibidas',
          'Mi Plan / facturación Stripe',
        ],
        includes: [
          'Informes: Resumen',
          'Costes',
          'Coste de personal',
          'Ingresos',
          'Márgenes',
          'Centros de coste',
          'Previsión',
          'Alertas',
        ],
        pricingModel: 'Suscripción mensual de precio fijo.',
      },
    },
    {
      id: 'mod-administracion',
      title: 'Administración',
      description:
        'TGSS altas, bajas y variaciones, trámites, certificados, autorizaciones RED y notificaciones electrónicas.',
      category: 'administracion',
      icon: 'shield-check',
      iconBg: '#1B2A41',
      imageUrl: storeModuleLogo('notificaciones.png'),
      badge: 'instalado',
      priceLabel: 'Incluido',
      priceNote: 'con Módulo Laboral · gestorías',
      priceAmount: 0,
      priceUnit: 'included',
      entitlement: { type: 'module', key: 'laboral' },
      details: {
        longDescription:
          'Trámites con la Administración: altas, bajas y variaciones en TGSS, gestión de certificados, ' +
          'autorizaciones RED y notificaciones electrónicas. Incluido con el Módulo Laboral.',
        features: [
          'TGSS: altas, bajas y variaciones',
          'Trámites y autorizaciones RED',
          'Gestión de certificados',
          'Notificaciones electrónicas',
        ],
        pricingModel: 'Incluido con el Módulo Laboral (gestorías).',
      },
    },
  ],
  soles: SOLES_PACK_ITEMS,
  agentes: AGENT_ITEMS,
  integraciones: INTEGRATION_ITEMS,
}

export const COLLECTION_SIDEBAR = [
  {
    id: 'modulos',
    title: 'Módulos activos',
    description: 'Funcionalidades instaladas en tu cuenta',
    count: 3,
  },
  {
    id: 'soles',
    title: 'Balance Soles',
    description: 'Créditos disponibles para IA y procesamiento',
    count: 240,
  },
  {
    id: 'agentes',
    title: 'Agentes',
    description: 'Asistentes inteligentes configurados',
    count: 1,
  },
  {
    id: 'integraciones',
    title: 'Integraciones',
    description: 'Conexiones activas con terceros',
    count: 2,
  },
] as const
