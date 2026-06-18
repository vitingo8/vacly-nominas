/** Paleta corporativa alineada con vacly-app (gestoría vs empresa). */
export interface CorporateBrand {
  isAgency: boolean
  accent: string
  primary: string
  primaryHover: string
  primaryMuted: string
}

const AGENCY_BRAND: CorporateBrand = {
  isAgency: true,
  accent: '#1B2A41',
  primary: '#1B2A41',
  primaryHover: '#152036',
  primaryMuted: 'rgba(27, 42, 65, 0.06)',
}

const COMPANY_BRAND: CorporateBrand = {
  isAgency: false,
  accent: '#3B9EDE',
  primary: '#3B9EDE',
  primaryHover: '#2E8BC8',
  primaryMuted: 'rgba(59, 158, 222, 0.08)',
}

export function corporateBrandForPlan(plan: string | null | undefined): CorporateBrand {
  return plan === 'agencia' ? AGENCY_BRAND : COMPANY_BRAND
}

export const DEFAULT_CORPORATE_BRAND = AGENCY_BRAND
