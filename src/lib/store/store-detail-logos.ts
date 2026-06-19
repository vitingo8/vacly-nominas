import type { StoreItem } from '@/lib/store/store-catalog'
import { storeModuleLogo } from '@/lib/store/store-catalog'

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^informes:\s*/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Archivos conocidos en `admin/logos` para integraciones. */
const INTEGRATION_LOGO_FILES: Record<string, string> = {
  'google-workspace': 'google-workspace.png',
  'microsoft-365': 'microsoft-365.png',
  'whatsapp-business': 'whatsapp.png',
  stripe: 'stripe.png',
  holded: 'holded.png',
  sage: 'sage.png',
  a3: 'a3.png',
  santander: 'santander.png',
  bbva: 'bbva.png',
  gocardless: 'gocardless.png',
  qonto: 'qonto.png',
  fnmt: 'fnmt.png',
  payfit: 'payfit.png',
  factorial: 'factorial.png',
  slack: 'slack.png',
  teams: 'teams.png',
  anthropic: 'claude.png',
  elevenlabs: 'elevenlabs.png',
  zapier: 'zapier.png',
  'tgss-red': 'tgss.png',
}

/** Logos del bucket por etiqueta de feature (prioridad sobre slug). */
const FEATURE_LOGO_FILES: Record<string, string[]> = {
  Departamentos: ['departamento.png', 'departamentos.png'],
}

/**
 * Candidatos de logo del bucket para una etiqueta de detalle.
 * El componente prueba en orden y hace fallback si el PNG no existe.
 */
export function getDetailLogoCandidates(item: StoreItem, label: string): string[] {
  const slug = slugify(label)
  const candidates: string[] = []

  const mapped = FEATURE_LOGO_FILES[label]
  if (mapped) {
    for (const file of mapped) candidates.push(storeModuleLogo(file))
  }

  if (item.entitlement?.type === 'integration') {
    const key = item.entitlement.key
    const mapped = INTEGRATION_LOGO_FILES[key]
    if (mapped) candidates.push(storeModuleLogo(mapped))
    candidates.push(storeModuleLogo(`${key}.png`))
  }

  if (item.entitlement?.type === 'agent') {
    const key = item.entitlement.key
    candidates.push(storeModuleLogo(`via-${key}.png`))
    candidates.push(storeModuleLogo(`agent-${key}.png`))
    candidates.push(storeModuleLogo(`${key}.png`))
  }

  if (slug) {
    candidates.push(storeModuleLogo(`${slug}.png`))
    candidates.push(storeModuleLogo(`${slug.replace(/-/g, '_')}.png`))
    const titled = slug.charAt(0).toUpperCase() + slug.slice(1)
    candidates.push(storeModuleLogo(`${titled}.png`))
  }

  return [...new Set(candidates)]
}
