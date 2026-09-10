import 'server-only'
import { and, desc, eq, gt, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicMonthStart } from '@/lib/clinic-timezone'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'

/**
 * The Collections board (/payments/collections) — every patient carrying a PMS
 * balance, with their dunning state in one glance: how much, whether a pay
 * link has gone out (and whether it got paid), and when they last paid
 * online. This is a WORKBOARD, not an aging report: the PMS gives us a
 * point-in-time balance only, so honest aging buckets (30/60/90) wait for an
 * aging data source — the page says so instead of faking it.
 *
 * Balance truth: patient.pms_balance_cents, written by the PMS sync. We never
 * mutate it — a paid Stripe payment shows here until the next sync (and the
 * front desk posts it to the ledger).
 */

export interface CollectionsRow {
  patientId: string
  name: string
  hasEmail: boolean
  balanceCents: number
  /** Latest pay-link request for this patient, if any. */
  payLink: { status: 'sent' | 'paid'; sentAt: Date } | null
  /** Most recent completed online balance payment. */
  lastPaidAt: Date | null
  lastPaidCents: number | null
}

export interface CollectionsBoard {
  totalOutstandingCents: number
  patientCount: number
  /** Online balance payments collected this clinic-local month. */
  collectedThisMonthCents: number
  /** Patients CARRYING A BALANCE with a pay link already out — whole clinic,
   *  so it is comparable with patientCount above. */
  withLinkOut: number
  /** The rows below are the top BOARD_LIMIT balances. True when the clinic
   *  has more open balances than that, so the page can say so. */
  truncated: boolean
  rows: CollectionsRow[]
}

/** Light aggregate for the Shop hub's Collections doorway card — one query,
 *  no rows: how many active patients carry a PMS balance, and the total. */
export interface CollectionsSnapshot {
  patientCount: number
  totalOutstandingCents: number
}

export async function getCollectionsSnapshot(
  organizationId: string,
): Promise<CollectionsSnapshot> {
  const [row] = await db
    .select({
      patientCount: sql<number>`count(*)::int`,
      // ::bigint, not ::int — sum() over an int4 column already returns
      // bigint, and casting back would ERROR (not wrap) on a practice
      // carrying over ~$21M. This aggregate now feeds the board header too.
      totalOutstandingCents: sql<number>`coalesce(sum(${schema.patient.pmsBalanceCents}), 0)::bigint`,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        eq(schema.patient.isActive, 1),
        isNull(schema.patient.mergedIntoPatientId),
        gt(schema.patient.pmsBalanceCents, 0),
      ),
    )
  return {
    patientCount: row?.patientCount ?? 0,
    totalOutstandingCents: Number(row?.totalOutstandingCents ?? 0),
  }
}

// The board shows the biggest balances, not all of them — a dunning workboard
// is worked from the top. The HEADER, though, is a whole-clinic fact: it once
// reduced over this page and quietly reported patient 201+ as not existing.
const BOARD_LIMIT = 200

export async function getCollectionsBoard(
  organizationId: string,
  opts?: { now?: Date },
): Promise<CollectionsBoard> {
  const now = opts?.now ?? new Date()

  // The header totals are the WHOLE clinic, computed in SQL — the same
  // aggregate the Payments hub's doorway card reads, so the two surfaces
  // cannot disagree. Reducing over the 200-row page below would report a
  // clinic's outstanding AR as whatever its top 200 debtors happen to owe.
  const snapshot = await getCollectionsSnapshot(organizationId)

  // "N of M have a pay link" has to count the same M. Reducing this over the
  // page while patientCount is whole-clinic would read "12 of 340" on a
  // board that only ever looked at 200 people.
  const [linkedOut] = await db
    .select({
      count: sql<number>`count(distinct ${schema.patient.id})::int`,
    })
    .from(schema.patient)
    .innerJoin(
      schema.balancePaymentRequest,
      and(
        eq(schema.balancePaymentRequest.patientId, schema.patient.id),
        eq(schema.balancePaymentRequest.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        eq(schema.patient.isActive, 1),
        isNull(schema.patient.mergedIntoPatientId),
        gt(schema.patient.pmsBalanceCents, 0),
      ),
    )

  // The rows themselves: the biggest balances first, active relationships
  // only (archived patients belong to a different conversation than a
  // dunning board).
  const patients = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      balanceCents: schema.patient.pmsBalanceCents,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        eq(schema.patient.isActive, 1),
        isNull(schema.patient.mergedIntoPatientId),
        gt(schema.patient.pmsBalanceCents, 0),
      ),
    )
    .orderBy(desc(schema.patient.pmsBalanceCents))
    .limit(BOARD_LIMIT)

  const patientIds = patients.map((p) => p.id)

  // Latest pay-link request + latest completed payment per patient, batched.
  const requests = patientIds.length
    ? await db
        .select({
          patientId: schema.balancePaymentRequest.patientId,
          status: schema.balancePaymentRequest.status,
          sentAt: schema.balancePaymentRequest.sentAt,
        })
        .from(schema.balancePaymentRequest)
        .where(
          and(
            eq(schema.balancePaymentRequest.organizationId, organizationId),
            inArray(schema.balancePaymentRequest.patientId, patientIds),
          ),
        )
        .orderBy(desc(schema.balancePaymentRequest.sentAt))
    : []
  const latestRequest = new Map<string, { status: 'sent' | 'paid'; sentAt: Date }>()
  for (const r of requests) {
    if (!latestRequest.has(r.patientId)) {
      latestRequest.set(r.patientId, { status: r.status === 'paid' ? 'paid' : 'sent', sentAt: r.sentAt })
    }
  }

  const payments = patientIds.length
    ? await db
        .select({
          patientId: schema.patientBalancePayment.patientId,
          amountCents: schema.patientBalancePayment.amountCents,
          paidAt: schema.patientBalancePayment.paidAt,
        })
        .from(schema.patientBalancePayment)
        .where(
          and(
            eq(schema.patientBalancePayment.organizationId, organizationId),
            eq(schema.patientBalancePayment.status, 'paid'),
            inArray(schema.patientBalancePayment.patientId, patientIds),
          ),
        )
        .orderBy(desc(schema.patientBalancePayment.paidAt))
    : []
  const latestPayment = new Map<string, { amountCents: number; paidAt: Date | null }>()
  for (const p of payments) {
    if (!latestPayment.has(p.patientId)) {
      latestPayment.set(p.patientId, { amountCents: p.amountCents, paidAt: p.paidAt })
    }
  }

  // Collected this clinic-local month — across ALL patients, not just the
  // board (a paid-off patient leaves the board; their payment still counts).
  const tz = await getClinicTimeZone(organizationId)
  const monthStart = clinicMonthStart(now, tz)
  const [collected] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.patientBalancePayment.amountCents}), 0)::bigint`,
    })
    .from(schema.patientBalancePayment)
    .where(
      and(
        eq(schema.patientBalancePayment.organizationId, organizationId),
        eq(schema.patientBalancePayment.status, 'paid'),
        gte(schema.patientBalancePayment.paidAt, monthStart),
      ),
    )

  const rows: CollectionsRow[] = patients.map((p) => {
    const pay = latestPayment.get(p.id) ?? null
    return {
      patientId: p.id,
      name: `${p.firstName} ${p.lastName ?? ''}`.trim(),
      hasEmail: !!p.email,
      balanceCents: p.balanceCents ?? 0,
      payLink: latestRequest.get(p.id) ?? null,
      lastPaidAt: pay?.paidAt ?? null,
      lastPaidCents: pay?.amountCents ?? null,
    }
  })

  return {
    totalOutstandingCents: snapshot.totalOutstandingCents,
    patientCount: snapshot.patientCount,
    collectedThisMonthCents: Number(collected?.total ?? 0),
    withLinkOut: linkedOut?.count ?? 0,
    truncated: snapshot.patientCount > rows.length,
    rows,
  }
}
