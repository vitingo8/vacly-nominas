export type TgssMode = 'mock' | 'siltra'
export type AeatMode = 'mock' | 'soap' | 'file'
export type DehuMode = 'mock' | 'api'

export interface AdminIntegrationsConfig {
  enabled: boolean
  tgssMode: TgssMode
  tgssSiltraInputDir: string
  tgssSiltraOutputDir: string
  tgssSiltraExecutablePath: string
  tgssCertificateId?: string
  aeatMode: AeatMode
  dehuMode: DehuMode
  encryptionKey?: string
  cronSecret?: string
  storageBucket: string
}

export function getAdminConfig(): AdminIntegrationsConfig {
  return {
    enabled: process.env.ADMIN_INTEGRATIONS_ENABLED !== 'false',
    tgssMode: (process.env.TGSS_MODE as TgssMode) || 'mock',
    tgssSiltraInputDir: process.env.TGSS_SILTRA_INPUT_DIR || '',
    tgssSiltraOutputDir: process.env.TGSS_SILTRA_OUTPUT_DIR || '',
    tgssSiltraExecutablePath: process.env.TGSS_SILTRA_EXECUTABLE_PATH || '',
    tgssCertificateId: process.env.TGSS_CERTIFICATE_ID,
    aeatMode: (process.env.AEAT_MODE as AeatMode) || 'mock',
    dehuMode: (process.env.DEHU_MODE as DehuMode) || 'mock',
    encryptionKey: process.env.ADMIN_ENCRYPTION_KEY,
    cronSecret: process.env.CRON_SECRET,
    storageBucket: process.env.ADMIN_STORAGE_BUCKET || 'admin-integrations',
  }
}

export function isCronAuthorized(authHeader: string | null): boolean {
  const config = getAdminConfig()
  const cronSecret = config.cronSecret?.trim()
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }
  return authHeader === `Bearer ${cronSecret}`
}
