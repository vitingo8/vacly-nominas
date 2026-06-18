import { normalizeCif } from '@/lib/upload-security'

export type PortfolioScope = 'own' | 'portfolio'
export type ResolvedCertOrigin = PortfolioScope | 'unassigned'

export interface AccountCompany {
  companyId: string
  name: string
  cif: string | null
}

export interface CertOriginInput {
  holderNif?: string | null
  holderName?: string | null
  portfolioScope?: PortfolioScope | null
  linkedCompanyId?: string | null
}

export interface ResolvedCertClassification {
  origin: ResolvedCertOrigin
  linkedCompanyId?: string
  linkedCompanyName?: string
  /** CIF de empresa detectado en el certificado (si aplica). */
  linkedCompanyCif?: string
  classificationNifs: string[]
}

/** CIF de persona jurídica española (no DNI ni NIE). */
export function isSpanishCompanyCif(value: string | null | undefined): boolean {
  const n = normalizeCif(value)
  if (!n) return false
  if (/^\d{8}[A-Z]$/.test(n)) return false
  if (/^[XYZ]\d{7}[A-Z]$/.test(n)) return false
  return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(n)
}

export function companyCifsFromClassification(classificationNifs: string[]): string[] {
  return classificationNifs.filter(isSpanishCompanyCif)
}

/** NIFs relevantes para clasificar: titular, representado (R: …), etc. */
export function extractClassificationNifs(
  holderNif?: string | null,
  holderName?: string | null,
): string[] {
  const found = new Set<string>()
  const primary = normalizeCif(holderNif)
  if (primary) found.add(primary)

  const rep = holderName?.match(/\(R:\s*([A-Z0-9]+)\)/i)?.[1]
  const repNorm = normalizeCif(rep)
  if (repNorm) found.add(repNorm)

  const idces = holderNif?.replace(/^IDC?ES-?/i, '')
  const idcesNorm = normalizeCif(idces)
  if (idcesNorm) found.add(idcesNorm)

  return Array.from(found)
}

function companyById(companies: AccountCompany[], companyId: string): AccountCompany | undefined {
  return companies.find((c) => c.companyId === companyId)
}

export function resolveCertificateOrigin(
  cert: CertOriginInput,
  loggedInCompanyId: string,
  accountCompanies: AccountCompany[],
): ResolvedCertClassification {
  const classificationNifs = extractClassificationNifs(cert.holderNif, cert.holderName)
  const loggedIn = companyById(accountCompanies, loggedInCompanyId)
  const loggedInCif = normalizeCif(loggedIn?.cif ?? null)

  if (cert.portfolioScope === 'own') {
    return {
      origin: 'own',
      linkedCompanyId: loggedInCompanyId,
      linkedCompanyName: loggedIn?.name,
      classificationNifs,
    }
  }

  if (cert.portfolioScope === 'portfolio') {
    const linked = cert.linkedCompanyId
      ? companyById(accountCompanies, cert.linkedCompanyId)
      : undefined
    return {
      origin: 'portfolio',
      linkedCompanyId: cert.linkedCompanyId ?? undefined,
      linkedCompanyName: linked?.name,
      classificationNifs,
    }
  }

  if (loggedInCif && classificationNifs.includes(loggedInCif)) {
    return {
      origin: 'own',
      linkedCompanyId: loggedInCompanyId,
      linkedCompanyName: loggedIn?.name,
      classificationNifs,
    }
  }

  for (const company of accountCompanies) {
    if (company.companyId === loggedInCompanyId) continue
    const cif = normalizeCif(company.cif)
    if (cif && classificationNifs.includes(cif)) {
      return {
        origin: 'portfolio',
        linkedCompanyId: company.companyId,
        linkedCompanyName: company.name,
        linkedCompanyCif: cif,
        classificationNifs,
      }
    }
  }

  const foreignCompanyCifs = companyCifsFromClassification(classificationNifs).filter(
    (cif) => !loggedInCif || cif !== loggedInCif,
  )
  if (foreignCompanyCifs.length > 0) {
    const primaryCif = foreignCompanyCifs[0]
    return {
      origin: 'portfolio',
      linkedCompanyCif: primaryCif,
      classificationNifs,
    }
  }

  return { origin: 'unassigned', classificationNifs }
}

/** Tras elegir manualmente «Cartera», intenta enlazar empresa por NIF del certificado. */
export function guessLinkedCompanyForPortfolio(
  classificationNifs: string[],
  accountCompanies: AccountCompany[],
  loggedInCompanyId: string,
): AccountCompany | undefined {
  for (const company of accountCompanies) {
    if (company.companyId === loggedInCompanyId) continue
    const cif = normalizeCif(company.cif)
    if (cif && classificationNifs.includes(cif)) return company
  }
  return undefined
}
