import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicWeekStart } from '@/lib/clinic-timezone'
import { GRANTED_AT_KEY } from '@/lib/autonomy'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { platformLabel } from '@/lib/types/zernio'

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
  await resetAutonomy(organizationId, now)
}

/**
 * Reset the LADDER to the demo's BASELINE (Phase 3). A demo session may
 * grant or revoke "always do this for me" — the toast, the strip and the
 * take-back all have to work in demos — so every resync throws that away
 * and restores one known state.
 *
 * The baseline is deliberately MIXED, because the ladder has two rungs and
 * a demo that shows one of them shows half the phase:
 *  - social_post is HANDED OVER, dated before the seeded cards, so the demo
 *    renders the granted card (hedged), the take-back chip, and the "what I
 *    handled on my own" tell — whose seeded entry narrates the real seeded
 *    post at ITS OWN publish instant (the social seeder re-dates that row on
 *    every resync, so it stays inside the tell's 7-day window; if it ever
 *    falls outside, the entry is skipped and the strip says the week was
 *    quiet rather than claiming stale work is fresh);
 *  - everything else stays ask-first, so the review card still shows the
 *    earned-trust nudge and the never-pre-ticked consent checkbox.
 *
 * Verification round 1: seeding the tell WITHOUT this grant made the strip
 * say "handled on my own, as you asked" while the same screen asked for
 * that permission — a claim about a grant the reset had just deleted.
 */
async function resetAutonomy(organizationId: string, now: Date): Promise<void> {
  await db
    .update(schema.clinicProfile)
    .set({
      autonomy: {
        social_post: 'auto',
        [GRANTED_AT_KEY]: { social_post: new Date(now.getTime() - 10 * DAY).toISOString() },
      },
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
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
        sql`(${schema.actionLedger.id} like 'act_demo_%' or ${schema.actionLedger.detail}->>'proposalId' like 'prop_demo_%' or ${schema.actionLedger.detail}->>'autonomyChange' is not null)`,
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
    /** Work the machine did ON ITS OWN under a standing grant (Phase 3).
     *  The Overview's "what I handled on my own" strip counts exactly these
     *  rows, so without a few the demo shows the ladder's ASK and leaves its
     *  TELL permanently in the zero state (round-3 audit). */
    autonomous?: true
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
    // (The autonomous entry that fills the "what I handled on my own"
    // strip is appended below — it has to read the seeded post's REAL
    // publish date, so it can't be a literal in this list.)
  ]

  // THE TELL. Deliberately NOT review_reply: every replied demo review is
  // already spoken for (demo_gr_1/3/8 are the earned-trust history the
  // clinic approved by hand), and claiming a reply on an unreplied one
  // would contradict the reviews page.
  //
  // ANCHORED BY IDENTITY *AND BY DATE* to the post that actually exists —
  // DEMO_SOCIAL_POSTS' demo_spost_1. Its row is seeded insert-once, so its
  // publishedAt freezes at the demo org's creation and drifts away from any
  // date we hard-code (verification round 2: the entry claimed "this week"
  // for a post /growth/social showed as weeks old). Read the real instant,
  // narrate at it, and when the post has aged out of the strip's 7-day
  // window seed nothing — a quiet strip is true; a fresh-sounding lie is
  // not. The matching grant is seeded by resetAutonomy below.
  const [seededPost] = await db
    .select({ publishedAt: schema.socialPost.publishedAt })
    .from(schema.socialPost)
    .where(
      and(
        eq(schema.socialPost.organizationId, organizationId),
        eq(schema.socialPost.id, 'spost_demo_demo_spost_1'),
      ),
    )
    .limit(1)
  if (seededPost?.publishedAt && seededPost.publishedAt.getTime() > now.getTime() - 7 * DAY) {
    entries.push({
      capability: 'social_post',
      persona: null,
      summary: () =>
        `Posted your new-patient invitation to Google, Instagram and Facebook — handled on my own, as you asked`,
      at: seededPost.publishedAt,
      autonomous: true,
    })
  }

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
      detail: { demoSeed: true, ...(e.autonomous ? { autonomous: true } : {}) },
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

  // 2. Inquiry response — anchored BY IDENTITY to the seeded demo lead
  // (Olivia Chen, olivia.c@example.com — DEMO_LEAD_SEEDS). Verification
  // round 2: the demo site is publicly live, so a newest-lead query could
  // quote a REAL person's name and message on the demo card (the exact
  // arbitrary-query anchoring the demo-org convention forbids). Seeded
  // lead missing → skip the card, never fall back to a real person.
  //
  // RESTORE THE ANCHOR first (verification round 3): triaging Olivia once
  // on /leads must not permanently cost the demo inbox its inquiry card —
  // the module's contract is "a resync always refills the demo inbox", and
  // the lead reseed only inserts leads missing BY NAME, never resetting
  // status. Same delete-and-reseed posture as every other demo artifact:
  // her lifecycle resets to a fresh 'new' (a patient minted by a past
  // convert keeps existing; the drawer's existing-patient hint covers the
  // rerun gracefully).
  await db
    .update(schema.lead)
    .set({
      status: 'new',
      convertedToPatientId: null,
      contactedAt: null,
      convertedAt: null,
      archivedAt: null,
      archivedReason: null,
      createdAt: new Date(now.getTime() - 30 * 60 * 1000), // fresh again — the "call within the hour" demo state
    })
    .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.email, 'olivia.c@example.com')))
  const [freshLead] = await db
    .select({ id: schema.lead.id, name: schema.lead.name, message: schema.lead.message, preferredDate: schema.lead.preferredDate })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.status, 'new'),
        eq(schema.lead.email, 'olivia.c@example.com'),
      ),
    )
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

  // 3. Social post — anchored to the seeded demo channels. TITLE LAW
  // (verification round): the demo org seeds posts published 4 and 11 days
  // ago plus two scheduled, so the real generator's "quiet channels"
  // premise is FALSE here — the demo card must never state it (a prospect
  // sees /growth/social one click away). The demo card demonstrates the
  // capability with a premise-free title instead.
  const demoAccounts = await db
    .select({
      id: schema.zernioAccount.id,
      platform: schema.zernioAccount.platform,
      displayName: schema.zernioAccount.displayName,
    })
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
        title: 'A post for your channels, ready to go',
        body: 'A gentle reminder from our chairs to yours: if it’s been more than six months since your last cleaning, this is your sign. New patients are always welcome — book online in about a minute.',
        payload: {
          accountIds: demoAccounts.map((a) => a.id),
          // Destinations named on the card, same label choice as the real
          // generator (platformLabel — verification round 2: every demo
          // account's displayName is 'Dream Dental', which rendered
          // 'posts to Dream Dental, Dream Dental, Dream Dental').
          channels: demoAccounts.map((a) => ({
            accountId: a.id,
            label: platformLabel(a.platform),
          })),
        },
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

  await seedApprovedHistory(organizationId, now)
}

/**
 * The EARNED-TRUST history (Phase 3): three past review replies the clinic
 * approved exactly as written (originalBody null = unedited), so the demo's
 * open review card shows the real suggestion — "you've said yes to the last
 * 3 of these without changing a word". Anchored BY IDENTITY to the demo
 * reviews that actually carry a reply (demo_gr_1/3/8): a seeded "we replied
 * to this" for a review with no reply on it would be fake content, and the
 * count must read the same rows the reviews page shows. Missing review →
 * skip that entry, never substitute another.
 *
 * Each row carries a REAL HUMAN decider (round-2 audit). The run counts only
 * human yeses now — a null decider means "the machine's own yes under a
 * standing grant" — so an unstamped seed both vanished from the count and
 * asserted the machine had approved its own drafts. No owner on the demo
 * org → skip the seed rather than seed a lie.
 */
async function seedApprovedHistory(organizationId: string, now: Date): Promise<void> {
  const REPLIED = ['demo_gr_1', 'demo_gr_3', 'demo_gr_8'] as const
  const [decider] = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        inArray(schema.member.role, ['owner', 'admin']),
      ),
    )
    .limit(1)
  if (!decider) return
  const rows = await db
    .select({
      externalReviewId: schema.platformReview.externalReviewId,
      reviewerName: schema.platformReview.reviewerName,
      replyComment: schema.platformReview.replyComment,
    })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, organizationId),
        inArray(schema.platformReview.externalReviewId, [...REPLIED]),
        sql`${schema.platformReview.replyComment} is not null`,
      ),
    )
  let n = 0
  for (const r of rows) {
    n++
    const first = r.reviewerName?.trim().split(/\s+/)[0] ?? 'a patient'
    const decidedAt = new Date(now.getTime() - n * 2 * DAY)
    await db
      .insert(schema.proposal)
      .values({
        id: `prop_demo_hist_${n}_${organizationId.slice(0, 8)}`,
        organizationId,
        capability: 'review_reply',
        sourceKey: `review_reply:${r.externalReviewId}`,
        title: `Reply to ${first}’s Google review`,
        // The body IS the reply that sits on the review — the history says
        // "this went out", so it must match what actually went out.
        body: r.replyComment ?? '',
        // null originalBody = approved without a single edit; that is the
        // whole signal the suggestion counts.
        originalBody: null,
        payload: { externalReviewId: r.externalReviewId },
        status: 'approved',
        decidedAt,
        decidedByUserId: decider.userId,
        executedAt: decidedAt,
        isDemo: 1,
        createdAt: new Date(decidedAt.getTime() - 3 * HOUR),
      })
      .onConflictDoNothing()
  }
}
