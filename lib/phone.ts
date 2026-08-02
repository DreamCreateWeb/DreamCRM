/**
 * PHONE NUMBERS — the one place a number becomes canonical.
 *
 * Every SMS rail wants E.164 (`+15551234567`). Every human types something
 * else: `(555) 123-4567`, `555.123.4567`, `1-555-123-4567`, or a number with
 * an extension stuck on the end. `patient.phone` is a plain text column that
 * has accepted all of it for as long as the product has existed, so the
 * normalisation has to happen at read time and it has to happen in exactly
 * one place — a second implementation would be the pair-that-drifts the
 * audits keep finding, and here the two copies would disagree about whether
 * a real patient can be texted.
 *
 * US-ONLY BY DESIGN, and deliberately not pretending otherwise. A2P 10DLC is
 * a US framework, clinics live in US timezones, and `clinic_profile.country`
 * defaults to 'US'. A non-NANP number returns null rather than being coerced
 * into something that looks valid and fails at the carrier — a patient who
 * silently never receives anything is worse than one the UI can flag.
 *
 * There is deliberately no `isMobile()` here. Number portability killed the
 * landline/mobile distinction in NANP two decades ago; you cannot tell from
 * the digits, only from a paid carrier lookup. Anything claiming otherwise
 * would be guessing, and the guess would decide whether a real person gets
 * their appointment reminder.
 */

/** A canonical US number: `+1` followed by exactly ten digits. */
export type E164 = string

const NANP_LENGTH = 10

/**
 * Strip everything that isn't a digit, and drop an extension if one is
 * present. `555-123-4567 x204` and `5551234567ext204` both reduce to the ten
 * digits that can actually be dialled — the extension is a front-desk fact,
 * not part of the number a carrier routes to.
 */
function digitsOnly(raw: string): string {
  const withoutExtension = raw.split(/\s*(?:x|ext\.?|extension)\s*\d+\s*$/i)[0]
  return withoutExtension.replace(/\D/g, '')
}

/**
 * Is this a structurally valid North American number?
 *
 * The NANP rules that matter: ten digits, the area code and the exchange code
 * both start 2–9. They rule out the placeholder numbers people type to get
 * past a required field (`0000000000`, `1111111111`) without needing a
 * lookup, which is most of the value — a fake number in the list is a message
 * that silently goes nowhere and a segment we paid for.
 */
function isValidNanp(digits: string): boolean {
  if (digits.length !== NANP_LENGTH) return false
  const areaCodeFirst = digits.charCodeAt(0)
  const exchangeFirst = digits.charCodeAt(3)
  const inRange = (c: number) => c >= 50 /* '2' */ && c <= 57 /* '9' */
  return inRange(areaCodeFirst) && inRange(exchangeFirst)
}

/**
 * Normalise anything a human might have typed into E.164, or null when it
 * cannot be one.
 *
 * Null is the honest answer for: empty input, too few or too many digits, a
 * non-US country code, and a structurally impossible NANP number. Callers
 * treat null as "not reachable by text", never as "send it and hope".
 */
export function toE164(raw: string | null | undefined): E164 | null {
  if (!raw) return null
  let digits = digitsOnly(raw)
  // A leading 1 is the North American country code, not part of the number.
  if (digits.length === NANP_LENGTH + 1 && digits.startsWith('1')) digits = digits.slice(1)
  if (!isValidNanp(digits)) return null
  return `+1${digits}`
}

/** Can we text this? The single predicate every SMS caller should ask. */
export function isTextable(raw: string | null | undefined): boolean {
  return toE164(raw) !== null
}

/**
 * How a number is shown to staff and patients: `(555) 123-4567`. Falls back
 * to the original string when it can't be parsed, because a number we don't
 * understand is still the number the front desk wrote down and they need to
 * see it to fix it — blanking it would hide the very rows that need editing.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const e164 = toE164(raw)
  if (!e164) return raw.trim()
  const d = e164.slice(2)
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/**
 * The last four digits, for confirming a number without printing it in full
 * ("we'll text you at •••• 4567"). Empty when the number isn't parseable —
 * a partial echo of an unparseable string could show any four characters.
 */
export function lastFour(raw: string | null | undefined): string {
  const e164 = toE164(raw)
  return e164 ? e164.slice(-4) : ''
}

/**
 * Deduplicate a list of numbers by their canonical form, keeping the first
 * spelling seen. Two patients whose numbers differ only in punctuation are
 * the same phone, and a send list must not carry both.
 */
export function dedupeByNumber<T>(items: readonly T[], read: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = toE164(read(item))
    // Unparseable numbers are NOT collapsed together — they are different
    // unknowns, and merging them would silently drop a real patient.
    if (!key) {
      out.push(item)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}
