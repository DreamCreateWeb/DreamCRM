/**
 * The website inquiry's "preferred date" is FREE TEXT — whatever the person
 * typed into the contact form ("11/03/2026", "Nov 3", "next Tuesday"). It
 * used to render as that text and seed nothing, so converting the inquiry and
 * booking the visit were two hops with a date re-typed in between.
 *
 * This coerces the shapes people actually type into a `YYYY-MM-DD` key the
 * booking drawer can open on. It is deliberately conservative: a shape it
 * does not recognise, an impossible date (Feb 30) or a day already gone
 * returns null, and the drawer falls back to its own default — a wrong guess
 * seeded into a date field is worse than no seed. Day words ("next Tuesday",
 * "asap") are never guessed at.
 *
 * Pure and client-safe: it runs in the lead drawer, in the staff member's own
 * browser, so "today" is their local day (they sit in the clinic).
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function keyOf(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 1970 || y > 9999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Two-digit years read as this century ("26" → 2026). */
function fullYear(raw: string): number {
  const n = Number(raw)
  return raw.length === 2 ? 2000 + n : n
}

/** The local calendar day of `now` as a key — the floor a seed must clear. */
export function localDateKey(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/**
 * Parse free text into a `YYYY-MM-DD` key, or null. Recognised: ISO
 * (`2026-11-03`), US numeric (`11/03/2026`, `11-3-26`), and month names with
 * an optional year (`Nov 3`, `November 3rd, 2026`, `3 November 2026`). A
 * month-name date with no year resolves to its next occurrence on or after
 * today. Anything on a day before today returns null.
 */
export function coercePreferredDateKey(text: string | null | undefined, now: Date = new Date()): string | null {
  if (typeof text !== 'string') return null
  const s = text.trim().toLowerCase()
  if (!s) return null
  const today = localDateKey(now)
  const accept = (key: string | null): string | null => (key && key >= today ? key : null)

  // ISO: 2026-11-03 (tolerates a trailing time or words after it).
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s)
  if (iso) return accept(keyOf(Number(iso[1]), Number(iso[2]), Number(iso[3])))

  // US numeric: 11/03/2026, 11-3-26, 11.3.2026.
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(s)
  if (us) return accept(keyOf(fullYear(us[3]), Number(us[1]), Number(us[2])))

  // Month name first: "nov 3", "november 3rd, 2026", "nov. 3 2026".
  const mFirst = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(s)
  // Day first: "3 november 2026", "3rd nov".
  const dFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:,?\s+(\d{4}))?\b/.exec(s)
  const named = mFirst
    ? { month: MONTHS[mFirst[1]], day: Number(mFirst[2]), year: mFirst[3] ? Number(mFirst[3]) : null }
    : dFirst
      ? { month: MONTHS[dFirst[2]], day: Number(dFirst[1]), year: dFirst[3] ? Number(dFirst[3]) : null }
      : null
  if (!named || !named.month) return null
  if (named.year != null) return accept(keyOf(named.year, named.month, named.day))
  // No year: the next time that month/day comes round, this year or next.
  const thisYear = keyOf(now.getFullYear(), named.month, named.day)
  if (thisYear && thisYear >= today) return thisYear
  return accept(keyOf(now.getFullYear() + 1, named.month, named.day))
}
