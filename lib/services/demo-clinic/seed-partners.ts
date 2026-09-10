import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { buildPatientPersonas } from './personas'

// The referral partner, and the money-coherence pass over seeded totals.

// ── Money-coherence self-heal (idempotent) ──────────────────────────────────
// Ensures a legacy demo has the data the new money surfaces render against:
//   • a PAID + UNFULFILLED shop order (Overview "Orders to fulfill" card)
//   • an online balance payment (the /payments/online reconciliation page +
//     the patient timeline "Paid $X toward balance online" event)
// Both link to a real seeded patient so the patient-detail timeline shows them.
// No-ops when the rows already exist, so it's safe to run on every entry.
/**
 * Referral partner program demo seed. Creates a single is_demo partner
 * ("Brightline IT (Demo MSP)", 10%, ongoing), attributes the Dream Dental demo clinic
 * to it (only when the clinic has no referral set — never clobbers a real
 * assignment), and seeds 3 commission rows (2 accrued + 1 paid w/ a payout row)
 * so /partners + the partner-detail math + the clinic Referral card all
 * populate. Fully idempotent: partner upserts by email, commission rows by
 * their deterministic demo invoice ids, the payout is seed-if-absent. The demo
 * partner has NO user/Stripe account — the partner portal isn't part of the
 * showcase (it requires a real partner login + Stripe Express).
 */
export async function seedDemoReferralPartner(orgId: string) {
  const DEMO_PARTNER_EMAIL = 'partner@brightline-it.example'
  const DEMO_PERCENT_BPS = 1000 // 10%

  // Bail on a demo with no patients yet (mid-creation / partial seed) — same
  // guard the other self-heal blocks use; keeps the seeder's no-insert-when-
  // org-already-fully-seeded idempotency guarantee intact.
  const anyPatient = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
    .limit(1)
  if (anyPatient.length === 0) return

  // Upsert the partner by its unique email.
  let [partner] = await db
    .select({ id: schema.referralPartner.id })
    .from(schema.referralPartner)
    .where(eq(schema.referralPartner.email, DEMO_PARTNER_EMAIL))
    .limit(1)
  if (!partner) {
    const id = newId('rp')
    await db
      .insert(schema.referralPartner)
      .values({
        id,
        name: 'Brightline IT (Demo MSP)',
        company: 'Brightline IT',
        email: DEMO_PARTNER_EMAIL,
        status: 'active',
        defaultPercentBps: DEMO_PERCENT_BPS,
        defaultTermMonths: null, // ongoing
        termsNote: 'Demo partner — 10% of every paid subscription, for the life of each referred clinic.',
        isDemo: 1,
      })
      .onConflictDoNothing({ target: schema.referralPartner.email })
    ;[partner] = await db
      .select({ id: schema.referralPartner.id })
      .from(schema.referralPartner)
      .where(eq(schema.referralPartner.email, DEMO_PARTNER_EMAIL))
      .limit(1)
  }
  if (!partner) return

  // Attribute the demo clinic — ONLY when it has no referral yet (never
  // overwrite a real assignment a platform admin made). Per the live-resolution
  // semantics, the demo clinic carries NO per-clinic override (NULL) so it
  // tracks the partner's CURRENT default (10%) — the same path real clinics use.
  const [profile] = await db
    .select({
      referralPartnerId: schema.clinicProfile.referralPartnerId,
      referralPercentBps: schema.clinicProfile.referralPercentBps,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (profile && !profile.referralPartnerId) {
    await db
      .update(schema.clinicProfile)
      .set({
        referralPartnerId: partner.id,
        referralPercentBps: null, // NULL = live-resolve the partner default
        referralTermMonths: null,
        referralStartedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // ~4 months ago
        updatedAt: new Date(),
      })
      .where(eq(schema.clinicProfile.organizationId, orgId))
  } else if (
    profile &&
    profile.referralPartnerId === partner.id &&
    profile.referralPercentBps === DEMO_PERCENT_BPS
  ) {
    // Self-heal legacy demos seeded before the live-resolution fix: a copied
    // default (== partner default) collapses to NULL (mirrors migration 0061),
    // so the demo showcases the "tracks partner default" provenance.
    await db
      .update(schema.clinicProfile)
      .set({ referralPercentBps: null, updatedAt: new Date() })
      .where(eq(schema.clinicProfile.organizationId, orgId))
  }

  // 3 commission rows — deterministic invoice ids so re-seeding is idempotent.
  // Premium plan = $500/mo = 50000 cents → 10% = 5000 cents each.
  const invoiceCents = 50000
  const amountCents = Math.floor((invoiceCents * DEMO_PERCENT_BPS) / 10000) // 5000
  const dayMs = 24 * 60 * 60 * 1000
  const rows: Array<{ inv: string; status: 'accrued' | 'paid'; ageDays: number }> = [
    { inv: `demo_inv_${orgId}_1`, status: 'paid', ageDays: 75 },
    { inv: `demo_inv_${orgId}_2`, status: 'accrued', ageDays: 45 },
    { inv: `demo_inv_${orgId}_3`, status: 'accrued', ageDays: 15 },
  ]

  // A payout row covering the one paid commission.
  let payoutId: number | null = null
  const [existingPayout] = await db
    .select({ id: schema.referralPayout.id })
    .from(schema.referralPayout)
    .where(eq(schema.referralPayout.partnerId, partner.id))
    .limit(1)
  if (existingPayout) {
    payoutId = existingPayout.id
  } else {
    const [created] = await db
      .insert(schema.referralPayout)
      .values({
        partnerId: partner.id,
        amountCents,
        stripeTransferId: 'tr_demo_payout',
        status: 'paid',
        createdAt: new Date(Date.now() - 70 * dayMs),
      })
      .returning({ id: schema.referralPayout.id })
    payoutId = created?.id ?? null
  }

  for (const r of rows) {
    await db
      .insert(schema.referralCommission)
      .values({
        partnerId: partner.id,
        organizationId: orgId,
        stripeInvoiceId: r.inv,
        invoiceTotalCents: invoiceCents,
        percentBps: DEMO_PERCENT_BPS,
        amountCents,
        status: r.status,
        payoutId: r.status === 'paid' ? payoutId : null,
        accruedAt: new Date(Date.now() - r.ageDays * dayMs),
      })
      .onConflictDoNothing({ target: schema.referralCommission.stripeInvoiceId })
  }
}

export async function seedDemoMoneyCoherence(orgId: string) {
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000

  // Attach to a seeded PERSONA patient (identity-anchored by the deterministic
  // @example.com emails, oldest first) so the money artifacts land on a demo
  // persona's timeline — never on a real patient someone created in the demo
  // org. Bail if no persona exists rather than falling back to an arbitrary row.
  const personaEmails = buildPatientPersonas(now)
    .map((p) => p.email)
    .filter((e): e is string => !!e)
  const [patient] = await db
    .select({ id: schema.patient.id, email: schema.patient.email, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, orgId), inArray(schema.patient.email, personaEmails)))
    .orderBy(schema.patient.createdAt)
    .limit(1)
  if (!patient) return

  // (1) Paid + unfulfilled order (Overview "Orders to fulfill" card).
  const [paidUnfulfilled] = await db
    .select({ id: schema.shopOrder.id })
    .from(schema.shopOrder)
    .where(
      and(
        eq(schema.shopOrder.organizationId, orgId),
        eq(schema.shopOrder.status, 'paid'),
        eq(schema.shopOrder.fulfillmentStatus, 'unfulfilled'),
      ),
    )
    .limit(1)
  if (!paidUnfulfilled) {
    const orderId = newId('ord')
    await db.insert(schema.shopOrder).values({
      id: orderId,
      organizationId: orgId,
      patientId: patient.id,
      email: patient.email ?? 'demo.buyer@example.com',
      name: `${patient.firstName} ${patient.lastName ?? ''}`.trim(),
      fulfillmentType: 'ship',
      status: 'paid',
      fulfillmentStatus: 'unfulfilled',
      subtotalCents: 8900,
      shippingCents: 600,
      taxCents: 0,
      totalCents: 9500,
      shippingAddress: { line1: '210 Oak Ln', city: 'Austin', state: 'TX', postal_code: '78702', country: 'US' },
      paidAt: new Date(now.getTime() - 1 * dayMs),
      createdAt: new Date(now.getTime() - 1 * dayMs),
    })
    await db.insert(schema.shopOrderItem).values({
      id: `oi_${newId('x')}`,
      orderId,
      organizationId: orgId,
      variantId: null,
      productName: 'Sonic Electric Toothbrush',
      variantName: null,
      unitPriceCents: 8900,
      quantity: 1,
    })
  }

  // (2) Online balance payment (reconciliation page + timeline event).
  const [existingPayment] = await db
    .select({ id: schema.patientBalancePayment.id })
    .from(schema.patientBalancePayment)
    .where(eq(schema.patientBalancePayment.organizationId, orgId))
    .limit(1)
  if (!existingPayment) {
    await db.insert(schema.patientBalancePayment).values({
      id: `bp_${newId('x')}`,
      organizationId: orgId,
      patientId: patient.id,
      amountCents: 12000,
      status: 'paid',
      balanceCentsAtPayment: 35000,
      paidAt: new Date(now.getTime() - 3 * dayMs),
      createdAt: new Date(now.getTime() - 3 * dayMs),
    })
  }
}
