export type NotificationEnvironment = 'sandbox' | 'production'

export interface NotificationEndpoints {
  aeatConsulta: string
  aeatAcceso: string
  aeatAutorizados: string
  tgssWscn: string
  dehuLema: string
}

const AEAT_SANDBOX = {
  aeatConsulta: 'https://prewww1.aeat.es/wlpl/GNNO-JDIT/sede/descargas/ConsultaV1SOAP',
  aeatAcceso: 'https://prewww1.aeat.es/wlpl/GNNO-JDIT/sede/descargas/AccesoV1SOAP',
  aeatAutorizados: 'https://prewww1.aeat.es/wlpl/GNNO-JDIT/sede/descargas/AutorizadosV1SOAP',
} as const

const AEAT_PRODUCTION = {
  aeatConsulta: 'https://www1.agenciatributaria.gob.es/wlpl/GNNO-JDIT/sede/descargas/ConsultaV1SOAP',
  aeatAcceso: 'https://www1.agenciatributaria.gob.es/wlpl/GNNO-JDIT/sede/descargas/AccesoV1SOAP',
  aeatAutorizados: 'https://www1.agenciatributaria.gob.es/wlpl/GNNO-JDIT/sede/descargas/AutorizadosV1SOAP',
} as const

const TGSS_SANDBOX = 'https://ws.seg-social.gob.es/INFRWSCN_Pruebas/WSCNPruebasService'
const TGSS_PRODUCTION = 'https://ws.seg-social.gob.es/INFRWSCN/WSCNService'

const DEHU_PRODUCTION = 'https://dehuws.redsara.es/ws/v2/lema'
const DEHU_SANDBOX = process.env.DEHU_LEMA_SANDBOX_ENDPOINT || DEHU_PRODUCTION

export interface NotificationsConfig {
  enabled: boolean
  environment: NotificationEnvironment
  endpoints: NotificationEndpoints
  aeatEnabled: boolean
  tgssEnabled: boolean
  dehuEnabled: boolean
  syncLookbackDays: number
}

export function getNotificationsConfig(): NotificationsConfig {
  const environment: NotificationEnvironment =
    process.env.ADMIN_NOTIFICATIONS_ENV === 'sandbox' ? 'sandbox' : 'production'

  const aeatBase = environment === 'sandbox' ? AEAT_SANDBOX : AEAT_PRODUCTION

  return {
    enabled: process.env.ADMIN_NOTIFICATIONS_ENABLED !== 'false',
    environment,
    endpoints: {
      ...aeatBase,
      tgssWscn:
        process.env.TGSS_WSCN_ENDPOINT ||
        (environment === 'sandbox' ? TGSS_SANDBOX : TGSS_PRODUCTION),
      dehuLema: process.env.DEHU_LEMA_ENDPOINT || (environment === 'sandbox' ? DEHU_SANDBOX : DEHU_PRODUCTION),
    },
    aeatEnabled: process.env.AEAT_NOTIFICATIONS_ENABLED !== 'false',
    tgssEnabled: process.env.TGSS_WSCN_ENABLED !== 'false',
    dehuEnabled: process.env.DEHU_LEMA_ENABLED !== 'false',
    syncLookbackDays: Number(process.env.ADMIN_NOTIFICATIONS_LOOKBACK_DAYS || 90),
  }
}
