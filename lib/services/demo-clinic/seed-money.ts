import 'server-only'
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { DEMO_VISIT_TYPES } from './clinic-config'
import { snapToHalfHour } from './helpers'

// Money-touching demo state: waitlist, booking deposit, balance outreach,
// referral, NPS, loyalty, preferred language, payment plan.

/**
 * Seed the Appointments fast-pass waitlist showcase. Two persona-anchored
 * entries: Mia [0] linked to her upcoming cleaning (staff-added, with a
 * pending offer out so the "offer out" pill + a living /w/[token] claim page
 * render) and Noah [7] as a flexible any-opening entry added from the portal.
 * Idempotent by the deterministic `wait_demo…` ids; a missing persona skips
 * its seed (never falls back to a real patient), and a missing anchor visit
 * (Mia's future cleaning) skips the whole showcase. The offer token carries
 * the `demo` marker the cleanup sweep recognizes. The demo org never emails —
 * offerFreedSlot short-circuits on isDemo, so seeded offers are the only
 * offers a demo ever holds.
 */
export async function seedDemoWaitlist(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const dayMs = 24 * 60 * 60 * 1000
  const hourMs = 60 * 60 * 1000
  const ENTRY_MIA = 'wait_demo_fastpass_mia'
  const ENTRY_NOAH = 'wait_demo_fastpass_noah'

  const miaId = patientIds[0]
  const noahId = patientIds[7]
  if (!miaId) return

  const existingRows = await db
    .select({ id: schema.appointmentWaitlist.id })
    .from(schema.appointmentWaitlist)
    .where(inArray(schema.appointmentWaitlist.id, [ENTRY_MIA, ENTRY_NOAH]))
  const have = new Set(existingRows.map((r) => r.id))
  if (have.has(ENTRY_MIA) && (!noahId || have.has(ENTRY_NOAH))) return

  // Anchor: Mia's seeded future cleaning — the visit her fast pass would move
  // her up FROM. Missing (partially-seeded org, or the seeder test's
  // exhausted queue) → skip the whole showcase rather than seed half of it.
  const [appt] = await db
    .select({ id: schema.appointment.id, providerId: schema.appointment.providerId })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, orgId),
        eq(schema.appointment.patientId, miaId),
        eq(schema.appointment.type, 'cleaning'),
        eq(schema.appointment.status, 'scheduled'),
        gte(schema.appointment.startTime, now),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))
    .limit(1)
  if (!appt) return

  if (!have.has(ENTRY_MIA)) {
    const addedAt = new Date(now.getTime() - 4 * dayMs)
    await db.insert(schema.appointmentWaitlist).values({
      id: ENTRY_MIA,
      organizationId: orgId,
      patientId: miaId,
      appointmentId: appt.id,
      visitType: 'cleaning',
      providerId: appt.providerId ?? null,
      status: 'active',
      source: 'staff',
      createdAt: addedAt,
      updatedAt: addedAt,
    })
    const slotStart = snapToHalfHour(new Date(now.getTime() + 2 * dayMs + 10 * hourMs))
    const sentAt = new Date(now.getTime() - 1 * hourMs)
    await db.insert(schema.appointmentWaitlistOffer).values({
      id: 'woff_demo_fastpass_mia',
      organizationId: orgId,
      waitlistId: ENTRY_MIA,
      patientId: miaId,
      slotStart,
      slotEnd: new Date(slotStart.getTime() + 45 * 60 * 1000),
      providerId: appt.providerId ?? null,
      visitType: 'cleaning',
      freedByAppointmentId: null,
      token: `demowl_mia_${Math.random().toString(36).slice(2, 10)}`,
      status: 'pending',
      sentAt,
      createdAt: sentAt,
      updatedAt: sentAt,
    })
  }

  if (noahId && !have.has(ENTRY_NOAH)) {
    const addedAt = new Date(now.getTime() - 9 * dayMs)
    await db.insert(schema.appointmentWaitlist).values({
      id: ENTRY_NOAH,
      organizationId: orgId,
      patientId: noahId,
      appointmentId: null,
      visitType: null,
      providerId: null,
      status: 'active',
      source: 'portal',
      createdAt: addedAt,
      updatedAt: addedAt,
    })
  }
}

/**
 * Seed the booking-deposit showcase: one PAID deposit record on Emma's
 * widget-booked consultation (persona 6) — populates the Shop → Payments
 * "Booking deposits" section + the drawer's "deposit paid" pill — and a
 * visit-type catalog (only when the demo still has none) with a $50
 * consultation deposit so the Settings editor shows a configured example.
 * The demo's Stripe stays 'none', so nothing ever actually charges.
 * Idempotent by the deterministic `bd_demo…` id; anchor missing (partial
 * org / exhausted seeder-test queue) → skip. Cleanup sweep reaps `bd_demo%`
 * rows misattributed to non-persona patients.
 */
export async function seedDemoBookingDeposit(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const emmaId = patientIds[6]
  if (!emmaId) return
  const DEPOSIT_ID = 'bd_demo_emma_consult'

  const [existing] = await db
    .select({ id: schema.bookingDeposit.id })
    .from(schema.bookingDeposit)
    .where(eq(schema.bookingDeposit.id, DEPOSIT_ID))
    .limit(1)
  if (existing) return

  // Anchor: Emma's future widget-booked consultation. Missing → skip.
  const [appt] = await db
    .select({ id: schema.appointment.id, createdAt: schema.appointment.createdAt })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, orgId),
        eq(schema.appointment.patientId, emmaId),
        eq(schema.appointment.type, 'consultation'),
        eq(schema.appointment.source, 'booking_widget'),
        gte(schema.appointment.startTime, now),
      ),
    )
    .limit(1)
  if (!appt) return

  const paidAt = (appt.createdAt as Date | null) ?? new Date(now.getTime() - 20 * 60 * 1000)
  await db.insert(schema.bookingDeposit).values({
    id: DEPOSIT_ID,
    organizationId: orgId,
    patientId: emmaId,
    appointmentId: appt.id,
    visitType: 'consultation',
    amountCents: 5000,
    status: 'paid',
    note: 'Seeded demo deposit',
    createdAt: paidAt,
    paidAt,
  })

  // Visit-type catalog backfill — ONLY when the demo has never configured one
  // (never clobbers an existing catalog). The demo catalog carries the $50
  // consultation deposit + prep-instruction examples the editor showcases.
  const [profile] = await db
    .select({ visitTypeSettings: schema.clinicProfile.visitTypeSettings })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (profile && profile.visitTypeSettings == null) {
    await db
      .update(schema.clinicProfile)
      .set({ visitTypeSettings: DEMO_VISIT_TYPES, updatedAt: new Date() })
      .where(eq(schema.clinicProfile.organizationId, orgId))
  }
}

/**
 * Seed the billing-outreach showcase: one SENT pay-link request on Marcus
 * (persona 3 — the outstanding-balance persona) so the /b/[token] landing and
 * the request history demo real states. Anchored on his live PMS balance
 * (seeded by pms/demo-seed.ts); missing → skip. Token carries the `demo`
 * marker the cleanup sweep recognizes; demo orgs never actually email
 * (runBalanceReminderCadence + the cadence both skip isDemo).
 */
export async function seedDemoBalanceOutreach(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const marcusId = patientIds[3]
  if (!marcusId) return
  const REQUEST_ID = 'bpr_demo_marcus'

  const [existing] = await db
    .select({ id: schema.balancePaymentRequest.id })
    .from(schema.balancePaymentRequest)
    .where(eq(schema.balancePaymentRequest.id, REQUEST_ID))
    .limit(1)
  if (existing) return

  // Anchor: Marcus's seeded PMS balance. Missing/zero → skip the showcase.
  const [p] = await db
    .select({ balance: schema.patient.pmsBalanceCents })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, marcusId)))
    .limit(1)
  if (!p?.balance || p.balance <= 0) return

  const sentAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
  await db.insert(schema.balancePaymentRequest).values({
    id: REQUEST_ID,
    organizationId: orgId,
    patientId: marcusId,
    token: 'demopb_marcus_showcase',
    balanceCentsAtSend: p.balance,
    status: 'sent',
    source: 'auto',
    sentByUserId: null,
    sentAt,
    createdAt: sentAt,
    updatedAt: sentAt,
  })
}

/**
 * Seed the refer-a-friend showcase: Sophia [4] holds a share link (the row the
 * portal card mints lazily) and Emma [6] — the widget-booked new patient — is
 * stamped as referred BY Sophia, so the patient record shows both directions
 * of the ReferralCard ("Referred by Sophia" on Emma; "Brought a friend" on
 * Sophia). Persona-anchored both sides; either missing → skip. Stamp is
 * only-when-null so a real attribution (or a re-run) is never overwritten.
 * The link token carries the `demoref` marker the cleanup sweep recognizes.
 */
export async function seedDemoReferral(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const sophiaId = patientIds[4]
  const emmaId = patientIds[6]
  if (!sophiaId || !emmaId) return

  // Positive anchor: Emma's actual patient row. Missing (partially-seeded org,
  // or the seeder test's exhausted mock queue) → skip the whole showcase.
  const [emma] = await db
    .select({ id: schema.patient.id, referredByPatientId: schema.patient.referredByPatientId })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, emmaId)))
    .limit(1)
  if (!emma) return

  // Sophia's share link — respecting the one-link-per-patient unique index:
  // if she already minted one organically (someone clicked the portal card in
  // the demo), keep hers and skip ours.
  const [existingLink] = await db
    .select({ id: schema.patientReferralLink.id })
    .from(schema.patientReferralLink)
    .where(
      and(
        eq(schema.patientReferralLink.organizationId, orgId),
        eq(schema.patientReferralLink.patientId, sophiaId),
      ),
    )
    .limit(1)
  if (!existingLink) {
    await db.insert(schema.patientReferralLink).values({
      id: 'prl_demo_sophia',
      organizationId: orgId,
      patientId: sophiaId,
      token: 'demoref_sophia_showcase',
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    })
  }

  // Stamp Emma as Sophia's referral — only when unattributed, never overwriting.
  if (!emma.referredByPatientId) {
    await db
      .update(schema.patient)
      .set({ referredByPatientId: sophiaId })
      .where(
        and(
          eq(schema.patient.id, emmaId),
          eq(schema.patient.organizationId, orgId),
          isNull(schema.patient.referredByPatientId),
        ),
      )
  }
}

/**
 * Seed the NPS pulse showcase: four answered surveys across the score bands
 * (two promoters w/ comments, one passive, one detractor w/ a comment — the
 * detractor also demos the "pinged your team" copy honestly since the count
 * is real). Persona-anchored; deterministic `nps_demo…` ids + `demonps…`
 * tokens; missing personas skip their rows; cleanup sweep reaps strays.
 */
export async function seedDemoNpsResponses(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const dayMs = 24 * 60 * 60 * 1000
  const seeds: Array<{ idx: number; key: string; score: number; comment: string | null; daysAgo: number }> = [
    { idx: 0, key: 'mia', score: 10, comment: 'Everyone was so gentle — best cleaning I’ve had.', daysAgo: 12 },
    { idx: 7, key: 'noah', score: 9, comment: null, daysAgo: 20 },
    { idx: 2, key: 'charlotte', score: 8, comment: 'Great visit, parking was a little tricky.', daysAgo: 33 },
    { idx: 9, key: 'ethan', score: 4, comment: 'Waited 40 minutes past my appointment time.', daysAgo: 6 },
  ]
  // Positive anchor: Mia's actual patient row. Missing (partially-seeded org,
  // or the seeder test's exhausted mock queue) → skip the whole showcase.
  const miaId = patientIds[0]
  if (!miaId) return
  const [mia] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, miaId)))
    .limit(1)
  if (!mia) return

  const ids = seeds.map((s) => `nps_demo_${s.key}`)
  const existing = await db
    .select({ id: schema.npsResponse.id })
    .from(schema.npsResponse)
    .where(inArray(schema.npsResponse.id, ids))
  const have = new Set(existing.map((r) => r.id))

  for (const s of seeds) {
    const patientId = patientIds[s.idx]
    if (!patientId || have.has(`nps_demo_${s.key}`)) continue
    const sentAt = new Date(now.getTime() - s.daysAgo * dayMs)
    await db.insert(schema.npsResponse).values({
      id: `nps_demo_${s.key}`,
      organizationId: orgId,
      patientId,
      appointmentId: null,
      token: `demonps_${s.key}`,
      score: s.score,
      comment: s.comment,
      sentAt,
      respondedAt: new Date(sentAt.getTime() + 6 * 60 * 60 * 1000),
      createdAt: sentAt,
    })
  }
}

/**
 * Seed the loyalty showcase: the program flipped ON (only-when-null so a
 * staff-tuned config survives) + a small persona-anchored ledger — Mia holds
 * enough to redeem (the portal card's redeem state), Noah has a partial
 * balance. Deterministic `loy_demo…` ids; the accrual cron skips demo orgs,
 * so these seeded rows are the demo's only ledger. Cleanup sweeps strays.
 */
export async function seedDemoLoyalty(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const dayMs = 24 * 60 * 60 * 1000
  const miaId = patientIds[0]
  const noahId = patientIds[7]
  if (!miaId) return

  // Positive anchor: Mia's row must exist (exhausted seeder-test queue → skip).
  const [mia] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, miaId)))
    .limit(1)
  if (!mia) return

  // Enable the program only when the clinic profile has no loyalty blob yet.
  const [profile] = await db
    .select({ loyalty: schema.clinicProfile.loyalty })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (profile && profile.loyalty == null) {
    await db
      .update(schema.clinicProfile)
      .set({
        loyalty: { enabled: true, pointsPerVisit: 10, pointsPerReferral: 50, pointsPerPayment: 10, redeemPoints: 100, redeemValueCents: 1000 },
        updatedAt: new Date(),
      })
      .where(eq(schema.clinicProfile.organizationId, orgId))
  }

  const seeds: Array<{ id: string; patientId: string | null; kind: string; points: number; note: string; daysAgo: number }> = [
    { id: 'loy_demo_mia_v1', patientId: miaId, kind: 'visit', points: 10, note: 'Kept visit', daysAgo: 200 },
    { id: 'loy_demo_mia_v2', patientId: miaId, kind: 'visit', points: 10, note: 'Kept visit', daysAgo: 25 },
    { id: 'loy_demo_mia_ref', patientId: miaId, kind: 'referral', points: 50, note: 'Referred a friend — first visit kept', daysAgo: 60 },
    { id: 'loy_demo_mia_adj', patientId: miaId, kind: 'adjust', points: 40, note: 'Welcome bonus', daysAgo: 300 },
    { id: 'loy_demo_noah_v1', patientId: noahId, kind: 'visit', points: 10, note: 'Kept visit', daysAgo: 45 },
    { id: 'loy_demo_noah_pay', patientId: noahId, kind: 'payment', points: 10, note: 'Online payment', daysAgo: 30 },
  ]
  const existing = await db
    .select({ id: schema.loyaltyEvent.id })
    .from(schema.loyaltyEvent)
    .where(inArray(schema.loyaltyEvent.id, seeds.map((s) => s.id)))
  const have = new Set(existing.map((r) => r.id))
  for (const s of seeds) {
    if (!s.patientId || have.has(s.id)) continue
    await db.insert(schema.loyaltyEvent).values({
      id: s.id,
      organizationId: orgId,
      patientId: s.patientId,
      kind: s.kind,
      points: s.points,
      sourceId: s.id,
      note: s.note,
      createdAt: new Date(now.getTime() - s.daysAgo * dayMs),
    })
  }
}

/**
 * Preferred-language showcase: Sophia (persona 4 — she has a seeded /messages
 * thread) prefers Spanish, so the "Prefers Spanish" chip + the composer's
 * one-tap translate render in the demo. Only-when-null: a staff-set choice
 * (or a real intake stamp) is never overwritten.
 */
export async function seedDemoPreferredLanguage(
  orgId: string,
  patientIds: Array<string | null>,
): Promise<void> {
  const sophiaId = patientIds[4]
  if (!sophiaId) return
  await db
    .update(schema.patient)
    .set({ preferredLanguage: 'es' })
    .where(
      and(
        eq(schema.patient.id, sophiaId),
        eq(schema.patient.organizationId, orgId),
        isNull(schema.patient.preferredLanguage),
      ),
    )
}

/**
 * Seed the payment-plan showcase: an ACTIVE 6-month autopay plan on Marcus
 * (persona 3, the outstanding-balance persona) with 2 installments already
 * paid, so the Collections board's plans table + the /payments/online
 * reconciliation rows demo real states. Anchored on his live PMS balance
 * (missing/zero → skip); idempotent by the deterministic `ppl_demo…` id. The
 * row carries NO Stripe ids, so the charge cron can never touch it (it also
 * skips isDemo orgs — belt and suspenders). Cleanup sweep reaps `ppl_demo%`
 * plans + `bp_demo_plan%` payments misattributed to non-persona patients.
 */
export async function seedDemoPaymentPlan(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const marcusId = patientIds[3]
  if (!marcusId) return
  const PLAN_ID = 'ppl_demo_marcus'
  const dayMs = 24 * 60 * 60 * 1000

  const [existing] = await db
    .select({ id: schema.paymentPlan.id })
    .from(schema.paymentPlan)
    .where(eq(schema.paymentPlan.id, PLAN_ID))
    .limit(1)
  if (existing) return

  // Anchor: Marcus's seeded PMS balance. Missing/zero → skip the showcase.
  const [p] = await db
    .select({ balance: schema.patient.pmsBalanceCents })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, marcusId)))
    .limit(1)
  if (!p?.balance || p.balance <= 0) return

  const installments = 6
  const per = Math.floor(p.balance / installments)
  if (per < 2500) return // matches PLAN_MIN_INSTALLMENT_CENTS — keep the demo realistic
  const acceptedAt = new Date(now.getTime() - 49 * dayMs)

  await db.insert(schema.paymentPlan).values({
    id: PLAN_ID,
    organizationId: orgId,
    patientId: marcusId,
    token: 'demopl_marcus_showcase',
    totalCents: p.balance,
    installmentCents: per,
    installments,
    installmentsPaid: 2,
    status: 'active',
    // Deliberately NO stripeCustomerId / stripePaymentMethodId — uncharged
    // by construction.
    nextChargeAt: new Date(now.getTime() + 12 * dayMs),
    proposedByUserId: null,
    acceptedAt,
    createdAt: new Date(now.getTime() - 50 * dayMs),
    updatedAt: new Date(now.getTime() - 19 * dayMs),
  })

  // The two installments he already paid — real reconciliation rows.
  await db.insert(schema.patientBalancePayment).values(
    [1, 2].map((n) => ({
      id: `bp_demo_plan_${n}`,
      organizationId: orgId,
      patientId: marcusId,
      amountCents: per,
      status: 'paid',
      paidAt: new Date(acceptedAt.getTime() + (n - 1) * 30 * dayMs),
      createdAt: new Date(acceptedAt.getTime() + (n - 1) * 30 * dayMs),
      note: `Payment plan installment ${n} of ${installments}`,
    })),
  )
}
