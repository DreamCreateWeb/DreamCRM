/**
 * Date parsing for a CSV roster — pure and client-safe, so the import modal's
 * mapping step can show what a column WILL become before anything is written
 * (a date read the wrong way round is a wrong recall for every row).
 *
 * Accepted: ISO `YYYY-MM-DD` (a trailing time is dropped), `YYYY/MM/DD`, and
 * the US `M/D/YYYY` / `M-D-YYYY` the dental exports (Dentrix, Eaglesoft, Open
 * Dental) all write — with a two-digit year resolved by a sliding pivot: a
 * year above this one reads as the previous century (`03/14/65` is 1965,
 * `03/14/24` is 2024). Anything else is null, never a guess.
 */
/** The import targets that carry a date — the mapping step previews what each
 *  parses to. Here rather than in the (server-only) import service because the
 *  modal reads it. */
export const IMPORT_DATE_FIELDS: ReadonlySet<string> = new Set(['dateOfBirth', 'lastVisitAt', 'recallDueAt'])

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/
const ISO_SLASH = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
const US_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1800 || y > 2200) return false
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

function key(y: number, m: number, d: number): string | null {
  if (!valid(y, m, d)) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Coerce a roster cell to a `YYYY-MM-DD` day key; null when unreadable. */
export function parseImportDate(raw: string | null | undefined, now: Date = new Date()): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  let m = ISO_DATE.exec(v)
  if (m) return key(+m[1], +m[2], +m[3])
  m = ISO_SLASH.exec(v)
  if (m) return key(+m[1], +m[2], +m[3])
  m = US_DATE.exec(v)
  if (m) {
    let y = +m[3]
    if (m[3].length === 2) {
      const pivot = now.getUTCFullYear() % 100
      y += y > pivot ? 1900 : 2000
    }
    return key(y, +m[1], +m[2])
  }
  return null
}
