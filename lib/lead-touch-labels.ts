import { clinicDayKey } from '@/lib/format-datetime'
import { leadAgeLabel } from '@/lib/lead-age'

/**
 * THE inquiry touch labels (ML-22, client-safe): what the Leads board and
 * the drawer say about a parked call-back day and the machine's second
 * touch. One home so the two surfaces can't drift ("Call back Tue" on the
 * row, "Call back on Tuesday" in the drawer would be two voices).
 *
 * The call-back is a DAY on the practice's calendar, stored at clinic-local
 * noon; both sides of the comparison are reduced to clinic-local day keys
 * (the tz law) so "today" is the clinic's today, not the server's UTC day
 * or a remote manager's browser day. Anti-shame voice throughout: a
 * call-back day that slipped reads "Call back was Tue", never "OVERDUE".
 */

const DAY_MS = 24 * 60 * 60 * 1000

function dayDistance(fromKey: string, toKey: string): number {
  // Day keys are YYYY-MM-DD; Date.UTC on the parts makes the difference a
  // whole number of days regardless of DST.
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS)
}

/** "Tue" for a day within the week ahead, "Nov 12" beyond it. */
function shortDayLabel(at: Date, timeZone: string, daysAhead: number): string {
  if (daysAhead >= 0 && daysAhead <= 6) return at.toLocaleDateString('en-US', { weekday: 'short', timeZone })
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })
}

/**
 * The board row's call-back label, or null when nothing is parked.
 *  - today → "Call back today"; tomorrow → "Call back tomorrow";
 *  - within the week ahead → "Call back Tue"; beyond → "Call back Nov 12";
 *  - a day that passed → "Call back was Tue" / "Call back was Nov 12".
 */
export function callBackLabel(callBackAt: Date | null | undefined, now: Date, timeZone: string): string | null {
  if (!callBackAt) return null
  const today = clinicDayKey(now, timeZone)
  const target = clinicDayKey(callBackAt, timeZone)
  const d = dayDistance(today, target)
  if (d === 0) return 'Call back today'
  if (d === 1) return 'Call back tomorrow'
  if (d < 0) return `Call back was ${shortDayLabel(callBackAt, timeZone, d)}`
  return `Call back ${shortDayLabel(callBackAt, timeZone, d)}`
}

/** Whether the parked call-back day is before the clinic's today. */
export function callBackSlipped(callBackAt: Date | null | undefined, now: Date, timeZone: string): boolean {
  if (!callBackAt) return false
  return dayDistance(clinicDayKey(now, timeZone), clinicDayKey(callBackAt, timeZone)) < 0
}

/** "Followed up 2d ago" — the machine's second touch, in the board's own age voice. */
export function followedUpLabel(followedUpAt: Date | null | undefined, now: Date): string | null {
  if (!followedUpAt) return null
  const hours = Math.max(0, Math.round((now.getTime() - followedUpAt.getTime()) / (60 * 60 * 1000)))
  return `Followed up ${leadAgeLabel(hours)}`
}

/** The `YYYY-MM-DD` value a date input shows for a parked call-back, in the clinic's calendar. */
export function callBackDayKey(callBackAt: Date | null | undefined, timeZone: string): string {
  return callBackAt ? clinicDayKey(callBackAt, timeZone) : ''
}
