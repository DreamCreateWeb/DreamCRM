/**
 * Pure name-identity helpers for the PUBLIC patient-matching guard.
 *
 * The seam this closes (2026-07-22, the "Maria/John" mixup): the public site's
 * request/booking/chat flows deduped patients by email OR phone alone, so a
 * family member sharing a spouse's contact info silently landed on the
 * spouse's chart — their request threaded under the wrong name, staff booked
 * it on the wrong record, and the eventual cleanup cancelled the wrong
 * person's visit. Dental families share emails and phones constantly, so a
 * contact-info match may only claim an existing record when the submitted
 * NAME also matches. A mismatch creates a separate (flagged) record instead —
 * a duplicate is a 10-second merge; a cross-contaminated chart is a privacy
 * incident.
 */

export interface PersonNameParts {
  firstName: string
  lastName: string
}

/** Lowercase, strip diacritics + punctuation (O'Brien / O’Brien / OBrien all
 *  compare equal), collapse whitespace. */
export function normalizePersonName(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Placeholder last names the chat flow mints for single-word names. */
const EMPTY_LAST_NAMES = new Set(['', '—', '-'])

/**
 * Do two submitted names plausibly refer to the SAME person?
 *
 * - Last names must match when both sides have one (family members share last
 *   names — "John Aguilera" vs "Maria Aguilera" must NOT match).
 * - First names must match exactly, or one side is a single-letter initial of
 *   the other ("M Aguilera" ≈ "Maria Aguilera").
 * - A side with no usable last name (single-word chat names) falls back to
 *   first-name comparison alone ("Maria" ≈ "Maria Aguilera").
 *
 * Deliberately strict: a nickname ("Mike" vs "Michael") reads as a mismatch
 * and creates a flagged duplicate — the safe failure mode.
 */
export function namesLooselyMatch(a: PersonNameParts, b: PersonNameParts): boolean {
  const aFirst = normalizePersonName(a.firstName)
  const bFirst = normalizePersonName(b.firstName)
  if (!aFirst || !bFirst) return false

  const firstMatches =
    aFirst === bFirst ||
    (aFirst.length === 1 && bFirst.startsWith(aFirst)) ||
    (bFirst.length === 1 && aFirst.startsWith(bFirst))
  if (!firstMatches) return false

  const aLast = normalizePersonName(a.lastName)
  const bLast = normalizePersonName(b.lastName)
  const aHasLast = !EMPTY_LAST_NAMES.has(a.lastName.trim()) && aLast.length > 0
  const bHasLast = !EMPTY_LAST_NAMES.has(b.lastName.trim()) && bLast.length > 0
  if (!aHasLast || !bHasLast) return true // single-word name: first-name match is the best signal we have
  return aLast === bLast
}

/** Split a free-text full name ("Maria Aguilera Cruz") into first + rest. */
export function splitFullName(name: string): PersonNameParts {
  const [firstName, ...rest] = name.trim().split(/\s+/)
  return { firstName: firstName ?? '', lastName: rest.join(' ') }
}
