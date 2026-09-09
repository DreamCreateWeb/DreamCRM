import 'server-only'
import { and, eq, inArray, isNull, like } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { buildPatientPersonas } from './personas'

// ── Persona-identity anchoring + misattribution cleanup ─────────────────
//
// The demo org can contain REAL patients — the platform owner books through
// the public widget to test flows, portal invites get accepted, etc. Seeded
// artifacts must therefore attach ONLY to the seeded personas, matched by
// their deterministic `first.last@example.com` emails — never positionally.
// (The old self-heal selected ALL patients with no ORDER BY and indexed the
// result by persona index, so a real patient could land at index 7 and
// inherit Noah's 5★ Healthgrades review.)
//
// Persona alignment + the self-heal sweep. `getPersonaAlignedPatientIds` is how
// every other seeder finds its people; `cleanupMisattributedDemoArtifacts`
// removes legacy rows that were attached to a REAL patient before the seeder
// anchored by identity. Both run on every resync.

/**
 * The org's seeded persona patients, aligned by persona index — entry i is
 * the patient whose email matches persona i's deterministic address, or null
 * when that persona is missing (e.g. hand-deleted). Consumers must skip null
 * entries rather than falling back to an arbitrary patient.
 */
export async function getPersonaAlignedPatientIds(
  orgId: string,
  now: Date,
): Promise<Array<string | null>> {
  // Persona emails are deterministic strings, but the type is nullable —
  // keep the null-safety local so the alignment below stays index-true.
  const emails = buildPatientPersonas(now).map((p) => p.email)
  const lookup = emails.filter((e): e is string => !!e)
  const rows = lookup.length
    ? await db
        .select({ id: schema.patient.id, email: schema.patient.email })
        .from(schema.patient)
        .where(and(eq(schema.patient.organizationId, orgId), inArray(schema.patient.email, lookup)))
    : []
  const byEmail = new Map(rows.map((r) => [(r.email ?? '').toLowerCase(), r.id]))
  const ids = emails.map((e) => (e ? (byEmail.get(e.toLowerCase()) ?? null) : null))

  // Self-heal the explicit persona marker (migration 0114) on rows resolved
  // by the email convention — future anchoring can trust is_demo_persona
  // even if a persona's email is ever edited. Best-effort + idempotent.
  const resolved = ids.filter((x): x is string => !!x)
  if (resolved.length > 0) {
    try {
      await db
        .update(schema.patient)
        .set({ isDemoPersona: 1 })
        .where(
          and(
            eq(schema.patient.organizationId, orgId),
            inArray(schema.patient.id, resolved),
            eq(schema.patient.isDemoPersona, 0),
          ),
        )
    } catch (err) {
      console.warn('[demo] persona-marker self-heal failed', err)
    }
  }
  return ids
}

/** First-message body prefixes of the seeded /messages threads (THREAD_SEEDS
 *  in seedPatientMessagesForOrg) — lets the cleanup sweep recognize a seeded
 *  thread that a legacy resync attached to the wrong patient. Keep in sync
 *  with the seed bodies (drift only weakens cleanup; it can't corrupt data). */
const DEMO_THREAD_MARKER_PREFIXES = [
  'Hi Mia — just confirming your cleaning has been moved',
  'Hi Marcus, your filling appointment is coming up.',
  'Hi Sophia — friendly reminder your cleaning is Friday',
  'Hi Aiden — so glad you\'re coming back in!',
  'Hi! Quick question — I booked through your website for next week',
  'New appointment request via the website.',
]

/** Body of the seeded "send later" reply (seedDemoScheduledMessage). */
const DEMO_SCHEDULED_MESSAGE_BODY =
  "Hi Marcus — good news: your insurance pre-auth came through. You're all set for Tuesday, and yes, your partner is welcome to join the consultation."

/** Names of the seeded Recall & Outreach campaigns (CAMPAIGN_SEEDS). */
const DEMO_CAMPAIGN_NAMES = [
  'March Reactivation — come back for a cleaning',
  'May Birthday wishes',
  'New patient welcome — week 1 follow-up',
]

/**
 * One-time repair sweep: earlier resyncs indexed patients positionally, so
 * seeded artifacts (review requests, message threads, scheduled sends,
 * campaign events, memberships, testimonial links) may sit on NON-persona
 * patients — e.g. a real test patient showing "Left a 5★ review" they never
 * wrote. Removes only rows that are provably seeder-minted (demo tokens /
 * seed bodies / seeded campaign names / Stripe-less memberships) AND attached
 * to a non-persona patient, so anything a human actually did in the demo org
 * survives. Idempotent; cheap when there's nothing to repair.
 */
export async function cleanupMisattributedDemoArtifacts(
  orgId: string,
  personaPatientIds: Array<string | null>,
): Promise<void> {
  const personaSet = new Set(personaPatientIds.filter((x): x is string => !!x))
  const allPatients = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
  const strays = allPatients.map((p) => p.id).filter((id) => !personaSet.has(id))
  if (strays.length === 0) return

  // (1) Seeder-minted review requests (token starts with "demo") on a
  // non-persona patient — the "phantom 5★ review" case.
  await db
    .delete(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, orgId),
        inArray(schema.reviewRequest.patientId, strays),
        like(schema.reviewRequest.token, 'demo%'),
      ),
    )

  // (2) Seeded message threads on a non-persona patient (recognized by the
  // seed bodies). Real conversations don't match and survive.
  const strayThreads = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(
      and(
        eq(schema.patientThread.organizationId, orgId),
        inArray(schema.patientThread.patientId, strays),
      ),
    )
  for (const t of strayThreads) {
    const msgs = await db
      .select({ body: schema.patientMessage.body })
      .from(schema.patientMessage)
      .where(eq(schema.patientMessage.threadId, t.id))
    const seeded = msgs.some((m) =>
      DEMO_THREAD_MARKER_PREFIXES.some((p) => (m.body ?? '').startsWith(p)),
    )
    if (!seeded) continue
    await db.delete(schema.patientMessage).where(eq(schema.patientMessage.threadId, t.id))
    await db.delete(schema.patientThread).where(eq(schema.patientThread.id, t.id))
  }

  // (3) The seeded pending "send later" reply — if it landed on a real
  // patient the cron would eventually SEND it to them.
  await db
    .delete(schema.scheduledMessage)
    .where(
      and(
        eq(schema.scheduledMessage.organizationId, orgId),
        inArray(schema.scheduledMessage.patientId, strays),
        eq(schema.scheduledMessage.body, DEMO_SCHEDULED_MESSAGE_BODY),
      ),
    )

  // (4) Fabricated funnel events on the seeded campaigns (the demo campaigns
  // never actually send, so any event they hold for a stray patient is fake).
  const seededCampaigns = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.organizationId, orgId),
        inArray(schema.campaigns.name, DEMO_CAMPAIGN_NAMES),
      ),
    )
  if (seededCampaigns.length > 0) {
    await db
      .delete(schema.campaignEvents)
      .where(
        and(
          inArray(schema.campaignEvents.campaignId, seededCampaigns.map((c) => c.id)),
          inArray(schema.campaignEvents.patientId, strays),
        ),
      )
  }

  // (5) Seeded memberships (no Stripe subscription — real joins always carry
  // one) on a non-persona patient.
  await db
    .delete(schema.membership)
    .where(
      and(
        eq(schema.membership.organizationId, orgId),
        inArray(schema.membership.patientId, strays),
        isNull(schema.membership.stripeSubscriptionId),
      ),
    )

  // (6) Seeded fast-pass waitlist artifacts on a non-persona patient — the
  // offers carry a demo token, the entries a deterministic `wait_demo…` id.
  // Real entries staff add in the demo org match neither and survive.
  await db
    .delete(schema.appointmentWaitlistOffer)
    .where(
      and(
        eq(schema.appointmentWaitlistOffer.organizationId, orgId),
        inArray(schema.appointmentWaitlistOffer.patientId, strays),
        like(schema.appointmentWaitlistOffer.token, 'demo%'),
      ),
    )
  await db
    .delete(schema.appointmentWaitlist)
    .where(
      and(
        eq(schema.appointmentWaitlist.organizationId, orgId),
        inArray(schema.appointmentWaitlist.patientId, strays),
        like(schema.appointmentWaitlist.id, 'wait_demo%'),
      ),
    )

  // (7) Seeded booking-deposit records (deterministic `bd_demo…` ids) on a
  // non-persona patient — a fabricated money record must never sit on a real
  // person. Real deposits carry `bd_<hex>` ids and survive.
  await db
    .delete(schema.bookingDeposit)
    .where(
      and(
        eq(schema.bookingDeposit.organizationId, orgId),
        inArray(schema.bookingDeposit.patientId, strays),
        like(schema.bookingDeposit.id, 'bd_demo%'),
      ),
    )

  // (8) Seeded pay-link requests (demo tokens) on a non-persona patient —
  // a fabricated dunning record must never sit on a real person.
  await db
    .delete(schema.balancePaymentRequest)
    .where(
      and(
        eq(schema.balancePaymentRequest.organizationId, orgId),
        inArray(schema.balancePaymentRequest.patientId, strays),
        like(schema.balancePaymentRequest.token, 'demo%'),
      ),
    )

  // (9) Seeded refer-a-friend links (demoref tokens) on a non-persona
  // patient — a fabricated share link must never sit on a real person.
  await db
    .delete(schema.patientReferralLink)
    .where(
      and(
        eq(schema.patientReferralLink.organizationId, orgId),
        inArray(schema.patientReferralLink.patientId, strays),
        like(schema.patientReferralLink.token, 'demoref%'),
      ),
    )

  // (9a0) Seeded loyalty ledger rows (loy_demo ids) on a non-persona patient.
  await db
    .delete(schema.loyaltyEvent)
    .where(
      and(
        eq(schema.loyaltyEvent.organizationId, orgId),
        inArray(schema.loyaltyEvent.patientId, strays),
        like(schema.loyaltyEvent.id, 'loy_demo%'),
      ),
    )

  // (9a) Seeded NPS survey responses (demonps tokens) on a non-persona
  // patient — a fabricated survey answer must never sit on a real person.
  await db
    .delete(schema.npsResponse)
    .where(
      and(
        eq(schema.npsResponse.organizationId, orgId),
        inArray(schema.npsResponse.patientId, strays),
        like(schema.npsResponse.token, 'demonps%'),
      ),
    )

  // (9b) Seeded payment plans (ppl_demo ids) + their installment payment rows
  // (bp_demo_plan ids) on a non-persona patient — fabricated autopay records
  // must never sit on a real person. Seeded plans carry no Stripe ids, so
  // even a misattributed one could never charge; this is about display.
  await db
    .delete(schema.paymentPlan)
    .where(
      and(
        eq(schema.paymentPlan.organizationId, orgId),
        inArray(schema.paymentPlan.patientId, strays),
        like(schema.paymentPlan.id, 'ppl_demo%'),
      ),
    )
  await db
    .delete(schema.patientBalancePayment)
    .where(
      and(
        eq(schema.patientBalancePayment.organizationId, orgId),
        inArray(schema.patientBalancePayment.patientId, strays),
        like(schema.patientBalancePayment.id, 'bp_demo_plan%'),
      ),
    )

  // (10) Public-site testimonials linked to a non-persona patient — a seeded
  // quote must never render under a real person's name.
  const [profileRow] = await db
    .select({ testimonials: schema.clinicProfile.testimonials })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  const testimonials = (profileRow?.testimonials ?? []) as Array<{ patientId?: string | null }>
  const straySet = new Set(strays)
  const kept = testimonials.filter((t) => !t.patientId || !straySet.has(t.patientId))
  if (kept.length !== testimonials.length) {
    await db
      .update(schema.clinicProfile)
      .set({ testimonials: kept, updatedAt: new Date() })
      .where(eq(schema.clinicProfile.organizationId, orgId))
  }
}
