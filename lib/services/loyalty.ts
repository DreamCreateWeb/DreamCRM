import 'server-only'
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveLoyaltySettings, type LoyaltySettings } from '@/lib/types/loyalty'
import { newId } from '@/lib/utils'

/**
 * The loyalty engine. Earning is a DAILY IDEMPOTENT SWEEP (not hooks in five
 * services): for every enabled clinic it scans the last 30 days of completed
 * visits, converted referrals (referred patient's first completed visit),
 * and paid online balance payments, and writes any missing ledger rows —
 * the unique (org, kind, source_id) index makes every source earn exactly
 * once no matter how often the cron runs. Redemption mints a single-use
 * patient-bound shop coupon (source 'loyalty') and writes the negative row
 * in the same breath.
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

export async function getPointsBalance(organizationId: string, patientId: string): Promise<number> {
  const [row] = await db
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
        .select({ id: schema.patientBalancePayment.id, patientId: schema.patientBalancePayment.patientId })
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
        if (await insertEarn(orgId, p.patientId, 'payment', p.id, settings.pointsPerPayment, 'Online payment')) {
          result.earned++
        }
      }
    }
  }

  return result
}

// ── Redemption + adjustment ──────────────────────────────────────────────────

export type RedeemResult =
  | { ok: true; couponCode: string; valueCents: number; newBalance: number }
  | { ok: false; error: string }

/** Redeem points for a single-use, patient-bound shop coupon. Called from the
 *  portal (the patient) or the patient record (staff on their behalf). */
export async function redeemLoyaltyPoints(
  organizationId: string,
  patientId: string,
): Promise<RedeemResult> {
  const settings = await getLoyaltySettings(organizationId)
  if (!settings.enabled) return { ok: false, error: 'The rewards program isn’t active right now.' }

  const balance = await getPointsBalance(organizationId, patientId)
  if (balance < settings.redeemPoints) {
    return { ok: false, error: `You need ${settings.redeemPoints} points to redeem — you have ${balance}.` }
  }

  // Write the NEGATIVE ledger row first (its unique event id is the coupon's
  // anchor); if the coupon insert then fails, remove the row again so points
  // are never burned without a coupon in hand.
  const eventId = newId('loy')
  const code = `REWARD-${newId('x').slice(-6).toUpperCase()}`
  await db.insert(schema.loyaltyEvent).values({
    id: eventId,
    organizationId,
    patientId,
    kind: 'redeem',
    points: -settings.redeemPoints,
    sourceId: eventId,
    note: `Redeemed for ${fmtDollars(settings.redeemValueCents)} off in the shop (${code})`,
  })
  try {
    await db.insert(schema.shopCoupon).values({
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
  } catch (err) {
    await db.delete(schema.loyaltyEvent).where(eq(schema.loyaltyEvent.id, eventId))
    console.warn('[loyalty] coupon mint failed; redemption rolled back', err)
    return { ok: false, error: 'Could not create your reward code — please try again.' }
  }

  return {
    ok: true,
    couponCode: code,
    valueCents: settings.redeemValueCents,
    newBalance: balance - settings.redeemPoints,
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
