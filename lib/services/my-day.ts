import 'server-only'
import { and, count, eq, gt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { listOpenFollowups, type PatientFollowupView } from '@/lib/services/patient-followups'
import { listPatientThreads, type ThreadRow } from '@/lib/services/patient-messaging'
import { listAppointments, type AppointmentRow } from '@/lib/services/appointments'
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
}

export async function getMyDay(organizationId: string, userId: string): Promise<MyDayData> {
  const now = new Date()
  // Clinic-local day for due-date bucketing (server clock is UTC).
  const today = clinicDayKey(now, await getClinicTimeZone(organizationId))

  const [mine, unclaimed, conversations, todaysAppointments, leadCountRow, balanceRow] = await Promise.all([
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
  }
}
