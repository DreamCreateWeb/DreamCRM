// Client-safe form-field validators. Each returns a human error message, or
// null when valid — so forms can show inline, in-place errors (next to the
// field, before a server round-trip) instead of a native browser bubble.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRequired(value: string, label = 'This field'): string | null {
  return value.trim() ? null : `${label} is required.`
}

export function validateEmail(value: string, opts?: { required?: boolean; label?: string }): string | null {
  const v = value.trim()
  if (!v) return opts?.required ? `${opts.label ?? 'Email'} is required.` : null
  return EMAIL_RE.test(v) ? null : 'Enter a valid email address.'
}

export function validatePhone(value: string, opts?: { required?: boolean; label?: string }): string | null {
  const v = value.trim()
  if (!v) return opts?.required ? `${opts.label ?? 'Phone'} is required.` : null
  // Accept any common formatting; require at least 10 digits (US/CA + most intl).
  return v.replace(/\D/g, '').length >= 10 ? null : 'Enter a valid phone number.'
}

/** Run a map of {field: validatorResult}; returns only the entries that errored. */
export function collectErrors(checks: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [field, err] of Object.entries(checks)) {
    if (err) out[field] = err
  }
  return out
}
