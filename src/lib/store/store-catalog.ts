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
}

const SOLES_PACK_AMOUNTS = [5, 50, 500, 1000, 5000] as const

/** Paquetes de Soles del bucket `admin/logos`. */
export const SOLES_PACK_ITEMS: StoreItem[] = SOLES_PACK_AMOUNTS.map((amount) => {
  return {
    id: `soles-${amount}`,
    title: `Pack ${amount.toLocaleString('es-ES')} Soles`,
    description:
      amount <= 50
        ? 'Recarga rápida para probar funciones premium y consultas con IA.'
        : amount <= 500
          ? 'Créditos para procesamiento de documentos, OCR y automatizaciones.'
          : 'Gran volumen de Soles con mejor precio por unidad para equipos exigentes.',
    category: 'paquetes',
    icon: 'coins',
    iconBg: amount >= 1000 ? '#B45309' : '#C6A664',
    imageUrl: storeSolesLogo(amount),
    badge: amount === 500 ? 'popular' : amount === 5000 ? 'pro' : undefined,
    priceLabel:
      amount === 5
        ? '1 €'
        : amount === 50
          ? '5 €'
          : amount === 500
            ? '39 €'
            : amount === 1000
              ? '69 €'
              : '299 €',
    priceNote: 'pago único · IVA incl.',
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
    { id: 'bancos', label: 'Bancos' },
    { id: 'erp', label: 'ERP' },
    { id: 'tgss', label: 'TGSS' },
    { id: 'firmas', label: 'Firmas' },
  ],
}

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
      priceNote: 'por empleado/mes · IVA incl. (hasta 25 empleados)',
    },
    {
      id: 'mod-proyectos',
      title: 'Proyectos',
      description:
        'Programas, asignaciones, documentos por proyecto y gestor documental centralizado.',
      category: 'proyectos',
      icon: 'cube',
      iconBg: '#D97706',
      imageUrl: storeModuleLogo('proyectos.png'),
      priceLabel: '9,90 €',
      priceNote: '/mes · IVA incl.',
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
    },
  ],
  soles: SOLES_PACK_ITEMS,
  agentes: [
    {
      id: 'agente-nominas',
      title: 'Agente de nóminas',
      description: 'Detecta incoherencias, sugiere conceptos y prepara borradores.',
      category: 'nominas',
      icon: 'robot',
      iconBg: '#3B9EDE',
      badge: 'pro',
      priceLabel: '19 €',
      priceNote: '/mes · IVA incl.',
    },
    {
      id: 'agente-fiscal',
      title: 'Agente fiscal',
      description: 'Responde dudas de IRPF, retenciones y obligaciones periódicas.',
      category: 'fiscal',
      icon: 'robot',
      iconBg: '#1B2A41',
      priceLabel: '15 €',
      priceNote: '/mes · IVA incl.',
    },
    {
      id: 'agente-tgss',
      title: 'Agente TGSS',
      description: 'Interpreta notificaciones y propone acciones de cumplimiento.',
      category: 'automatizacion',
      icon: 'robot',
      iconBg: '#EF4444',
      badge: 'nuevo',
      priceLabel: '25 €',
      priceNote: '/mes · IVA incl.',
    },
    {
      id: 'agente-onboarding',
      title: 'Agente de altas',
      description: 'Guía el alta de empleados y la documentación obligatoria.',
      category: 'soporte',
      icon: 'robot',
      iconBg: '#10B981',
      priceLabel: '12 €',
      priceNote: '/mes · IVA incl.',
    },
    {
      id: 'agente-gastos',
      title: 'Agente de gastos',
      description: 'Clasifica tickets y detecta duplicados o gastos fuera de política.',
      category: 'automatizacion',
      icon: 'robot',
      iconBg: '#8B5CF6',
      badge: 'popular',
      priceLabel: '12 €',
      priceNote: '/mes · IVA incl.',
    },
  ],
  integraciones: [
    {
      id: 'tgss-red',
      title: 'TGSS RED',
      description: 'Altas, bajas y comunicaciones con la Seguridad Social.',
      category: 'tgss',
      icon: 'link',
      iconBg: '#EF4444',
      badge: 'instalado',
      priceLabel: 'Incluido',
      priceNote: 'en tu plan actual',
    },
    {
      id: 'holded',
      title: 'Holded',
      description: 'Sincroniza empleados, nóminas y asientos contables.',
      category: 'erp',
      icon: 'link',
      iconBg: '#3B9EDE',
      priceLabel: 'Gratis',
      priceNote: 'conexión básica',
    },
    {
      id: 'santander',
      title: 'Banco Santander',
      description: 'Conciliación bancaria y domiciliaciones de nómina.',
      category: 'bancos',
      icon: 'bank',
      iconBg: '#EC0000',
      priceLabel: '9 €',
      priceNote: '/mes',
    },
    {
      id: 'fnmt',
      title: 'FNMT / @firma',
      description: 'Firma electrónica de contratos y documentos laborales.',
      category: 'firmas',
      icon: 'pen',
      iconBg: '#1B2A41',
      priceLabel: '5 €',
      priceNote: '/mes',
    },
    {
      id: 'a3',
      title: 'A3 Software',
      description: 'Importación y exportación de datos de nómina y RRHH.',
      category: 'erp',
      icon: 'link',
      iconBg: '#F59E0B',
      badge: 'nuevo',
      priceLabel: '12 €',
      priceNote: '/mes',
    },
    {
      id: 'bbva',
      title: 'BBVA Empresas',
      description: 'Pagos masivos y extractos para tesorería de nóminas.',
      category: 'bancos',
      icon: 'bank',
      iconBg: '#004481',
      priceLabel: '9 €',
      priceNote: '/mes',
    },
  ],
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
