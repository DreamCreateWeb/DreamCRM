/**
 * Public-site hours — the ONE pure reader of "what day is it at the office".
 *
 * Every template's header / footer / contact asks `openNowLabel` and prints
 * what it returns, so no template phrases "open now" its own way. Everything
 * is computed against the CLINIC's IANA zone through Intl (never `new Date()`
 * arithmetic, so DST is the platform's problem, not ours). GBP-synced hours
 * win over the profile's hand-typed ones when the listing carries any
 * (`resolveSiteWeek`). Pure + client-safe: the public pages are cached, so the
 * label is computed in the visitor's browser (`<OpenNow>`) from a serialisable
 * week + zone.
 */
import { fmt12, type HoursMap } from '@/lib/clinic-site-helpers'

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type DayKey = (typeof DAY_KEYS)[number]

const LONG: Record<DayKey, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
}

/** One open window, minutes since local midnight (close may be 1440). */
export type SitePeriod = readonly [open: number, close: number]
/** One weekday: timed windows, or "by appointment"; absent = closed. */
export interface SiteDay {
  periods: SitePeriod[]
  byAppointment?: boolean
}
/** Serialisable weekly schedule. A missing key is a closed day. */
export type SiteWeek = Partial<Record<DayKey, SiteDay>>

/** A date the office is closed (ML-51's holiday closures — `expandClosureDays` in lib/closures.ts builds these from the stored ranges). */
export interface SiteClosure {
  /** Clinic-local calendar date, YYYY-MM-DD. */
  date: string
  label?: string | null
}

const DEFAULT_TZ = 'America/New_York'

function toMinutes(t: string | null | undefined, isClose = false): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim())
  if (!m) return null
  const mins = Number(m[1]) * 60 + Number(m[2])
  if (!Number.isFinite(mins) || mins > 1440) return null
  return isClose && mins === 0 ? 1440 : mins
}

/** The profile's `hours` jsonb → a week (null when nothing usable). */
export function weekFromProfileHours(hours: unknown): SiteWeek | null {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return null
  const map = hours as HoursMap
  const week: SiteWeek = {}
  let any = false
  for (const day of DAY_KEYS) {
    const e = map[day]
    if (!e) continue
    if (e.closed) {
      any = true
      continue
    }
    if (e.byAppointment) {
      week[day] = { periods: [], byAppointment: true }
      any = true
      continue
    }
    const o = toMinutes(e.open)
    const c = toMinutes(e.close, true)
    if (o != null && c != null && c > o) {
      week[day] = { periods: [[o, c]] }
      any = true
    }
  }
  return any ? week : null
}

/** GBP-synced periods ('mon'…'sun', "HH:MM") → a week (null when empty). */
export function weekFromGbpPeriods(
  periods: ReadonlyArray<{ day: string; open: string; close: string }> | null | undefined,
): SiteWeek | null {
  if (!periods || periods.length === 0) return null
  const week: SiteWeek = {}
  for (const p of periods) {
    const day = p.day.slice(0, 3).toLowerCase() as DayKey
    if (!(DAY_KEYS as readonly string[]).includes(day)) continue
    const o = toMinutes(p.open)
    const c = toMinutes(p.close, true)
    if (o == null || c == null || c <= o) continue
    const d = (week[day] ??= { periods: [] })
    d.periods.push([o, c])
    d.periods.sort((a, b) => a[0] - b[0])
  }
  return Object.keys(week).length ? week : null
}

/** GBP hours win when the listing carries any; else the profile's. */
export function resolveSiteWeek(
  profileHours: unknown,
  gbpPeriods?: ReadonlyArray<{ day: string; open: string; close: string }> | null,
): SiteWeek | null {
  return weekFromGbpPeriods(gbpPeriods) ?? weekFromProfileHours(profileHours)
}

interface LocalNow {
  day: DayKey
  minutes: number
  date: string
}

/** The clinic-local weekday, minute of day and calendar date for an instant. */
export function clinicLocalNow(now: Date, timeZone: string | null | undefined): LocalNow {
  const read = (tz: string): LocalNow => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    return {
      day: get('weekday').slice(0, 3).toLowerCase() as DayKey,
      minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
      date: `${get('year')}-${get('month')}-${get('day')}`,
    }
  }
  try {
    return read(timeZone || DEFAULT_TZ)
  } catch {
    return read(DEFAULT_TZ)
  }
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}`
}

function hourLabel(mins: number): string {
  const m = mins >= 1440 ? 1439 : mins
  return fmt12(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`).replace(':00 ', ' ')
}

/** "Today · 8 AM – 5 PM" / "Today · Closed" — null when no hours are known. */
export function todayHoursLine(
  week: SiteWeek | null,
  now: Date,
  timeZone?: string | null,
  closures?: ReadonlyArray<SiteClosure> | null,
): string | null {
  if (!week) return null
  const { day, date } = clinicLocalNow(now, timeZone)
  const closure = closures?.find((c) => c.date === date)
  if (closure) return closure.label ? `Today · Closed for ${closure.label}` : 'Today · Closed'
  const d = week[day]
  if (!d) return 'Today · Closed'
  if (d.byAppointment && d.periods.length === 0) return 'Today · By appointment'
  return `Today · ${d.periods.map(([o, c]) => `${hourLabel(o)} – ${hourLabel(c)}`).join(', ')}`
}

/**
 * The plain-spoken state of the office right now, or null when the clinic has
 * no usable hours (say nothing rather than guess).
 *   "Open now · closes 5 PM"
 *   "Closed now · opens today at 8 AM"
 *   "Closed today · opens Monday 8 AM"   (no hours today / a closure)
 *   "Closed now · opens tomorrow 8 AM"
 */
export function openNowLabel(
  week: SiteWeek | null,
  closures: ReadonlyArray<SiteClosure> | null | undefined,
  now: Date,
  timeZone?: string | null,
): string | null {
  if (!week) return null
  const local = clinicLocalNow(now, timeZone)
  const closedOn = (date: string) => closures?.find((c) => c.date === date)
  const todayClosure = closedOn(local.date)
  const today = week[local.day]

  if (!todayClosure && today) {
    if (today.byAppointment && today.periods.length === 0) return 'By appointment today'
    const live = today.periods.find(([o, c]) => local.minutes >= o && local.minutes < c)
    if (live) return `Open now · closes ${hourLabel(live[1])}`
    const later = today.periods.find(([o]) => o > local.minutes)
    if (later) return `Closed now · opens today at ${hourLabel(later[0])}`
  }

  const lead = todayClosure
    ? todayClosure.label
      ? `Closed for ${todayClosure.label}`
      : 'Closed today'
    : !today
      ? 'Closed today'
      : 'Closed now'
  // Walk forward (clinic-local days) to the next open window. Three weeks
  // reaches past any plausible closure run (the week repeats, so a window
  // found on step 8+ only happens when closures swallowed a whole week).
  const startIdx = DAY_KEYS.indexOf(local.day)
  const [y, mo, d0] = local.date.split('-').map(Number)
  for (let step = 1; step <= 21; step++) {
    const key = DAY_KEYS[(startIdx + step) % 7]
    const date = new Date(Date.UTC(y, mo - 1, d0 + step)).toISOString().slice(0, 10)
    const day = week[key]
    if (!day || closedOn(date)) continue
    const when = step === 1 ? 'tomorrow' : step <= 7 ? LONG[key] : `${LONG[key]} ${monthDay(date)}`
    const first = day.periods[0]
    return first ? `${lead} · opens ${when} ${hourLabel(first[0])}` : `${lead} · opens ${when} by appointment`
  }
  return lead
}
