import 'server-only'
import { and, count, eq, gte, inArray, lt, max, min, ne, notInArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { formatClinicDayHeader, formatClinicTime } from '@/lib/format-datetime'
import { auditClinicDay, type DayVisit, type DayVisits } from '@/lib/services/patient-audit'
import { notCsvImportVisit } from '@/lib/services/visit-sources'
import { getPmsLink } from '@/lib/services/pms-link'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import { listClosuresAhead } from '@/lib/services/closures'
import { getFollowupSummary } from '@/lib/services/patient-followups'
import { getInboxStats } from '@/lib/services/patient-messaging'
import { countOpenProposals } from '@/lib/services/proposals'
import { countActionsSince } from '@/lib/services/action-ledger'
import { OUR_BOOKING_SOURCES } from '@/lib/services/activation'
import type { FeatureSwitchState } from '@/lib/feature-switches'
import {
  buildHeadsUp,
  buildRecapLines,
  shortPatientName,
  sourceLine,
  tallyDay,
  toFlagView,
  todaySummary,
  visitState,
  visitTypeLabel,
  type HuddleDayView,
  type HuddleLine,
  type HuddleRecapView,
  type HuddleView,
  type HuddleVisitView,
  type RecapFacts,
} from '@/lib/huddle'

/**
 * THE HUDDLE's server half (docs/daily-tools.md, slice H1) — the reads
 * behind the team's morning page. The pure half (lib/huddle.ts) owns every
 * sentence; this file only fetches.
 *
 *  - TODAY and the NEXT DAY ON THE BOOKS are the per-patient audit
 *    (`auditClinicDay`) — the same rules My Day and the morning email read
 *    for tomorrow, so the three can never disagree about a patient.
 *  - THE RECAP is the last day the practice actually saw patients, found by
 *    looking at the schedule and not at a calendar: Monday's huddle talks
 *    about Friday, and the morning after a holiday talks about the day
 *    before it, without anyone configuring working days.
 *  - Every read filters by `organization_id`. Nothing here writes.
 *
 * BEST-EFFORT around the edges, strict at the centre: today's schedule is
 * the page, so a failure there throws (the route's error boundary says so);
 * the recap, the next day and the heads-up each fall back to "not shown" —
 * a huddle missing its recap beats an error page at 7:45 AM.
 */

/** How far back / ahead the Huddle looks for a day with patients in it. */
export const HUDDLE_LOOK_DAYS = 7
/** How far ahead a closure is worth saying out loud. */
const CLOSURE_LOOK_DAYS = 14

const LIVE_STATUSES = ['scheduled', 'confirmed']

async function safe<T>(read: PromiseLike<T>, fallback: T, what: string): Promise<T> {
  try {
    return await read
  } catch (e) {
    console.error(`[huddle] ${what} read failed:`, e)
    return fallback
  }
}

/**
 * Which clinic-local day an instant falls on, as an offset from today —
 * searching `direction` days outward. null when it is outside the window.
 */
export function clinicDayOffsetOf(instant: Date, now: Date, timeZone: string, direction: 1 | -1): number | null {
  for (let step = 1; step <= HUDDLE_LOOK_DAYS; step++) {
    const offset = direction * step
    if (instant >= clinicDayStart(now, timeZone, offset) && instant < clinicDayStart(now, timeZone, offset + 1)) return offset
  }
  return null
}

function toVisitView(v: DayVisit, timeZone: string): HuddleVisitView {
  return {
    id: v.appointmentId,
    patientId: v.patientId,
    name: v.patientName,
    shortName: shortPatientName(v.patientName),
    time: formatClinicTime(v.startTime, timeZone),
    type: visitTypeLabel(v.type),
    provider: v.providerName,
    state: visitState(v.status),
    flags: v.flags.map(toFlagView),
  }
}

function toDayView(day: DayVisits, dayStart: Date, timeZone: string): HuddleDayView {
  const visits = day.visits.map((v) => toVisitView(v, timeZone))
  return {
    dayKey: day.dayKey,
    dayLabel: formatClinicDayHeader(dayStart, timeZone),
    visits,
    // The tally is about what is still AHEAD — a visit already done needs no prep.
    tally: tallyDay(visits.filter((v) => v.state === 'ahead')),
  }
}

/** The facts of one past clinic-local day (`offset` < 0). */
async function readRecap(organizationId: string, now: Date, timeZone: string, offset: number): Promise<RecapFacts> {
  const dayStart = clinicDayStart(now, timeZone, offset)
  const dayEnd = clinicDayStart(now, timeZone, offset + 1)
  const rows = await db
    .select({
      patientId: schema.appointment.patientId,
      status: schema.appointment.status,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.appointment.patientId))
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        // A CSV roster's placeholder visit is never a chair (visit-sources.ts).
        notCsvImportVisit(),
        gte(schema.appointment.startTime, dayStart),
        lt(schema.appointment.startTime, dayEnd),
      ),
    )

  const nameOf = (r: (typeof rows)[number]) => `${r.firstName} ${r.lastName}`.trim()
  const completed = rows.filter((r) => r.status === 'completed')
  const seatedIds = Array.from(new Set(completed.map((r) => r.patientId)))

  const [priors, bookedRows, work] = await Promise.all([
    // "New patients" means SEATED (the North Star): a first visit is a
    // completed visit by someone with no real visit before that day. The
    // same rule as the Overview's ★ — cancelled and no-show priors are not
    // visits; a roster's imported last visit IS one.
    seatedIds.length
      ? db
          .select({ patientId: schema.appointment.patientId })
          .from(schema.appointment)
          .where(
            and(
              eq(schema.appointment.organizationId, organizationId),
              inArray(schema.appointment.patientId, seatedIds),
              lt(schema.appointment.startTime, dayStart),
              notInArray(schema.appointment.status, ['cancelled', 'no_show']),
            ),
          )
      : Promise.resolve([] as Array<{ patientId: string }>),
    safe(
      db
        .select({ n: count() })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            gte(schema.appointment.createdAt, dayStart),
            inArray(schema.appointment.source, OUR_BOOKING_SOURCES),
          ),
        ),
      [] as Array<{ n: number }>,
      'online bookings',
    ),
    safe(countActionsSince(organizationId, dayStart), {} as Record<string, number>, 'ledger'),
  ])

  const returning = new Set(priors.map((p) => p.patientId))
  const firstVisits: string[] = []
  const welcomed = new Set<string>()
  for (const r of completed) {
    if (returning.has(r.patientId) || welcomed.has(r.patientId)) continue
    welcomed.add(r.patientId)
    firstVisits.push(nameOf(r))
  }

  return {
    held: rows.filter((r) => r.status !== 'cancelled').length,
    completed: completed.length,
    noShows: rows.filter((r) => r.status === 'no_show').map(nameOf),
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    unmarked: rows.filter((r) => LIVE_STATUSES.includes(r.status)).length,
    firstVisits,
    bookedOnline: Number(bookedRows[0]?.n ?? 0),
    work,
  }
}

async function readHeadsUp(
  organizationId: string,
  userId: string,
  now: Date,
  timeZone: string,
  switches: FeatureSwitchState,
): Promise<HuddleLine[]> {
  const [closures, followups, inbox, inquiryRows, openProposals] = await Promise.all([
    safe(listClosuresAhead(organizationId, timeZone, CLOSURE_LOOK_DAYS, now), [], 'closures'),
    // No nag about a module the practice never opened (docs/ACTIVATION.md law 1).
    switches.followups ? safe(getFollowupSummary(organizationId, now), null, 'follow-ups') : Promise.resolve(null),
    safe(getInboxStats(organizationId, userId), null, 'inbox'),
    switches.leads
      ? safe(
          db
            .select({ n: count() })
            .from(schema.lead)
            .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.status, 'new'))),
          null,
          'inquiries',
        )
      : Promise.resolve(null),
    safe(countOpenProposals(organizationId), 0, 'proposals'),
  ])
  return buildHeadsUp({
    closures,
    followupsDue: switches.followups ? (followups ? followups.overdue + followups.dueToday : 0) : null,
    unreadMessages: inbox?.unread ?? 0,
    newInquiries: switches.leads ? Number(inquiryRows?.[0]?.n ?? 0) : null,
    openProposals,
  })
}

/**
 * The morning email's one line about today — counts only, never a name (the
 * digest's no-PHI rule). Null when nothing is on the books: a quiet day is
 * not news.
 */
export async function getHuddleDigestLine(organizationId: string, now: Date = new Date()): Promise<string | null> {
  const timeZone = await getClinicTimeZone(organizationId)
  const today = await auditClinicDay(organizationId, { now, dayOffset: 0, scope: 'held' })
  if (today.visits.length === 0) return null
  return todaySummary({ visits: today.visits.map((v) => toVisitView(v, timeZone)) })
}

/** The whole page, for one clinic and the person reading it. */
export async function getHuddle(organizationId: string, userId: string, opts: { now?: Date } = {}): Promise<HuddleView> {
  const now = opts.now ?? new Date()
  const timeZone = await getClinicTimeZone(organizationId)
  const todayStart = clinicDayStart(now, timeZone)
  const tomorrowStart = clinicDayStart(now, timeZone, 1)

  const [today, nextRows, lastRows, pmsLink, syncRows, switches] = await Promise.all([
    // Strict: today's schedule IS the page.
    auditClinicDay(organizationId, { now, dayOffset: 0, scope: 'held' }),
    // The next day with anyone on the books. min()/max() over the column —
    // never a bare `sql` aggregate, which loses the timestamp's driver mapper.
    safe(
      db
        .select({ at: min(schema.appointment.startTime) })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            inArray(schema.appointment.status, LIVE_STATUSES),
            gte(schema.appointment.startTime, tomorrowStart),
            lt(schema.appointment.startTime, clinicDayStart(now, timeZone, HUDDLE_LOOK_DAYS + 1)),
          ),
        ),
      [] as Array<{ at: Date | null }>,
      'next day',
    ),
    // The last day the practice saw patients.
    safe(
      db
        .select({ at: max(schema.appointment.startTime) })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            ne(schema.appointment.status, 'cancelled'),
            notCsvImportVisit(),
            gte(schema.appointment.startTime, clinicDayStart(now, timeZone, -HUDDLE_LOOK_DAYS)),
            lt(schema.appointment.startTime, todayStart),
          ),
        ),
      [] as Array<{ at: Date | null }>,
      'last day',
    ),
    getPmsLink(organizationId),
    safe(
      db
        .select({ at: schema.pmsConnection.lastSyncAt })
        .from(schema.pmsConnection)
        .where(eq(schema.pmsConnection.organizationId, organizationId))
        .limit(1),
      [] as Array<{ at: Date | null }>,
      'sync stamp',
    ),
    getFeatureSwitchState(organizationId),
  ])

  const nextAt = nextRows[0]?.at ?? null
  const lastAt = lastRows[0]?.at ?? null
  const nextOffset = nextAt ? clinicDayOffsetOf(nextAt, now, timeZone, 1) : null
  const lastOffset = lastAt ? clinicDayOffsetOf(lastAt, now, timeZone, -1) : null

  const [nextDay, recapFacts, headsUp] = await Promise.all([
    nextOffset != null
      ? safe(auditClinicDay(organizationId, { now, dayOffset: nextOffset, scope: 'live' }), null, 'next day audit')
      : Promise.resolve(null),
    lastOffset != null ? safe(readRecap(organizationId, now, timeZone, lastOffset), null, 'recap') : Promise.resolve(null),
    readHeadsUp(organizationId, userId, now, timeZone, switches),
  ])

  let recap: HuddleRecapView | null = null
  if (recapFacts && lastOffset != null) {
    const lines = buildRecapLines(recapFacts)
    if (lines.length > 0) {
      recap = {
        dayLabel: formatClinicDayHeader(clinicDayStart(now, timeZone, lastOffset), timeZone),
        isYesterday: lastOffset === -1,
        lines,
      }
    }
  }

  return {
    asOf: formatClinicTime(now, timeZone),
    source: sourceLine(pmsLink, syncRows[0]?.at ?? null, now),
    recap,
    today: toDayView(today, todayStart, timeZone),
    next:
      nextDay && nextOffset != null && nextDay.visits.length > 0
        ? { ...toDayView(nextDay, clinicDayStart(now, timeZone, nextOffset), timeZone), isTomorrow: nextOffset === 1 }
        : null,
    headsUp,
  }
}
