import 'server-only'
import { and, eq, gte, lt, ne, sql, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { MetricKey } from '@/lib/metrics-registry'
import { BACKFILL_PATIENT_SOURCES } from '@/lib/patient-acquisition'
import { getRecallStats } from '@/lib/services/recall-stats'
import { getPmsLink } from '@/lib/services/pms-link'
import { pmsConnected } from '@/lib/pms-link'
import { getMrrSnapshot } from '@/lib/services/platform-metrics'

/**
 * THE METRIC READERS (ML-38) — one per registry key, each computing ONE
 * bucket's honest number from the live tables. `null` means "the source has
 * nothing true to say" and the writer writes no row (a gap, never a zero).
 *
 * A reader gets the bucket's absolute window `[from, to)` — clinic-local day
 * bounds for an org, UTC day / hour bounds for the platform — so a FLOW is
 * counted over exactly that window; a STOCK ignores the window and reads the
 * standing number now (the writer runs on the first tick after the day
 * closes). Every org read filters by `organization_id`.
 */

export interface OrgReadCtx {
  organizationId: string
  from: Date
  to: Date
}
export interface PlatformReadCtx {
  from: Date
  to: Date
}

type OrgKey = 'recall_due_reachable' | 'recall_sent' | 'recall_opened' | 'recall_booked' | 'reviews_requested' | 'reviews_received' | 'new_patients' | 'visits' | 'bookings' | 'revenue_collected' | 'outstanding_balance'
type PlatformKey = Exclude<MetricKey, OrgKey>

async function countRows(q: PromiseLike<Array<{ n: number | string | null }>>): Promise<number> {
  const [row] = await q
  return Number(row?.n ?? 0)
}

/** Distinct PEOPLE (patient, else address) with a campaign event of `type` in the window. */
async function campaignPeople(ctx: OrgReadCtx, type: 'sent' | 'open' | 'booked'): Promise<number> {
  return countRows(
    db
      .select({ n: sql<number>`count(distinct coalesce(${schema.campaignEvents.patientId}, ${schema.campaignEvents.recipientEmail}, ${schema.campaignEvents.recipientPhone}))::int` })
      .from(schema.campaignEvents)
      .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
      .where(
        and(
          eq(schema.campaigns.organizationId, ctx.organizationId),
          eq(schema.campaignEvents.type, type),
          gte(schema.campaignEvents.occurredAt, ctx.from),
          lt(schema.campaignEvents.occurredAt, ctx.to),
        ),
      ),
  )
}

export const ORG_READERS: Record<OrgKey, (ctx: OrgReadCtx) => Promise<number | null>> = {
  recall_due_reachable: async (ctx) => (await getRecallStats(ctx.organizationId)).recallDueReachableCount,
  recall_sent: (ctx) => campaignPeople(ctx, 'sent'),
  recall_opened: (ctx) => campaignPeople(ctx, 'open'),
  recall_booked: (ctx) => campaignPeople(ctx, 'booked'),

  reviews_requested: (ctx) =>
    countRows(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.reviewRequest)
        .where(
          and(
            eq(schema.reviewRequest.organizationId, ctx.organizationId),
            gte(schema.reviewRequest.createdAt, ctx.from),
            lt(schema.reviewRequest.createdAt, ctx.to),
          ),
        ),
    ),
  reviews_received: (ctx) =>
    countRows(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.reviewRequest)
        .where(
          and(
            eq(schema.reviewRequest.organizationId, ctx.organizationId),
            isNotNull(schema.reviewRequest.completedAt),
            gte(schema.reviewRequest.completedAt, ctx.from),
            lt(schema.reviewRequest.completedAt, ctx.to),
          ),
        ),
    ),

  // Same definition as Analytics: first seen in the window, not archived,
  // and not a bulk PMS/CSV backfill (their firstSeenAt is the import time).
  new_patients: async (ctx) => {
    const rows = await db
      .select({ source: schema.patient.source })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, ctx.organizationId),
          isNotNull(schema.patient.firstSeenAt),
          gte(schema.patient.firstSeenAt, ctx.from),
          lt(schema.patient.firstSeenAt, ctx.to),
          ne(schema.patient.lifecycle, 'archived'),
        ),
      )
    return rows.filter((r) => !BACKFILL_PATIENT_SOURCES.has(r.source ?? '')).length
  },
  visits: (ctx) =>
    countRows(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, ctx.organizationId),
            eq(schema.appointment.status, 'completed'),
            gte(schema.appointment.startTime, ctx.from),
            lt(schema.appointment.startTime, ctx.to),
          ),
        ),
    ),
  bookings: (ctx) =>
    countRows(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, ctx.organizationId),
            gte(schema.appointment.createdAt, ctx.from),
            lt(schema.appointment.createdAt, ctx.to),
          ),
        ),
    ),
  // Online balance payments that landed (Stripe Connect). The PMS's own
  // collections are not ours to state.
  revenue_collected: (ctx) =>
    countRows(
      db
        .select({ n: sql<number>`coalesce(sum(${schema.patientBalancePayment.amountCents}), 0)::bigint` })
        .from(schema.patientBalancePayment)
        .where(
          and(
            eq(schema.patientBalancePayment.organizationId, ctx.organizationId),
            eq(schema.patientBalancePayment.status, 'paid'),
            isNotNull(schema.patientBalancePayment.paidAt),
            gte(schema.patientBalancePayment.paidAt, ctx.from),
            lt(schema.patientBalancePayment.paidAt, ctx.to),
          ),
        ),
    ),
  // PMS-sourced: a practice with no PMS has no balance to state.
  outstanding_balance: async (ctx) => {
    if (!pmsConnected(await getPmsLink(ctx.organizationId))) return null
    return countRows(
      db
        .select({ n: sql<number>`coalesce(sum(${schema.patient.pmsBalanceCents}), 0)::bigint` })
        .from(schema.patient)
        .where(and(eq(schema.patient.organizationId, ctx.organizationId), sql`${schema.patient.pmsBalanceCents} > 0`)),
    )
  },
}

export const PLATFORM_READERS: Record<PlatformKey, (ctx: PlatformReadCtx) => Promise<number | null>> = {
  // Stripe unreachable = unknown, not zero.
  mrr: async () => {
    const s = await getMrrSnapshot()
    return s.stripeUnavailable ? null : s.monthlyRecurringCents
  },
  active_clinics: async () => {
    const s = await getMrrSnapshot()
    return s.stripeUnavailable ? null : s.activeClinics
  },
  hunt_sent: (ctx) =>
    countRows(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.outreachTouchLog)
        .where(
          and(
            // Real sends only — a dry run is not outreach.
            sql`${schema.outreachTouchLog.channel} in ('resend', 'gmail')`,
            gte(schema.outreachTouchLog.sentAt, ctx.from),
            lt(schema.outreachTouchLog.sentAt, ctx.to),
          ),
        ),
    ),
}
