import 'server-only'
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { derivePatientRecallStatus } from '@/lib/services/recall-status'
import { getClinicCadence } from '@/lib/services/clinic-cadence'
import { lapsedCutoff as lapsedCutoffDate, startOfMonth } from '@/lib/dates'

/**
 * Recall & Outreach dashboard service. Returns the morning-huddle-style
 * stats a clinic owner uses to answer "what does recall need from us
 * this week?" — counts, not vanity. Pulls from `patient` + `appointment`
 * + `campaign` + `campaign_events` (clinic-owned tables); never from
 * `customers` (the SaaS lead pipeline, not relevant to clinic recall).
 *
 * Mirrors the morning-huddle pattern from clinic-overview.ts: every
 * number must drill to a list. Vanity metrics (6-month charts,
 * deliverability percentages, "engagement scores") are kept out.
 */

export interface RecallStats {
  /** Patients overdue for a cleaning (recall_due + recall_overdue). */
  recallDueCount: number
  /** Subset of recallDueCount that have email opt-in (i.e. reachable). */
  recallDueReachableCount: number
  /** Patients lapsed (no visit for the clinic's lapsed-after-months, default
   *  18, + no future booking). Matches the Patients list 💤 derivation. */
  lapsedCount: number
  lapsedReachableCount: number
  /** Patients with lifecycle='new' AND first visit in the last 60 days
   * (the "welcome window"). */
  newPatientsCount: number
  /** Patients with a birthday in the current calendar month. */
  birthdayThisMonthCount: number
  /** Campaign sends across all campaigns this calendar month. */
  sentThisMonthCount: number
  /** Booked-outcome events in the last 30 days. */
  bookedFromRecallCount: number
  /** Open events as percentage of sent events in last 30 days (0-100). */
  openRate30d: number | null
  /** Click events as percentage of sent events in last 30 days (0-100). */
  clickRate30d: number | null
  /** Patients opted-out of marketing email. */
  optedOutCount: number
  /** Total marketable patients (email opt-in, lifecycle != archived). */
  marketableCount: number
  /** Scheduled campaigns in the next 14 days, sorted by date. */
  upcomingSends: UpcomingSendRow[]
  /** Recently sent campaigns in the last 30 days. */
  recentSends: RecentSendRow[]
  /** Most-recent 8 campaign events (mixed types) for the activity feed. */
  recentActivity: RecallActivityRow[]
}

export interface UpcomingSendRow {
  id: number
  name: string
  subject: string | null
  scheduledAt: Date
  audienceName: string | null
  audienceRecipientCount: number | null
}

export interface RecentSendRow {
  id: number
  name: string
  subject: string | null
  sentAt: Date
  sent: number
  opened: number
  clicked: number
  booked: number
  audienceName: string | null
}

export type RecallActivityKind =
  | 'campaign_sent'
  | 'campaign_opened'
  | 'campaign_clicked'
  | 'campaign_booked'
  | 'patient_opted_out'

export interface RecallActivityRow {
  id: string
  kind: RecallActivityKind
  occurredAt: Date
  patientName: string | null
  patientId: string | null
  campaignName: string | null
  campaignId: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function getRecallStats(organizationId: string): Promise<RecallStats> {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS)
  const fourteenDaysAhead = new Date(now.getTime() + 14 * DAY_MS)

  // Recall "due"/"lapsed" must match what the Patients list + Analytics show:
  // honor the clinic's configured recall + lapsed cadence (Settings → Practice)
  // AND prefer the PMS-synced recall date when present. Reading the cadence
  // once and routing every patient through derivePatientRecallStatus keeps the
  // "who's due?" number identical across /marketing, /patients, and /analytics.
  const cadence = await getClinicCadence(organizationId)
  const lapsedCutoff = lapsedCutoffDate(now, cadence.lapsedMonths)

  // Pull patients with the fields we need to derive recall status. We
  // group + bucket in JS rather than as 5 separate SQL queries to keep
  // the request count predictable.
  const patientRows = await db
    .select({
      id: schema.patient.id,
      email: schema.patient.email,
      dateOfBirth: schema.patient.dateOfBirth,
      lifecycle: schema.patient.lifecycle,
      isActive: schema.patient.isActive,
      firstSeenAt: schema.patient.firstSeenAt,
      marketingEmailOptIn: schema.patient.marketingEmailOptIn,
      pmsRecallDueAt: schema.patient.pmsRecallDueAt,
      recallIntervalMonths: schema.patient.recallIntervalMonths,
    })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))

  const ids = patientRows.map((p) => p.id)

  // Last visit + next visit lookups (parallel). Reuse the same predicate
  // shape as patients.ts: completed/confirmed past visits, future
  // non-cancelled appointments.
  const [lastVisits, nextVisits, campaignEventsLast30, upcomingCampaigns, recentCampaigns] =
    ids.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
          db
            .select({ patientId: schema.appointment.patientId, startTime: schema.appointment.startTime })
            .from(schema.appointment)
            .where(
              and(
                eq(schema.appointment.organizationId, organizationId),
                inArray(schema.appointment.patientId, ids),
                lte(schema.appointment.startTime, now),
                ne(schema.appointment.status, 'cancelled'),
                ne(schema.appointment.status, 'no_show'),
              ),
            ),
          db
            .select({ patientId: schema.appointment.patientId, startTime: schema.appointment.startTime })
            .from(schema.appointment)
            .where(
              and(
                eq(schema.appointment.organizationId, organizationId),
                inArray(schema.appointment.patientId, ids),
                gte(schema.appointment.startTime, now),
                ne(schema.appointment.status, 'cancelled'),
                ne(schema.appointment.status, 'no_show'),
              ),
            ),
          // Campaign events for THIS org's campaigns in the last 30 days.
          // Joined to campaigns to scope by org.
          db
            .select({
              type: schema.campaignEvents.type,
              patientId: schema.campaignEvents.patientId,
              campaignId: schema.campaignEvents.campaignId,
              campaignName: schema.campaigns.name,
              occurredAt: schema.campaignEvents.occurredAt,
            })
            .from(schema.campaignEvents)
            .innerJoin(schema.campaigns, eq(schema.campaignEvents.campaignId, schema.campaigns.id))
            .where(
              and(
                eq(schema.campaigns.organizationId, organizationId),
                gte(schema.campaignEvents.occurredAt, thirtyDaysAgo),
              ),
            ),
          // Upcoming scheduled sends (next 14d).
          db
            .select({
              id: schema.campaigns.id,
              name: schema.campaigns.name,
              subject: schema.campaigns.subject,
              scheduledAt: schema.campaigns.scheduledAt,
              audienceId: schema.campaigns.audienceId,
            })
            .from(schema.campaigns)
            .where(
              and(
                eq(schema.campaigns.organizationId, organizationId),
                eq(schema.campaigns.status, 'scheduled'),
                gte(schema.campaigns.scheduledAt, now),
                lte(schema.campaigns.scheduledAt, fourteenDaysAhead),
              ),
            ),
          // Recent sent campaigns (last 30d).
          db
            .select({
              id: schema.campaigns.id,
              name: schema.campaigns.name,
              subject: schema.campaigns.subject,
              sentAt: schema.campaigns.sentAt,
              audienceId: schema.campaigns.audienceId,
            })
            .from(schema.campaigns)
            .where(
              and(
                eq(schema.campaigns.organizationId, organizationId),
                eq(schema.campaigns.status, 'completed'),
                gte(schema.campaigns.sentAt, thirtyDaysAgo),
              ),
            ),
        ])

  const lastVisitMap = new Map<string, Date>()
  for (const r of lastVisits) {
    const prev = lastVisitMap.get(r.patientId)
    if (!prev || r.startTime > prev) lastVisitMap.set(r.patientId, r.startTime)
  }
  const nextVisitSet = new Set(nextVisits.map((r) => r.patientId))

  // Bucket patients.
  let recallDueCount = 0
  let recallDueReachable = 0
  let lapsedCount = 0
  let lapsedReachable = 0
  let newPatientsCount = 0
  let birthdayThisMonthCount = 0
  let optedOutCount = 0
  let marketableCount = 0

  for (const p of patientRows) {
    if (p.isActive === 0) continue // archived
    if (p.marketingEmailOptIn === 0) optedOutCount++
    else if (p.email) marketableCount++

    const lastVisit = lastVisitMap.get(p.id) ?? null
    const hasFuture = nextVisitSet.has(p.id)

    // Recall status + lapsed both come from the SAME shared derivation the
    // Patients list + Analytics use, so the counts can't diverge. recallStatus
    // honors the PMS recall date + the clinic's recall interval; lapsed honors
    // the clinic's lapsed-after-months. (A future booking suppresses both.)
    const recallStatus = derivePatientRecallStatus({
      pmsRecallDueAt: p.pmsRecallDueAt,
      hasUpcomingAppt: hasFuture,
      hasAnyFutureAppt: hasFuture,
      lastVisitAt: lastVisit,
      now,
      intervalMonths: p.recallIntervalMonths ?? cadence.recallMonths,
    })
    const isRecallDue = recallStatus === 'due' || recallStatus === 'overdue'
    const lapsed = !!lastVisit && lastVisit < lapsedCutoff && !hasFuture

    if (lapsed) {
      lapsedCount++
      if (p.marketingEmailOptIn === 1 && p.email) lapsedReachable++
    }
    // recallDueCount keeps its original "due ∪ lapsed" contract (a lapsed
    // patient counts as needing recall even in an odd cadence config).
    if (isRecallDue || lapsed) {
      recallDueCount++
      if (p.marketingEmailOptIn === 1 && p.email) recallDueReachable++
    }

    if (p.lifecycle === 'new' && p.firstSeenAt && (now.getTime() - p.firstSeenAt.getTime()) < 60 * DAY_MS) {
      newPatientsCount++
    }

    if (p.dateOfBirth) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.dateOfBirth)
      if (m && parseInt(m[2], 10) - 1 === now.getMonth()) {
        birthdayThisMonthCount++
      }
    }
  }

  // Roll up campaign event counts.
  let sentThisMonthCount = 0
  let openedLast30 = 0
  let clickedLast30 = 0
  let sentLast30 = 0
  let bookedFromRecallCount = 0
  for (const e of campaignEventsLast30) {
    if (e.type === 'sent' && e.occurredAt >= monthStart) sentThisMonthCount++
    if (e.type === 'sent') sentLast30++
    if (e.type === 'open') openedLast30++
    if (e.type === 'click') clickedLast30++
    if (e.type === 'booked') bookedFromRecallCount++
  }

  const openRate30d = sentLast30 > 0 ? Math.round((openedLast30 / sentLast30) * 100) : null
  const clickRate30d = sentLast30 > 0 ? Math.round((clickedLast30 / sentLast30) * 100) : null

  // Audience names for upcoming + recent send rows. Single query, fan out
  // to whichever campaigns reference them.
  const audienceIds = new Set<number>()
  for (const c of upcomingCampaigns) if (c.audienceId) audienceIds.add(c.audienceId)
  for (const c of recentCampaigns) if (c.audienceId) audienceIds.add(c.audienceId)

  const audienceRows = audienceIds.size === 0
    ? []
    : await db
        .select({ id: schema.audiences.id, name: schema.audiences.name })
        .from(schema.audiences)
        .where(
          and(
            eq(schema.audiences.organizationId, organizationId),
            inArray(schema.audiences.id, Array.from(audienceIds)),
          ),
        )
  const audienceNameById = new Map(audienceRows.map((a) => [a.id, a.name]))

  // Per-campaign event aggregation for recent sends.
  const eventsByCampaign = new Map<number, { sent: number; opened: number; clicked: number; booked: number }>()
  for (const e of campaignEventsLast30) {
    const cur = eventsByCampaign.get(e.campaignId) ?? { sent: 0, opened: 0, clicked: 0, booked: 0 }
    if (e.type === 'sent') cur.sent++
    else if (e.type === 'open') cur.opened++
    else if (e.type === 'click') cur.clicked++
    else if (e.type === 'booked') cur.booked++
    eventsByCampaign.set(e.campaignId, cur)
  }

  const upcomingSends: UpcomingSendRow[] = upcomingCampaigns
    .filter((c): c is typeof c & { scheduledAt: Date } => !!c.scheduledAt)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .map((c) => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      scheduledAt: c.scheduledAt,
      audienceName: c.audienceId ? audienceNameById.get(c.audienceId) ?? null : null,
      audienceRecipientCount: null, // computed lazily by the page if needed
    }))

  const recentSends: RecentSendRow[] = recentCampaigns
    .filter((c): c is typeof c & { sentAt: Date } => !!c.sentAt)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .map((c) => {
      const ev = eventsByCampaign.get(c.id) ?? { sent: 0, opened: 0, clicked: 0, booked: 0 }
      return {
        id: c.id,
        name: c.name,
        subject: c.subject,
        sentAt: c.sentAt,
        sent: ev.sent,
        opened: ev.opened,
        clicked: ev.clicked,
        booked: ev.booked,
        audienceName: c.audienceId ? audienceNameById.get(c.audienceId) ?? null : null,
      }
    })

  // Recent activity feed: most-recent 8 events of any meaningful type,
  // with patient name resolution. We fetch patient names in one batch.
  const recentEvents = [...campaignEventsLast30]
    .filter((e) => ['sent', 'open', 'click', 'booked'].includes(e.type))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 8)
  const patientIdsInActivity = recentEvents
    .map((e) => e.patientId)
    .filter((id): id is string => !!id)
  const patientNameMap = new Map<string, string>()
  if (patientIdsInActivity.length > 0) {
    const rows = await db
      .select({
        id: schema.patient.id,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
      })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          inArray(schema.patient.id, patientIdsInActivity),
        ),
      )
    for (const r of rows) {
      patientNameMap.set(r.id, `${r.firstName} ${r.lastName}`.trim())
    }
  }
  const kindOf: Record<string, RecallActivityKind | undefined> = {
    sent: 'campaign_sent',
    open: 'campaign_opened',
    click: 'campaign_clicked',
    booked: 'campaign_booked',
  }
  const recentActivity: RecallActivityRow[] = recentEvents.map((e, i) => ({
    id: `${e.campaignId}-${e.patientId ?? 'cust'}-${e.type}-${e.occurredAt.getTime()}-${i}`,
    kind: kindOf[e.type] ?? 'campaign_sent',
    occurredAt: e.occurredAt,
    patientName: e.patientId ? patientNameMap.get(e.patientId) ?? null : null,
    patientId: e.patientId,
    campaignName: e.campaignName,
    campaignId: e.campaignId,
  }))

  return {
    recallDueCount,
    recallDueReachableCount: recallDueReachable,
    lapsedCount,
    lapsedReachableCount: lapsedReachable,
    newPatientsCount,
    birthdayThisMonthCount,
    sentThisMonthCount,
    bookedFromRecallCount,
    openRate30d,
    clickRate30d,
    optedOutCount,
    marketableCount,
    upcomingSends,
    recentSends,
    recentActivity,
  }
}
