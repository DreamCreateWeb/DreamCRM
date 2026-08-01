import 'server-only'
import { getSlotsForDay } from '@/lib/services/booking'
import { clinicDayStart } from '@/lib/clinic-timezone'
import {
  FILL_WINDOW_START_DAYS,
  FILL_WINDOW_END_DAYS,
  type DayLoad,
} from '@/lib/empty-chair'

/**
 * THE EMPTY CHAIR (Phase 5, limb 2), service half.
 *
 * NOTHING NEW IS STORED. The week's shape is already fully determined by
 * three things the schema holds — the clinic's hours, its chair count, and
 * the visits on the books — and `getSlotsForDay` is the single home for
 * turning those into openings. A utilization column would be a cached
 * derivation that goes stale the moment somebody books, which is the defect
 * class the Phase-4 audit spent sixteen rounds removing.
 *
 * That is also why this reads the window a DAY AT A TIME through the public
 * booking service rather than running its own faster aggregate query. The
 * rules for what counts as an opening are genuinely intricate (multi-chair
 * overlap, visits that start before opening and run into it, cancelled and
 * no-show visits not blocking, the whole visit having to fit before close,
 * DST-aware wall-clock hours). A second implementation would be a second
 * home for all of it, and the two would disagree the first time either was
 * touched — the practice would then be told its Thursday is quiet by one
 * and busy by the other. Seven reads on an hourly cron is a cheap price for
 * only ever having one answer.
 */

/** The clinic-local calendar key (YYYY-MM-DD) for an instant. */
function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** "Thursday" in the clinic's own calendar. */
function dayLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(at)
}

/**
 * How full each day in the near window is.
 *
 * Days the clinic is CLOSED are left out entirely rather than reported as
 * 100% open. A Sunday with no hours is not an empty chair — it is a day off,
 * and counting it would make every practice in the country look like it was
 * failing every week.
 *
 * Throws if the window cannot be read. The callers decide what silence means
 * (see readWeekLoad's two consumers): a generator that cannot see the
 * schedule must not guess that it is empty.
 */
export async function readWindowLoad(
  organizationId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<DayLoad[]> {
  const days: DayLoad[] = []
  for (let offset = FILL_WINDOW_START_DAYS; offset <= FILL_WINDOW_END_DAYS; offset++) {
    // Clinic-local midnight for the target day, then read that calendar day.
    // Passing the DATE KEY (not the instant) is what keeps the weekday and
    // the open/close resolution in the practice's zone rather than the
    // server's UTC (the CLAUDE.md bucketing law).
    const at = clinicDayStart(now, timeZone, offset)
    const key = dayKey(at, timeZone)
    const { slots } = await getSlotsForDay(organizationId, key)
    if (slots.length === 0) continue // closed, or unusable hours — not a gap
    days.push({
      dateKey: key,
      label: dayLabel(at, timeZone),
      open: slots.filter((s) => s.available).length,
      total: slots.length,
    })
  }
  return days
}

/**
 * The window, best-effort, for callers that must not throw.
 *
 * Returns null when it could not be read, and every caller treats null as
 * "no signal — say nothing". Erring toward silence: a failed query must
 * never be the reason a practice emails its patient list about a week the
 * machine could not actually see.
 */
export async function safeWindowLoad(
  organizationId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<DayLoad[] | null> {
  try {
    return await readWindowLoad(organizationId, timeZone, now)
  } catch (e) {
    console.error('[empty-chair] window read failed', e)
    return null
  }
}
