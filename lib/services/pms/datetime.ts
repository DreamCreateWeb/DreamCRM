import 'server-only'

/**
 * Open Dental datetimes (`AptDateTime`, `DateTStamp`) are office-local
 * wall-clock strings with NO timezone — e.g. "2026-06-01 09:00:00". Our app
 * runs on UTC (App Runner), so a naive `new Date("…")` parse shifts every
 * appointment by the office's UTC offset. These helpers convert between an
 * absolute instant (the `Date` we store) and the office's wall-clock string
 * using the clinic's IANA timezone — DST-aware, no external dependency.
 */

function wallParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(instant)) if (p.type !== 'literal') map[p.type] = p.value
  return {
    y: +map.year,
    mo: +map.month,
    d: +map.day,
    h: +(map.hour === '24' ? '0' : map.hour),
    mi: +map.minute,
    s: +map.second,
  }
}

// Offset (ms) of `timeZone` from UTC at the given instant.
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallParts(instant, timeZone)
  const asUTC = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
  return asUTC - instant.getTime()
}

/** "YYYY-MM-DD HH:mm:ss" interpreted in `timeZone` → absolute Date. */
export function parseOdDateTime(s: string, timeZone: string): Date {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return new Date(s)
  const naiveUTC = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  // Two passes resolve DST boundaries correctly.
  let off = offsetMs(new Date(naiveUTC), timeZone)
  off = offsetMs(new Date(naiveUTC - off), timeZone)
  return new Date(naiveUTC - off)
}

/** Absolute Date → "YYYY-MM-DD HH:mm:ss" wall-clock in `timeZone`. */
export function formatOdDateTime(d: Date, timeZone: string): string {
  const w = wallParts(d, timeZone)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${w.y}-${p(w.mo)}-${p(w.d)} ${p(w.h)}:${p(w.mi)}:${p(w.s)}`
}

/** Absolute Date → "YYYY-MM-DD" wall-clock date in `timeZone`. */
export function formatOdDate(d: Date, timeZone: string): string {
  return formatOdDateTime(d, timeZone).slice(0, 10)
}
