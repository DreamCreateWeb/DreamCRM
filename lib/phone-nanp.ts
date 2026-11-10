/**
 * NANP syntax check — pure, no provider (P-01, prospect verification).
 *
 * The North American Numbering Plan says what a dialable US number LOOKS
 * like: ten digits, NPA-NXX-XXXX, where the area code and the exchange each
 * start with 2–9. A number that fails here cannot ring anywhere, so it is
 * `invalid` before any paid line-type check runs — the cheap filter in
 * front of the metered one. A number that passes is only WELL-FORMED; it
 * says nothing about whether the line is live (that is the provider's job
 * and, above all, the caller's).
 */

export type NanpVerdict = { valid: true } | { valid: false; reason: NanpFailure }

export type NanpFailure =
  | 'not_ten_digits'
  | 'area_code_leading_digit'
  | 'exchange_leading_digit'
  | 'n11_area_code'
  | 'n11_exchange'
  | 'fictional_555'

/** Plain words for each failure, for the drawer. */
export const NANP_FAILURE_LABELS: Record<NanpFailure, string> = {
  not_ten_digits: 'Not a ten-digit US number',
  area_code_leading_digit: 'Area code cannot start with 0 or 1',
  exchange_leading_digit: 'Exchange cannot start with 0 or 1',
  n11_area_code: 'Area code is a service code (N11)',
  n11_exchange: 'Exchange is a service code (N11)',
  fictional_555: '555-01xx numbers are reserved for fiction',
}

/** Strip to digits and drop a leading country code 1 from an 11-digit value. */
export function nanpDigits(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

export function validateNanp(raw: string | null | undefined): NanpVerdict {
  const d = nanpDigits(raw)
  if (d.length !== 10) return { valid: false, reason: 'not_ten_digits' }
  const npa = d.slice(0, 3)
  const nxx = d.slice(3, 6)
  const line = d.slice(6)
  if (npa[0] === '0' || npa[0] === '1') return { valid: false, reason: 'area_code_leading_digit' }
  if (nxx[0] === '0' || nxx[0] === '1') return { valid: false, reason: 'exchange_leading_digit' }
  if (npa[1] === '1' && npa[2] === '1') return { valid: false, reason: 'n11_area_code' }
  if (nxx[1] === '1' && nxx[2] === '1') return { valid: false, reason: 'n11_exchange' }
  if (nxx === '555' && line.startsWith('01')) return { valid: false, reason: 'fictional_555' }
  return { valid: true }
}
