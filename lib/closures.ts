/**
 * Holiday closures — the ONE pure reader (ML-51). Client-safe.
 *
 * A closure is stated once as a clinic-local DAY range ("Nov 26–27",
 * "Thanksgiving") and every door asks these helpers: booking slots, the public
 * site's open-now line + JSON-LD, the reminder engine, the digest. A closure
 * is a calendar DAY KEY (`YYYY-MM-DD`), never an instant — compared by key, so
 * the server's UTC clock can never move "Nov 27" to the 26th.
 *
 * GBP-synced special hours, when present, are a second READ-ONLY source shown
 * beside the practice's own (`/settings/closures`); nothing here merges them.
 */

export interface ClosureRange {
  id?: string
  /** First closed clinic-local day, YYYY-MM-DD. */
  startsOn: string
  /** Last closed clinic-local day (inclusive), YYYY-MM-DD. */
  endsOn: string
  label: string
}

/** One closed day, the shape `openNowLabel` reads (lib/site-hours.ts). */
export interface ClosedDay {
  date: string
  label?: string | null
}

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
/** A closure longer than this is a typo, not a holiday. */
export const MAX_CLOSURE_DAYS = 60
export const MAX_CLOSURE_LABEL = 80

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

/** True for a real calendar day key (rejects 2026-02-30). */
export function isValidDayKey(key: unknown): key is string {
  if (typeof key !== 'string' || !DAY_KEY_RE.test(key)) return false
  const [y, m, d] = parts(key)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** `key` plus `n` calendar days (UTC anchor — date-only math is zone-agnostic). */
export function addDaysToKey(key: string, n: number): string {
  const [y, m, d] = parts(key)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = parts(a)
  const [by, bm, bd] = parts(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** The closure covering `dayKey`, or null. */
export function closureOn<T extends ClosureRange>(dayKey: string, closures: ReadonlyArray<T> | null | undefined): T | null {
  if (!closures) return null
  return closures.find((c) => dayKey >= c.startsOn && dayKey <= c.endsOn) ?? null
}

/** Is the office closed on this clinic-local day? THE predicate every door asks. */
export function isClosedOn(dayKey: string, closures: ReadonlyArray<ClosureRange> | null | undefined): boolean {
  return closureOn(dayKey, closures) != null
}

/** Ranges → one entry per closed day within [fromKey, toKey] (what `openNowLabel` reads). */
export function expandClosureDays(
  closures: ReadonlyArray<ClosureRange> | null | undefined,
  fromKey: string,
  toKey: string,
): ClosedDay[] {
  const out: ClosedDay[] = []
  for (const c of closures ?? []) {
    const start = c.startsOn < fromKey ? fromKey : c.startsOn
    const end = c.endsOn > toKey ? toKey : c.endsOn
    for (let k = start; k <= end; k = addDaysToKey(k, 1)) out.push({ date: k, label: c.label })
  }
  return out
}

/**
 * The next closure that is under way or starts within `withinDays` of `todayKey`
 * (earliest first), with how many days away it begins (0 = today / ongoing).
 */
export function nextClosure<T extends ClosureRange>(
  closures: ReadonlyArray<T> | null | undefined,
  todayKey: string,
  withinDays: number,
): { closure: T; startsInDays: number } | null {
  let best: { closure: T; startsInDays: number } | null = null
  for (const c of closures ?? []) {
    if (c.endsOn < todayKey) continue
    const startsInDays = Math.max(0, daysBetweenKeys(todayKey, c.startsOn))
    if (startsInDays > withinDays) continue
    if (!best || c.startsOn < best.closure.startsOn) best = { closure: c, startsInDays }
  }
  return best
}

/** "Nov 26" / "Nov 26–27" / "Dec 30 – Jan 2". */
export function formatClosureRange(c: Pick<ClosureRange, 'startsOn' | 'endsOn'>): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, sm, sd] = parts(c.startsOn)
  const [, em, ed] = parts(c.endsOn)
  if (c.startsOn === c.endsOn) return `${MONTHS[sm - 1]} ${sd}`
  if (sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}`
  return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}`
}

export type ClosureInput = { startsOn: string; endsOn?: string | null; label: string }

/** Validate + normalise a hand-typed closure. Untrusted input in, one honest error out. */
export function parseClosureInput(
  input: ClosureInput,
): { ok: true; value: ClosureRange } | { ok: false; error: string } {
  const label = (input.label ?? '').trim().replace(/\s+/g, ' ')
  if (!label) return { ok: false, error: 'Give the closure a name, like “Thanksgiving”.' }
  if (label.length > MAX_CLOSURE_LABEL) return { ok: false, error: `Keep the name under ${MAX_CLOSURE_LABEL} characters.` }
  if (!isValidDayKey(input.startsOn)) return { ok: false, error: 'Pick the first day you are closed.' }
  const endsOn = input.endsOn && input.endsOn.trim() ? input.endsOn : input.startsOn
  if (!isValidDayKey(endsOn)) return { ok: false, error: 'Pick the last day you are closed.' }
  if (endsOn < input.startsOn) return { ok: false, error: 'The last day cannot be before the first day.' }
  if (daysBetweenKeys(input.startsOn, endsOn) + 1 > MAX_CLOSURE_DAYS) {
    return { ok: false, error: `A closure can run up to ${MAX_CLOSURE_DAYS} days.` }
  }
  return { ok: true, value: { startsOn: input.startsOn, endsOn, label } }
}

/* ── US federal holiday presets (computed, never stored until tapped) ───── */

export interface HolidayPreset extends ClosureRange {
  /** Stable key, e.g. `thanksgiving-2026`. */
  key: string
}

/** The nth (1-based) `weekday` (0=Sun) of a month, YYYY-MM-DD. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0))
  const back = (last.getUTCDay() - weekday + 7) % 7
  return `${year}-${String(month).padStart(2, '0')}-${String(last.getUTCDate() - back).padStart(2, '0')}`
}

function fixed(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function holidaysOfYear(y: number): HolidayPreset[] {
  const mk = (slug: string, label: string, startsOn: string, endsOn = startsOn): HolidayPreset => ({
    key: `${slug}-${y}`,
    label,
    startsOn,
    endsOn,
  })
  const thanksgiving = nthWeekday(y, 11, 4, 4)
  return [
    mk('new-years-day', 'New Year’s Day', fixed(y, 1, 1)),
    mk('mlk-day', 'Martin Luther King Jr. Day', nthWeekday(y, 1, 1, 3)),
    mk('presidents-day', 'Presidents’ Day', nthWeekday(y, 2, 1, 3)),
    mk('memorial-day', 'Memorial Day', lastWeekday(y, 5, 1)),
    mk('juneteenth', 'Juneteenth', fixed(y, 6, 19)),
    mk('independence-day', 'Independence Day', fixed(y, 7, 4)),
    mk('labor-day', 'Labor Day', nthWeekday(y, 9, 1, 1)),
    mk('columbus-day', 'Columbus Day', nthWeekday(y, 10, 1, 2)),
    mk('veterans-day', 'Veterans Day', fixed(y, 11, 11)),
    // The dental week: Thursday + the Friday after.
    mk('thanksgiving', 'Thanksgiving', thanksgiving, addDaysToKey(thanksgiving, 1)),
    mk('christmas', 'Christmas Day', fixed(y, 12, 25)),
  ]
}

/** The holidays that start within the next 12 months of `todayKey`, soonest first. */
export function holidayPresets(todayKey: string, months = 12): HolidayPreset[] {
  const [y, m, d] = parts(todayKey)
  const endKey = new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10)
  return [...holidaysOfYear(y), ...holidaysOfYear(y + 1)]
    .filter((h) => h.endsOn >= todayKey && h.startsOn < endKey)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
}

/** The presets a dental office most often closes for (the first-week ask). */
export const COMMON_CLOSURE_SLUGS = ['new-years-day', 'memorial-day', 'independence-day', 'labor-day', 'thanksgiving', 'christmas'] as const

export function commonHolidayPresets(todayKey: string, months = 12): HolidayPreset[] {
  return holidayPresets(todayKey, months).filter((h) => (COMMON_CLOSURE_SLUGS as readonly string[]).some((s) => h.key.startsWith(`${s}-`)))
}

/** "Closed Nov 26–27 for Thanksgiving" — the public hours block's line for a
 *  closure within `withinDays` (null when none; an ongoing one reads "Closed through …"). */
export function upcomingClosureLine(
  closures: ReadonlyArray<ClosureRange> | null | undefined,
  todayKey: string,
  withinDays = 14,
): string | null {
  const next = nextClosure(closures, todayKey, withinDays)
  if (!next) return null
  const c = next.closure
  if (next.startsInDays === 0 && c.startsOn < todayKey) return `Closed through ${formatClosureRange({ startsOn: c.endsOn, endsOn: c.endsOn })} for ${c.label}`
  return `Closed ${formatClosureRange(c)} for ${c.label}`
}

export interface DigestClosureNotes {
  /** Monday's heads-up: the closure(s) starting in the coming week, named once. */
  weekLine: string | null
  /** Today is a closed day: a quiet day by design, not a slow one. */
  todayLine: string | null
}

/**
 * What the morning digest says about closures (ML-51). Pure. The week line is
 * the MONDAY digest's (clinic-local) — each closure starting in Mon..Sun is
 * named in exactly one Monday's email, so "once" needs no memory table. A
 * closure already under way is today's line, not a heads-up.
 * `bookedOnClosure` is how many live visits already sit on the closed days
 * (they get no reminder — the desk should ring them).
 */
export function digestClosureNotes(input: {
  closures: ReadonlyArray<ClosureRange> | null | undefined
  todayKey: string
  isMonday: boolean
  bookedOnClosure?: number
}): DigestClosureNotes {
  const { closures, todayKey } = input
  const now = closureOn(todayKey, closures)
  const todayLine = now
    ? `🗓️ We’re closed today for ${now.label} — a quiet day by design, not a slow one.`
    : null
  let weekLine: string | null = null
  if (input.isMonday) {
    const coming = (closures ?? [])
      .filter((c) => c.startsOn > todayKey && daysBetweenKeys(todayKey, c.startsOn) <= 6)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    if (coming.length > 0) {
      const names = coming.map((c) => `${c.label} (${formatClosureRange(c)})`).join(' · ')
      const n = input.bookedOnClosure ?? 0
      const clash =
        n > 0
          ? ` ${n} visit${n === 1 ? ' is' : 's are'} still booked on ${n === 1 ? 'that day' : 'those days'} — ${n === 1 ? 'it' : 'they'} won’t get a reminder, so it’s worth a call.`
          : ''
      weekLine = `🗓️ Closed this week: ${names}. Online booking is already off for ${coming.length === 1 && coming[0].startsOn === coming[0].endsOn ? 'that day' : 'those days'}.${clash}`
    }
  }
  return { weekLine, todayLine }
}
