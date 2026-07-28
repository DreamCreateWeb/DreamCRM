import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicWeekStart } from '@/lib/clinic-timezone'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'

/**
 * Demo seeding for THE VOICE (Transformation Phase 2): the Approval Inbox's
 * open proposals + the Action Ledger entries behind the weekly standup card,
 * so the demo Overview showcases the employee reporting in (no-fake-content
 * law: both surfaces read real rows).
 *
 * Anchoring rules (the demo-org convention): ledger entries attach to the
 * seeded personas BY IDENTITY (the caller passes persona-aligned ids from
 * getPersonaAlignedPatientIds) — a missing persona SKIPS its entry, never
 * falls back to a real patient. Proposals reference real seeded artifacts
 * (the unreplied demo review, a seeded new lead, the demo social accounts,
 * the recall audience); a missing prerequisite skips that proposal.
 *
 * Markers + cleanup: seeded ledger ids are 'act_demo_*', seeded proposals
 * are 'prop_demo_*' with is_demo = 1. Every resync deletes-and-reseeds both
 * (plus ledger entries minted by APPROVING a demo proposal, recognized by
 * detail->>'proposalId' = 'prop_demo_*'), so the demo inbox is always full
 * again after a resync. Never networks — demo approval simulates.
 */

export interface DemoVoicePersona {
  patientId: string | null
  firstName: string
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export async function seedDemoVoice(
  organizationId: string,
  personas: DemoVoicePersona[],
  now: Date = new Date(),
): Promise<void> {
  // Prerequisite guard — only seed a real demo org (one with patients).
  const [anyPatient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
    .limit(1)
  if (!anyPatient) return

  await seedLedger(organizationId, personas, now)
  await seedProposals(organizationId, now)
}

// ── The ledger entries behind the standup card ───────────────────────────────

async function seedLedger(
  organizationId: string,
  personas: DemoVoicePersona[],
  now: Date,
): Promise<void> {
  // Sweep prior seeds + entries minted by approving seeded proposals.
  await db
    .delete(schema.actionLedger)
    .where(
      and(
        eq(schema.actionLedger.organizationId, organizationId),
        sql`(${schema.actionLedger.id} like 'act_demo_%' or ${schema.actionLedger.detail}->>'proposalId' like 'prop_demo_%')`,
      ),
    )

  // Anchor to the PRIOR clinic-local week so the standup card always has a
  // story to tell, whatever weekday the resync runs on. A few entries land in
  // the current week too (the ledger reads as alive, not archival).
  const tz = await getClinicTimeZone(organizationId)
  const weekEnd = clinicWeekStart(now, tz)
  const weekStart = clinicWeekStart(new Date(weekEnd.getTime() - 1), tz)
  const p = (i: number) => personas[i] ?? { patientId: null, firstName: '' }

  // [capability, personaIndex | null, summary(firstName), offsetMs from weekStart]
  const mia = p(0)
  const liam = p(1)
  const charlotte = p(2)
  const marcus = p(3)
  const sophia = p(4)
  const emma = p(6)
  const noah = p(7)

  const entries: Array<{
    capability: string
    persona: DemoVoicePersona | null
    summary: (first: string) => string
    at: Date
  }> = [
    { capability: 'appointment_reminder', persona: mia, summary: (f) => `Reminded ${f} about Tuesday's cleaning`, at: new Date(weekStart.getTime() + 1 * DAY + 9 * HOUR) },
    { capability: 'appointment_reminder', persona: liam, summary: (f) => `Reminded ${f} about Wednesday's checkup`, at: new Date(weekStart.getTime() + 2 * DAY + 9 * HOUR) },
    { capability: 'appointment_reminder', persona: sophia, summary: (f) => `Reminded ${f} about Friday's whitening visit`, at: new Date(weekStart.getTime() + 4 * DAY + 9 * HOUR) },
    { capability: 'review_request', persona: emma, summary: (f) => `Asked ${f} how the visit went — with a Google review link`, at: new Date(weekStart.getTime() + 2 * DAY + 17 * HOUR) },
    { capability: 'review_feature', persona: null, summary: () => `Added Priya Nair’s 5-star Google review to your website`, at: new Date(weekStart.getTime() + 3 * DAY + 8 * HOUR) },
    { capability: 'balance_nudge', persona: marcus, summary: (f) => `Sent ${f} a gentle note about their open balance, with a pay link`, at: new Date(weekStart.getTime() + 3 * DAY + 11 * HOUR) },
    { capability: 'noshow_rebook', persona: noah, summary: (f) => `Invited ${f} back for a new time after a missed visit`, at: new Date(weekStart.getTime() + 4 * DAY + 15 * HOUR) },
    { capability: 'followup_rule', persona: charlotte, summary: (f) => `Opened a follow-up: ${f}'s recall is coming due`, at: new Date(weekStart.getTime() + 5 * DAY + 7 * HOUR) },
    { capability: 'listing_sync', persona: null, summary: () => `Updated your website's opening hours to match your Google Business listing`, at: new Date(weekStart.getTime() + 5 * DAY + 6 * HOUR) },
    { capability: 'auto_reply', persona: null, summary: () => `Sent the after-hours auto-reply to a patient who wrote in late`, at: new Date(weekStart.getTime() + 5 * DAY + 21 * HOUR) },
    // Current-week freshness (the activity trail keeps breathing).
    { capability: 'appointment_reminder', persona: emma, summary: (f) => `Reminded ${f} about tomorrow's visit`, at: new Date(now.getTime() - 1 * DAY) },
    { capability: 'scheduled_message', persona: mia, summary: (f) => `Delivered the message the front desk scheduled for ${f}`, at: new Date(now.getTime() - 5 * HOUR) },
  ]

  let n = 0
  for (const e of entries) {
    // Persona-anchored entries SKIP when the persona is missing — never
    // attach a seeded story to a real patient.
    if (e.persona && !e.persona.patientId) continue
    if (e.at >= now) continue
    n++
    await db.insert(schema.actionLedger).values({
      id: `act_demo_${String(n).padStart(2, '0')}_${organizationId.slice(0, 8)}`,
      organizationId,
      capability: e.capability,
      patientId: e.persona?.patientId ?? null,
      summary: e.summary(e.persona?.firstName ?? ''),
      detail: { demoSeed: true },
      occurredAt: e.at,
    })
  }
}

// ── The open proposals in the Approval Inbox ─────────────────────────────────

async function seedProposals(organizationId: string, now: Date): Promise<void> {
  // Delete-and-reseed: a resync always refills the demo inbox (approved /
  // declined seeds from a demo session don't leave it empty).
  await db
    .delete(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.isDemo, 1)))

  const expires = new Date(now.getTime() + 30 * DAY)

  // 1. Review reply — anchored to the seeded UNREPLIED 2★ demo review
  //    (demo_gr_7, Rob Castellano — the reputation fire the demo showcases).
  const [lowStarReview] = await db
    .select({
      externalReviewId: schema.platformReview.externalReviewId,
      reviewerName: schema.platformReview.reviewerName,
      starRating: schema.platformReview.starRating,
      comment: schema.platformReview.comment,
    })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, organizationId),
        eq(schema.platformReview.externalReviewId, 'demo_gr_7'),
        sql`${schema.platformReview.replyComment} is null`,
      ),
    )
    .limit(1)
  if (lowStarReview) {
    await db
      .insert(schema.proposal)
      .values({
        id: `prop_demo_review_${organizationId.slice(0, 8)}`,
        organizationId,
        capability: 'review_reply',
        sourceKey: `review_reply:${lowStarReview.externalReviewId}`,
        title: 'Reply to Rob Castellano’s 2-star review — worth answering today',
        body: 'Rob, thank you for telling us — the wait and the surprise on the bill are both on us. We’d like to make this right; please call the office and ask for the practice manager, and we’ll go through the estimate together.',
        payload: {
          externalReviewId: lowStarReview.externalReviewId,
          // The real seeded review, quoted on the card (never approve blind).
          context: {
            kind: 'review',
            author: lowStarReview.reviewerName,
            starRating: lowStarReview.starRating,
            text: lowStarReview.comment,
          },
        },
        status: 'open',
        expiresAt: expires,
        isDemo: 1,
        createdAt: new Date(now.getTime() - 3 * HOUR),
      })
      .onConflictDoNothing()
  }

  // 2. Inquiry response — anchored to a seeded NEW lead with an email.
  const [freshLead] = await db
    .select({ id: schema.lead.id, name: schema.lead.name, message: schema.lead.message, preferredDate: schema.lead.preferredDate })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.status, 'new'),
        sql`${schema.lead.email} is not null`,
      ),
    )
    .orderBy(sql`${schema.lead.createdAt} desc`)
    .limit(1)
  if (freshLead) {
    const first = freshLead.name.trim().split(/\s+/)[0] || 'there'
    await db
      .insert(schema.proposal)
      .values({
        id: `prop_demo_inquiry_${organizationId.slice(0, 8)}`,
        organizationId,
        capability: 'inquiry_response',
        sourceKey: `inquiry_response:${freshLead.id}`,
        title: `Answer ${first}’s website inquiry`,
        body: `Hi ${first} — thanks for reaching out. We’d be glad to get you in; most new-patient visits take about an hour, and we’ll check your insurance before you arrive so there are no surprises. Pick a time on our booking page, or reply here and we’ll find one together.`,
        payload: {
          leadId: freshLead.id,
          subject: 'Your question for Dream Dental',
          context: {
            kind: 'inquiry',
            author: freshLead.name,
            text: freshLead.message,
            preferredDate: freshLead.preferredDate,
          },
        },
        status: 'open',
        expiresAt: new Date(now.getTime() + 7 * DAY),
        isDemo: 1,
        createdAt: new Date(now.getTime() - 6 * HOUR),
      })
      .onConflictDoNothing()
  }

  // 3. Social post — anchored to the seeded demo channels.
  const demoAccounts = await db
    .select({ id: schema.zernioAccount.id })
    .from(schema.zernioAccount)
    .where(eq(schema.zernioAccount.organizationId, organizationId))
    .limit(3)
  if (demoAccounts.length > 0) {
    await db
      .insert(schema.proposal)
      .values({
        id: `prop_demo_social_${organizationId.slice(0, 8)}`,
        organizationId,
        capability: 'social_post',
        sourceKey: `social_post:demo`,
        title: 'Your channels have been quiet — post this?',
        body: 'A gentle reminder from our chairs to yours: if it’s been more than six months since your last cleaning, this is your sign. New patients are always welcome — book online in about a minute.',
        payload: { accountIds: demoAccounts.map((a) => a.id) },
        status: 'open',
        expiresAt: new Date(now.getTime() + 21 * DAY),
        isDemo: 1,
        createdAt: new Date(now.getTime() - 26 * HOUR),
      })
      .onConflictDoNothing()
  }

  // 4. Quiet-engine recall campaign — anchored to the recall audience.
  const [recallAudience] = await db
    .select({ id: schema.audiences.id, patientFilter: schema.audiences.patientFilter })
    .from(schema.audiences)
    .where(
      and(
        eq(schema.audiences.organizationId, organizationId),
        eq(schema.audiences.name, 'Recall due (6+ months)'),
      ),
    )
    .limit(1)
  if (recallAudience) {
    // The REAL recipient count — the card claims "goes to ~N patients", so N
    // must be what the send would actually resolve (honesty law).
    let recipientCount: number | null = null
    try {
      const { resolveAudience } = await import('@/lib/services/marketing')
      const recipients = await resolveAudience(organizationId, {
        recipientSource: 'patients',
        patientFilter: (recallAudience.patientFilter ?? {}) as never,
      })
      recipientCount = recipients.length
    } catch {
      recipientCount = null
    }
    await db
      .insert(schema.proposal)
      .values({
        id: `prop_demo_recall_${organizationId.slice(0, 8)}`,
        organizationId,
        capability: 'outreach_campaign',
        sourceKey: `outreach_campaign:recall:demo`,
        title:
          recipientCount != null && recipientCount > 0
            ? `${recipientCount} ${recipientCount === 1 ? 'patient is' : 'patients are'} due for a cleaning — I wrote the campaign. Send it?`
            : 'Some patients are due for a cleaning — I wrote the campaign. Send it?',
        body: `Hi {{firstName}},

It’s been a while since your last visit, and a regular cleaning is the easiest way to keep small things small.

No judgment — life gets busy. Pick a time that works and we’ll take care of the rest.`,
        payload: {
          audienceId: recallAudience.id,
          subject: 'Time for a cleaning? We’d love to see you',
          name: 'Recall — demo',
          // The REAL resolved count — the meta line reads the payload, so a
          // hardcoded number here contradicted the title built two lines up
          // (round-1 Phase-2 audit). Null when the resolve failed: the card
          // simply shows no count rather than an invented one.
          ...(recipientCount != null && recipientCount > 0 ? { recipientCount } : {}),
        },
        status: 'open',
        expiresAt: new Date(now.getTime() + 14 * DAY),
        isDemo: 1,
        createdAt: new Date(now.getTime() - 30 * HOUR),
      })
      .onConflictDoNothing()
  }
}
