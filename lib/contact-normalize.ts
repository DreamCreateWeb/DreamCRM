// lib/contact-normalize.ts
/** Canonical email form for matching/dedupe: trimmed + lowercased. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase()
  return v ? v : null
}

/** Digits-only phone for matching/dedupe; strips a leading US "1" on 11-digit numbers. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '')
  if (!digits) return null
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/** True when both values exist and match after normalization. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeEmail(a)
  const nb = normalizeEmail(b)
  return Boolean(na && nb && na === nb)
}

/** True when both values exist and match after normalization. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  return Boolean(na && nb && na === nb)
}
