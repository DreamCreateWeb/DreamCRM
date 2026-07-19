import 'server-only'
import { and, count, eq, gt, gte, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicWeekStart } from '@/lib/clinic-timezone'
import { listOpenFollowups, type PatientFollowupView } from '@/lib/services/patient-followups'
import { listPatientThreads, type ThreadRow } from '@/lib/services/patient-messaging'
import { listAppointments, type AppointmentRow } from '@/lib/services/appointments'
import { auditUpcomingDay, type DayAudit } from '@/lib/services/patient-audit'
import { followupDueState } from '@/lib/types/followups'
import { clinicDayKey } from '@/lib/format-datetime'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'

/**
 * "My day" — a per-staff-member cockpit. Pulls the things actually assignable to
 * a person (follow-ups, conversations) scoped to me OR unclaimed, plus today's
 * shared schedule + the team's new-lead count for awareness. Leads + visits
 * aren't user-assigned in the data model, so they're shown as shared context.
 */

export interface MyDayData {
  followups: {
    overdue: number
    today: number
    /** Open follow-ups assigned to me OR unassigned, soonest-due first. */
    items: PatientFollowupView[]
  }
  /** Open conversations assigned to me, waiting. */
  conversations: ThreadRow[]
  /** Today's appointments (shared schedule context). */
  todaysAppointments: AppointmentRow[]
  /** Today's visits still on `scheduled` — a confirmation text still needs to
   *  go out (a subset of todaysAppointments, surfaced as its own number). */
  unconfirmedTodayCount: number
  /** New website leads waiting on the team (shared). */
  newLeadsCount: number
  /** Patients carrying an outstanding PMS balance (shared collections nudge). */
  balances: { count: number; totalCents: number }
  /** The per-patient audit of TOMORROW's schedule — who needs prep and why. */
  tomorrow: DayAudit
}

// ── 8-week personal heartbeat series (Design System law 7) ───────────

export interface ClosedFollowupsPerWeekPoint {
  bucket: string
  value: number
}

/**
 * Follow-ups the signed-in staffer closed per clinic-local week over the
 * trailing 8 weeks (current week included, oldest first) — My Day's single
 * heartbeat (Design System law 7). PERSONAL by design: My Day is a per-staff
 * cockpit, and `patient_followup.completedBy` is stamped by
 * `completeFollowup` on every close, so the attribution is honest — this is
 * the staffer's own encouragement ("you closed 12 this week"), never a
 * team-wide or manager metric. Scoped by organizationId AND completedBy —
 * both non-negotiable.
 *
 * Week boundaries are CLINIC-LOCAL via `clinicWeekStart` (the server runs
 * UTC; a Saturday-night Central close is already Sunday in UTC and must not
 * jump into the next week). Boundaries walk back via "the instant just
 * before this week's start" so each is a true clinic-local Sunday midnight
 * across DST — never naive -7*24h math (mirrors getNewPatientsPerWeek12).
 * One org+user-scoped range scan; bucketing in JS. Bucket labels read like
 * 'Jun 7' (the week's Sunday). `now` is injectable for tests only.
 */
export async function getMyClosedFollowupsPerWeek8(
  organizationId: string,
  userId: string,
  now: Date = new Date(),
): Promise<ClosedFollowupsPerWeekPoint[]> {
  const tz = await getClinicTimeZone(organizationId)

  // The 8 clinic-local week starts, oldest first (DST-safe walk-back).
  const boundaries: Date[] = []
  let cursor = clinicWeekStart(now, tz)
  for (let i = 0; i < 8; i++) {
    boundaries.unshift(cursor)
    cursor = clinicWeekStart(new Date(cursor.getTime() - 1), tz)
  }

  const rows = await db
    .select({ completedAt: schema.patientFollowup.completedAt })
    .from(schema.patientFollowup)
    .where(
      and(
        eq(schema.patientFollowup.organizationId, organizationId),
        eq(schema.patientFollowup.completedBy, userId),
        eq(schema.patientFollowup.status, 'done'),
        isNotNull(schema.patientFollowup.completedAt),
        gte(schema.patientFollowup.completedAt, boundaries[0]),
      ),
    )

  const counts = new Array<number>(8).fill(0)
  for (const r of rows) {
    if (!r.completedAt) continue
    const t = r.completedAt.getTime()
    // Last boundary <= completedAt owns the close.
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (t >= boundaries[i].getTime()) {
        counts[i] += 1
        break
      }
    }
  }

  const label = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
  return boundaries.map((b, i) => ({ bucket: label.format(b), value: counts[i] }))
}

export async function getMyDay(organizationId: string, userId: string): Promise<MyDayData> {
  const now = new Date()
  // Clinic-local day for due-date bucketing (server clock is UTC).
  const today = clinicDayKey(now, await getClinicTimeZone(organizationId))

  const [mine, unclaimed, conversations, todaysAppointments, leadCountRow, balanceRow, tomorrow] = await Promise.all([
    listOpenFollowups(organizationId, { assignedTo: userId }),
    listOpenFollowups(organizationId, { assignedTo: 'unassigned' }),
    listPatientThreads(organizationId, userId, { status: 'open', assignedTo: 'me' }),
    listAppointments(organizationId, { window: 'today' }),
    db
      .select({ n: count() })
      .from(schema.lead)
      .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.status, 'new'))),
    db
      .select({
        n: count(),
        total: sql<number>`coalesce(sum(${schema.patient.pmsBalanceCents}), 0)::bigint`,
      })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          eq(schema.patient.isActive, 1),
          gt(schema.patient.pmsBalanceCents, 0),
        ),
      ),
    auditUpcomingDay(organizationId, { now }),
  ])

  // Merge my + unclaimed follow-ups (disjoint sets), soonest-due first.
  const items = [...mine, ...unclaimed].sort((a, b) => {
    const ad = a.dueDate ?? '9999-12-31'
    const bd = b.dueDate ?? '9999-12-31'
    return ad < bd ? -1 : ad > bd ? 1 : 0
  })
  let overdue = 0
  let dueToday = 0
  for (const f of items) {
    const s = followupDueState(f.dueDate, today)
    if (s === 'overdue') overdue++
    else if (s === 'today') dueToday++
  }

  // Only visits still AHEAD of us need a confirmation text — a scheduled slot
  // that already passed this morning isn't confirmable anymore.
  const unconfirmedTodayCount = todaysAppointments.filter(
    (a) => a.status === 'scheduled' && a.startTime.getTime() >= now.getTime(),
  ).length

  return {
    followups: { overdue, today: dueToday, items: items.slice(0, 30) },
    conversations: conversations.slice(0, 8),
    todaysAppointments: todaysAppointments.slice(0, 30),
    unconfirmedTodayCount,
    newLeadsCount: Number(leadCountRow[0]?.n ?? 0),
    balances: {
      count: Number(balanceRow[0]?.n ?? 0),
      totalCents: Number(balanceRow[0]?.total ?? 0),
    },
    tomorrow,
  }
}
