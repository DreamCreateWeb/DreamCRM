import 'server-only'
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveLoyaltySettings, type LoyaltySettings } from '@/lib/types/loyalty'
import { newId } from '@/lib/utils'
import { netCollectedCents } from '@/lib/net-collected'

/**
 * The loyalty engine. Earning is a DAILY IDEMPOTENT SWEEP (not hooks in five
 * services): for every enabled clinic it scans the last 30 days of completed
 * visits, converted referrals (referred patient's first completed visit),
 * and paid online balance payments, and writes any missing ledger rows —
 * the unique (org, kind, source_id) index makes every source earn exactly
 * once no matter how often the cron runs. Redemption mints a single-use
 * patient-bound shop coupon (source 'loyalty') and writes the negative row
 * in the same breath.
 *
 * REFUNDS (DREAMCRM-32). A balance payment keeps `status = 'paid'` after
 * Stripe sends the money back — that is deliberate (lib/services/refunds.ts)
 * — so the sweep would happily award points for a payment the patient no
 * longer made. Two halves close it, and both are needed because a refund can
 * land on either side of the daily sweep:
 *
 *  - the sweep SKIPS a payment with nothing left on it, so points that were
 *    never earned are never written;
 *  - `reverseLoyaltyForRefundedPayment` takes back points already awarded
 *    when the refund arrives afterwards.
 *
 * A third half arrived with DREAMCRM-47, because a refund can also be UNDONE:
 * Stripe decrements the charge when a refund fails at the bank, so a payment
 * that was fully refunded can stop being fully refunded, and points taken back
 * for money that never left have to go back too
 * (`restoreLoyaltyForUnrefundedPayment`). `syncLoyaltyForRefundedPayment` is
 * the single entry point the refund path calls, so the two directions cannot
 * drift into disagreeing about the same payment.
 *
 * A PARTIAL refund keeps the award. Points per payment are a flat number, not
 * a rate on the amount — the patient did pay, and clawing back the whole
 * award because $10 of $200 came back is a worse answer than leaving it.
 */

const SWEEP_WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// ── Settings ────────────────────────────────────────────────────────────────

export async function getLoyaltySettings(organizationId: string): Promise<LoyaltySettings> {
  const [row] = await db
    .select({ loyalty: schema.clinicProfile.loyalty })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return resolveLoyaltySettings(row?.loyalty ?? null)
}

export async function updateLoyaltySettings(
  organizationId: string,
  settings: LoyaltySettings,
): Promise<LoyaltySettings> {
  const cleaned = resolveLoyaltySettings(settings)
  await db
    .update(schema.clinicProfile)
    .set({ loyalty: cleaned, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
  return cleaned
}

// ── Balance + history ────────────────────────────────────────────────────────

/** The executor a query runs on: the pool, or an open transaction. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function getPointsBalance(
  organizationId: string,
  patientId: string,
  /** Pass the transaction handle when the balance must be read under the same
   *  lock that will spend it (see `redeemLoyaltyPoints`). */
  executor: Executor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`coalesce(sum(${schema.loyaltyEvent.points}), 0)::int` })
    .from(schema.loyaltyEvent)
    .where(
      and(
        eq(schema.loyaltyEvent.organizationId, organizationId),
        eq(schema.loyaltyEvent.patientId, patientId),
      ),
    )
  return row?.total ?? 0
}

export interface LoyaltyEventView {
  id: string
  kind: string
  points: number
  note: string | null
  createdAt: Date
}

export async function listLoyaltyEvents(
  organizationId: string,
  patientId: string,
  limit = 10,
): Promise<LoyaltyEventView[]> {
  return db
    .select({
      id: schema.loyaltyEvent.id,
      kind: schema.loyaltyEvent.kind,
      points: schema.loyaltyEvent.points,
      note: schema.loyaltyEvent.note,
      createdAt: schema.loyaltyEvent.createdAt,
    })
    .from(schema.loyaltyEvent)
    .where(
      and(
        eq(schema.loyaltyEvent.organizationId, organizationId),
        eq(schema.loyaltyEvent.patientId, patientId),
      ),
    )
    .orderBy(desc(schema.loyaltyEvent.createdAt))
    .limit(limit)
}

// ── Earning (the daily sweep) ────────────────────────────────────────────────

async function insertEarn(
  organizationId: string,
  patientId: string,
  kind: 'visit' | 'referral' | 'payment',
  sourceId: string,
  points: number,
  note: string,
): Promise<boolean> {
  if (points <= 0) return false
  try {
    await db.insert(schema.loyaltyEvent).values({
      id: newId('loy'),
      organizationId,
      patientId,
      kind,
      points,
      sourceId,
      note,
    })
    return true
  } catch {
    // Unique (org, kind, source) — already earned. The whole sweep leans on this.
    return false
  }
}

export interface LoyaltyAccrualResult {
  orgsScanned: number
  earned: number
}

/** The daily engine — see the module doc. Demo orgs are skipped: the demo's
 *  visits re-seed with fresh ids on every resync, so a live sweep would
 *  slowly inflate persona balances — the demo showcases seeded ledger rows
 *  instead. */
export async function runLoyaltyAccrual(opts?: { now?: Date }): Promise<LoyaltyAccrualResult> {
  const now = opts?.now ?? new Date()
  const since = new Date(now.getTime() - SWEEP_WINDOW_DAYS * DAY_MS)
  const result: LoyaltyAccrualResult = { orgsScanned: 0, earned: 0 }

  const profiles = await db
    .select({ organizationId: schema.clinicProfile.organizationId, loyalty: schema.clinicProfile.loyalty })
    .from(schema.clinicProfile)
    .where(isNotNull(schema.clinicProfile.loyalty))

  for (const profile of profiles) {
    const settings = resolveLoyaltySettings(profile.loyalty)
    if (!settings.enabled) continue
    const [org] = await db
      .select({ isDemo: schema.organization.isDemo })
      .from(schema.organization)
      .where(eq(schema.organization.id, profile.organizationId))
      .limit(1)
    if (org?.isDemo) continue
    result.orgsScanned++
    const orgId = profile.organizationId

    // 1. Kept visits.
    if (settings.pointsPerVisit > 0) {
      const visits = await db
        .select({ id: schema.appointment.id, patientId: schema.appointment.patientId })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, orgId),
            eq(schema.appointment.status, 'completed'),
            isNotNull(schema.appointment.completedAt),
            gte(schema.appointment.completedAt, since),
          ),
        )
        .limit(1000)
      for (const v of visits) {
        if (!v.patientId) continue
        if (await insertEarn(orgId, v.patientId, 'visit', v.id, settings.pointsPerVisit, 'Kept visit')) {
          result.earned++
        }
      }
    }

    // 2. Converted referrals: the REFERRER earns when a patient they sent
    // completes their first visit (source = the referred patient's id).
    if (settings.pointsPerReferral > 0) {
      const referred = await db
        .select({
          id: schema.patient.id,
          referredByPatientId: schema.patient.referredByPatientId,
          firstName: schema.patient.firstName,
        })
        .from(schema.patient)
        .innerJoin(schema.appointment, eq(schema.appointment.patientId, schema.patient.id))
        .where(
          and(
            eq(schema.patient.organizationId, orgId),
            isNotNull(schema.patient.referredByPatientId),
            eq(schema.appointment.status, 'completed'),
            isNotNull(schema.appointment.completedAt),
            gte(schema.appointment.completedAt, since),
          ),
        )
        .limit(1000)
      const seen = new Set<string>()
      for (const r of referred) {
        if (!r.referredByPatientId || seen.has(r.id)) continue
        seen.add(r.id)
        if (
          await insertEarn(
            orgId,
            r.referredByPatientId,
            'referral',
            r.id,
            settings.pointsPerReferral,
            `Referred ${r.firstName} — first visit kept`,
          )
        ) {
          result.earned++
        }
      }
    }

    // 3. Online balance payments.
    if (settings.pointsPerPayment > 0) {
      const payments = await db
        .select({
          id: schema.patientBalancePayment.id,
          patientId: schema.patientBalancePayment.patientId,
          amountCents: schema.patientBalancePayment.amountCents,
          refundedAmountCents: schema.patientBalancePayment.refundedAmountCents,
        })
        .from(schema.patientBalancePayment)
        .where(
          and(
            eq(schema.patientBalancePayment.organizationId, orgId),
            eq(schema.patientBalancePayment.status, 'paid'),
            gte(schema.patientBalancePayment.paidAt, since),
          ),
        )
        .limit(1000)
      for (const p of payments) {
        // The row stays 'paid' after a refund, so 'paid' is not the question
        // — whether any of it is still the clinic's is. Nothing left means
        // nothing to thank them for.
        if (netCollectedCents(p.amountCents, p.refundedAmountCents) <= 0) continue
        if (await insertEarn(orgId, p.patientId, 'payment', p.id, settings.pointsPerPayment, 'Online payment')) {
          result.earned++
        }
      }
    }
  }

  return result
}

/**
 * Take back the points a balance payment earned, once Stripe has sent ALL of
 * it back. Called from the refund path; returns whether a reversal was
 * written.
 *
 * A compensating NEGATIVE row rather than a delete: the ledger is the
 * patient's own history and a reward that quietly evaporates is worse than
 * one that is visibly returned. `kind: 'reverse'` earns idempotency from the
 * existing unique (org, kind, source_id) index for free — the payment id is
 * the anchor, so a redelivered webhook writes nothing a second time.
 *
 * It mirrors the EARN ROW's point value, not today's settings: a clinic that
 * raised its per-payment award between the payment and the refund must not
 * claw back more than it gave. No earn row (the sweep had not run yet, or the
 * payment was already fully refunded when it did) means there is nothing to
 * reverse, and this is a no-op.
 *
 * The balance CAN go negative if the patient has already spent the points.
 * That is the honest outcome — `redeemLoyaltyPoints` reads the live balance,
 * so they simply cannot redeem again until they have earned it back. Voiding
 * an already-minted coupon would be taking back something the clinic handed
 * over.
 */
export async function reverseLoyaltyForRefundedPayment(
  organizationId: string,
  paymentId: string,
  charge: { amountCents: number; refundedAmountCents: number },
): Promise<boolean> {
  // A partial refund keeps the award — see the module header.
  if (netCollectedCents(charge.amountCents, charge.refundedAmountCents) > 0) return false

  const [earned] = await db
    .select({
      patientId: schema.loyaltyEvent.patientId,
      points: schema.loyaltyEvent.points,
    })
    .from(schema.loyaltyEvent)
    .where(
      and(
        eq(schema.loyaltyEvent.organizationId, organizationId),
        eq(schema.loyaltyEvent.kind, 'payment'),
        eq(schema.loyaltyEvent.sourceId, paymentId),
      ),
    )
    .limit(1)
  if (!earned || earned.points <= 0) return false

  try {
    await db.insert(schema.loyaltyEvent).values({
      id: newId('loy'),
      organizationId,
      patientId: earned.patientId,
      kind: 'reverse',
      points: -earned.points,
      sourceId: paymentId,
      note: 'Online payment refunded — points returned',
    })
    return true
  } catch {
    // Unique (org, 'reverse', paymentId) — already reversed. The whole path
    // leans on this the way the sweep leans on it for earning.
    return false
  }
}

/**
 * Put back points we reversed for a refund that then FAILED (DREAMCRM-47).
 *
 * Stripe decrements a charge's `amount_refunded` when a refund fails at the
 * bank, so a payment that WAS fully refunded can stop being fully refunded.
 * The money never left; the patient earned those points and is owed them.
 *
 * This is the one place in the ledger that DELETES rather than compensating,
 * and the reasoning is the opposite of the reversal's: a compensating positive
 * row would leave the patient's own history reading "refunded, points returned
 * / points re-awarded" for a refund that never happened at all. The reversal
 * row is the record of a thing that turned out not to be true, so it goes.
 * Scoped to `kind = 'reverse'` and this payment: the EARN row is untouched, so
 * the award still traces to the payment that produced it.
 *
 * Returns whether a reversal was actually removed.
 */
export async function restoreLoyaltyForUnrefundedPayment(
  organizationId: string,
  paymentId: string,
  charge: { amountCents: number; refundedAmountCents: number },
): Promise<boolean> {
  // Still fully refunded — the reversal is still correct, leave it alone.
  if (netCollectedCents(charge.amountCents, charge.refundedAmountCents) <= 0) return false

  const removed = await db
    .delete(schema.loyaltyEvent)
    .where(
      and(
        eq(schema.loyaltyEvent.organizationId, organizationId),
        eq(schema.loyaltyEvent.kind, 'reverse'),
        eq(schema.loyaltyEvent.sourceId, paymentId),
      ),
    )
    .returning({ id: schema.loyaltyEvent.id })
  return removed.length > 0
}

/**
 * The refund path's ONE loyalty entry point: reverse, restore, or leave it.
 *
 * Both directions share a single test — "is there anything left collected on
 * this payment?" — and keeping them in one function is what stops the two
 * halves drifting into disagreeing about the same payment.
 */
export async function syncLoyaltyForRefundedPayment(
  organizationId: string,
  paymentId: string,
  charge: { amountCents: number; refundedAmountCents: number },
): Promise<'reversed' | 'restored' | 'unchanged'> {
  if (netCollectedCents(charge.amountCents, charge.refundedAmountCents) > 0) {
    return (await restoreLoyaltyForUnrefundedPayment(organizationId, paymentId, charge))
      ? 'restored'
      : 'unchanged'
  }
  return (await reverseLoyaltyForRefundedPayment(organizationId, paymentId, charge))
    ? 'reversed'
    : 'unchanged'
}

// ── Redemption + adjustment ──────────────────────────────────────────────────

export type RedeemResult =
  | { ok: true; couponCode: string; valueCents: number; newBalance: number }
  | { ok: false; error: string }

/**
 * Redeem points for a single-use, patient-bound shop coupon. Called from the
 * portal (the patient) or the patient record (staff on their behalf).
 *
 * CONCURRENCY: reading the balance and spending it must be one atomic step.
 * Without that, a patient with exactly one reward's worth of points who
 * double-taps "Redeem" (or opens the portal on their phone and laptop at once)
 * gets TWO coupons off ONE balance, driving the ledger negative and handing out
 * money the clinic never agreed to. Both requests read the same balance before
 * either writes its negative row.
 *
 * The fix is the same advisory-lock-then-check idiom the booking path uses for
 * slot double-booking (`insertAppointmentIfBookable`): one transaction, a
 * per-patient `pg_advisory_xact_lock`, and the balance re-read INSIDE it. The
 * second request blocks until the first commits, then sees the spent balance
 * and is turned away. The coupon mint moved inside the transaction too, so a
 * failed mint rolls the ledger row back with the transaction instead of via a
 * compensating delete that could itself fail and burn the points.
 */
export async function redeemLoyaltyPoints(
  organizationId: string,
  patientId: string,
): Promise<RedeemResult> {
  const settings = await getLoyaltySettings(organizationId)
  if (!settings.enabled) return { ok: false, error: 'The rewards program isn’t active right now.' }

  const lockText = `loyalty:${organizationId}:${patientId}`
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockText}))`)

      // Re-read under the lock — this is the value that gets spent.
      const balance = await getPointsBalance(organizationId, patientId, tx)
      if (balance < settings.redeemPoints) {
        return {
          ok: false as const,
          error: `You need ${settings.redeemPoints} points to redeem — you have ${balance}.`,
        }
      }

      const eventId = newId('loy')
      const code = `REWARD-${newId('x').slice(-6).toUpperCase()}`
      await tx.insert(schema.loyaltyEvent).values({
        id: eventId,
        organizationId,
        patientId,
        kind: 'redeem',
        points: -settings.redeemPoints,
        sourceId: eventId,
        note: `Redeemed for ${fmtDollars(settings.redeemValueCents)} off in the shop (${code})`,
      })
      await tx.insert(schema.shopCoupon).values({
        id: newId('coupon'),
        organizationId,
        code,
        discountType: 'amount',
        discountValue: settings.redeemValueCents,
        patientId,
        source: 'loyalty',
        singleUse: 1,
        expiresAt: new Date(Date.now() + 365 * DAY_MS),
      })

      return {
        ok: true as const,
        couponCode: code,
        valueCents: settings.redeemValueCents,
        newBalance: balance - settings.redeemPoints,
      }
    })
  } catch (err) {
    // Nothing was committed — the points are still on the card.
    console.warn('[loyalty] redemption failed; nothing was spent', err)
    return { ok: false, error: 'Could not create your reward code — please try again.' }
  }
}

/** Staff adjustment (+/-) with a required note — comps, corrections. */
export async function adjustLoyaltyPoints(
  organizationId: string,
  patientId: string,
  points: number,
  note: string,
  createdByUserId: string,
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string }> {
  const delta = Math.round(points)
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 10_000) {
    return { ok: false, error: 'Enter a point amount (±10,000 max).' }
  }
  if (!note.trim()) return { ok: false, error: 'Add a short note — future-you will thank you.' }
  // The patientId is caller-supplied; confirm it belongs to this org before
  // writing, so a stale/foreign id can't create an orphan ledger row (matches
  // the guard in patient-notes / patient-tags).
  const [owner] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, patientId), eq(schema.patient.organizationId, organizationId)))
    .limit(1)
  if (!owner) return { ok: false, error: 'Patient not found in this organization.' }
  const eventId = newId('loy')
  await db.insert(schema.loyaltyEvent).values({
    id: eventId,
    organizationId,
    patientId,
    kind: 'adjust',
    points: delta,
    sourceId: eventId,
    note: note.trim().slice(0, 300),
    createdByUserId,
  })
  return { ok: true, newBalance: await getPointsBalance(organizationId, patientId) }
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
