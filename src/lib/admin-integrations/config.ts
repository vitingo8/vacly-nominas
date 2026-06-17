export type TgssMode = 'siltra'
export type AeatMode = 'soap' | 'file'
export type DehuMode = 'api'

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
    tgssMode: 'siltra',
    tgssSiltraInputDir: process.env.TGSS_SILTRA_INPUT_DIR || '',
    tgssSiltraOutputDir: process.env.TGSS_SILTRA_OUTPUT_DIR || '',
    tgssSiltraExecutablePath: process.env.TGSS_SILTRA_EXECUTABLE_PATH || '',
    tgssCertificateId: process.env.TGSS_CERTIFICATE_ID,
    aeatMode: (process.env.AEAT_MODE as AeatMode) || 'soap',
    dehuMode: 'api',
    encryptionKey: process.env.ADMIN_ENCRYPTION_KEY,
    cronSecret: process.env.CRON_SECRET,
    storageBucket: process.env.ADMIN_STORAGE_BUCKET || 'admin-integrations',
  }
}

export function assertSiltraConfig(): void {
  const config = getAdminConfig()
  if (!config.tgssSiltraInputDir.trim()) {
    throw new Error('TGSS_SILTRA_INPUT_DIR es obligatorio (carpeta de entrada de SILTRA)')
  }
  if (!config.tgssSiltraOutputDir.trim()) {
    throw new Error('TGSS_SILTRA_OUTPUT_DIR es obligatorio (carpeta de salida de SILTRA)')
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
