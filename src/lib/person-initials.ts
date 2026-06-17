/**
 * Iniciales de persona: primera letra del nombre + primera del apellido.
 */
export function getPersonInitials(
  nameOrFirst?: string | null,
  lastName?: string | null,
): string {
  const last = (lastName ?? '').trim()
  let first = (nameOrFirst ?? '').trim()

  if (first && last) {
    const a = first.charAt(0)
    const b = last.charAt(0)
    if (a && b) return `${a}${b}`.toUpperCase()
  }

  const parts = first.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
  }

  if (parts.length === 1) {
    const word = parts[0]
    if (word.length >= 2) return `${word.charAt(0)}${word.charAt(1)}`.toUpperCase()
    return word.charAt(0).toUpperCase() || '?'
  }

  return '?'
}
