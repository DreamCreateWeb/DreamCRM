import 'server-only'
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { z } from 'zod'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { isAiUsageOverCap, bumpAiUsage } from '@/lib/services/ai-usage'
import { fileProposal, expireStaleProposals } from '@/lib/services/proposals'

/**
 * PROPOSAL GENERATORS (Transformation Phase 2). The machine notices work it
 * could do, FINISHES it (drafts the actual reply / post / campaign), and
 * files it as a proposal for the Approval Inbox. Four first types, per the
 * doctrine's build order: review replies, social posts, quiet-engine recall
 * campaigns, inquiry responses.
 *
 * Laws:
 *  - A proposal is finished work. AI-drafted types (review replies, inquiry
 *    answers, social posts) SKIP entirely when AI isn't configured — a
 *    generic template reply to a specific human being is worse than none.
 *    The recall campaign drafts from code-owned copy (like the retention
 *    automations') and needs no AI.
 *  - Idempotent + respectful: `sourceKey` files each piece of work at most
 *    once, ever — a decline is a "no" the machine never re-asks about.
 *    Cadence-shaped types (social, recall) key by calendar month, so the
 *    machine asks at most monthly.
 *  - Demo orgs never generate (their inbox is seeded — demo-clinic.ts).
 *  - Best-effort everywhere: one org's failure never stops the sweep, and a
 *    generator failure never blocks the others.
 */

const AI_KIND = 'proposal_draft'
// Flat monthly cap per org (NOT plan-branched — no-plan-gating convention).
export const PROPOSAL_DRAFT_MONTHLY_CAP = 300

// Per-run filing caps keep any single tick calm (and bound AI spend).
const MAX_REVIEW_REPLIES_PER_RUN = 2
const MAX_INQUIRY_RESPONSES_PER_RUN = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM' — the cadence key for at-most-monthly proposal types. */
export function monthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface GeneratorRunResult {
  orgsScanned: number
  filed: number
  expired: number
  errors: Array<{ organizationId: string; error: string }>
}

/** The cron entrypoint: sweep staleness, then run all four generators for
 *  every real (non-demo) clinic org. */
export async function runProposalGenerators(now: Date = new Date()): Promise<GeneratorRunResult> {
  const result: GeneratorRunResult = { orgsScanned: 0, filed: 0, expired: 0, errors: [] }
  result.expired += await expireStaleProposals()

  const orgs = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .where(and(eq(schema.organization.type, 'clinic'), eq(schema.organization.isDemo, false)))

  for (const org of orgs) {
    result.orgsScanned++
    try {
      result.expired += await sweepInvalidatedProposals(org.id)
      result.filed += await generateReviewReplyProposals(org.id, org.name, now)
      result.filed += await generateInquiryResponseProposals(org.id, org.name, now)
      result.filed += await generateSocialPostProposals(org.id, org.name, now)
      result.filed += await generateOutreachCampaignProposals(org.id, now)
    } catch (e) {
      result.errors.push({ organizationId: org.id, error: (e as Error).message })
    }
  }
  return result
}

/**
 * Expire open proposals whose underlying work vanished out from under them —
 * a review replied to at the counter, an inquiry someone already called
 * back. Approval re-checks too; this keeps the inbox honest between taps.
 */
export async function sweepInvalidatedProposals(organizationId: string): Promise<number> {
  let expired = 0
  const open = await db
    .select({
      id: schema.proposal.id,
      capability: schema.proposal.capability,
      payload: schema.proposal.payload,
    })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.status, 'open')))
  if (open.length === 0) return 0

  const toExpire: string[] = []
  const reviewIds = new Map<string, string>() // externalReviewId → proposalId
  const leadIds = new Map<string, string>()
  for (const p of open) {
    const payload = (p.payload ?? {}) as Record<string, unknown>
    if (p.capability === 'review_reply' && typeof payload.externalReviewId === 'string') {
      reviewIds.set(payload.externalReviewId, p.id)
    } else if (p.capability === 'inquiry_response' && typeof payload.leadId === 'string') {
      leadIds.set(payload.leadId, p.id)
    }
  }
  if (reviewIds.size > 0) {
    const rows = await db
      .select({ externalReviewId: schema.platformReview.externalReviewId, replyComment: schema.platformReview.replyComment })
      .from(schema.platformReview)
      .where(
        and(
          eq(schema.platformReview.organizationId, organizationId),
          eq(schema.platformReview.platform, 'googlebusiness'),
          inArray(schema.platformReview.externalReviewId, Array.from(reviewIds.keys())),
        ),
      )
    const present = new Set<string>()
    for (const r of rows) {
      present.add(r.externalReviewId)
      if (r.replyComment) toExpire.push(reviewIds.get(r.externalReviewId)!)
    }
    // Review row gone entirely → the draft has nothing to attach to.
    for (const [rid, pid] of Array.from(reviewIds.entries())) if (!present.has(rid)) toExpire.push(pid)
  }
  if (leadIds.size > 0) {
    const rows = await db
      .select({ id: schema.lead.id, status: schema.lead.status })
      .from(schema.lead)
      .where(and(eq(schema.lead.organizationId, organizationId), inArray(schema.lead.id, Array.from(leadIds.keys()))))
    const present = new Set<string>()
    for (const r of rows) {
      present.add(r.id)
      if (r.status !== 'new') toExpire.push(leadIds.get(r.id)!)
    }
    for (const [lid, pid] of Array.from(leadIds.entries())) if (!present.has(lid)) toExpire.push(pid)
  }

  if (toExpire.length > 0) {
    await db
      .update(schema.proposal)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(schema.proposal.organizationId, organizationId),
          eq(schema.proposal.status, 'open'),
          inArray(schema.proposal.id, toExpire),
        ),
      )
    expired = toExpire.length
  }
  return expired
}

// ── Shared AI drafting helper ────────────────────────────────────────────────

const DraftSchema = z.object({ text: z.string().min(1).max(2000) })

async function draftText(
  organizationId: string,
  opts: { system: string; user: string; maxTokens?: number },
): Promise<string | null> {
  if (!aiConfigured()) return null
  if (await isAiUsageOverCap(organizationId, AI_KIND, PROPOSAL_DRAFT_MONTHLY_CAP)) return null
  let raw: unknown
  try {
    raw = await runClaudeJson({
      model: 'sonnet',
      maxTokens: opts.maxTokens ?? 500,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      toolName: 'draft_text',
      toolDescription: 'Return the drafted text for a staff member to review.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The drafted text.' } },
        required: ['text'],
      },
    })
  } catch (err) {
    console.warn('[proposal-generators] AI draft failed', err)
    return null
  }
  const parsed = DraftSchema.safeParse(raw)
  if (!parsed.success) return null
  await bumpAiUsage(organizationId, AI_KIND)
  return parsed.data.text.trim()
}

/** Cheap existence check so we never spend an AI draft on an already-claimed
 *  sourceKey (fileProposal would just no-op after the money was spent). */
async function sourceKeyTaken(organizationId: string, sourceKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  return !!row
}

// ── 1. Review replies ────────────────────────────────────────────────────────

export async function generateReviewReplyProposals(
  organizationId: string,
  clinicName: string,
  now: Date = new Date(),
): Promise<number> {
  if (!aiConfigured()) return 0
  // Unreplied Google reviews, worst-first (a 1–2★ deserves the fastest
  // answer), then newest.
  const reviews = await db
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
        eq(schema.platformReview.platform, 'googlebusiness'),
        isNull(schema.platformReview.replyComment),
      ),
    )
    .orderBy(
      sql`case when ${schema.platformReview.starRating} <= 2 then 0 else 1 end`,
      desc(sql`COALESCE(${schema.platformReview.reviewCreatedAt}, ${schema.platformReview.createdAt})`),
    )
    .limit(10)

  let filed = 0
  for (const r of reviews) {
    if (filed >= MAX_REVIEW_REPLIES_PER_RUN) break
    const sourceKey = `review_reply:${r.externalReviewId}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const who = r.reviewerName?.trim() || 'A patient'
    const stars = r.starRating ? `${r.starRating}-star` : 'unrated'
    const lowStar = (r.starRating ?? 5) <= 2
    const draft = await draftText(organizationId, {
      system: `You are the owner of ${clinicName}, a dental clinic, drafting a public reply to a Google review. A staff member will review and edit before it posts. ${CORE_VOICE_RULES}
Additional rules:
- 1–3 sentences. Public forever — no patient health details, no confirming they are a patient beyond what they themselves wrote.
- Thank them by first name when one is given.${lowStar ? `
- This is an unhappy review: acknowledge the frustration plainly, don't argue or make excuses, never admit legal fault, and invite them to call the office so a human can make it right.` : ''}`,
      user: `The ${stars} review${r.reviewerName ? ` from ${r.reviewerName}` : ''}:\n${r.comment?.trim() || '(no written comment — rating only)'}\n\nDraft the public reply.`,
    })
    if (!draft) break // AI unavailable / over cap — try again next run

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'review_reply',
      sourceKey,
      title: lowStar
        ? `Reply to ${who}’s ${stars} review — worth answering today`
        : `Reply to ${who}’s ${stars} Google review`,
      body: draft,
      payload: { externalReviewId: r.externalReviewId },
      expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    })
    if (ok) filed++
  }
  return filed
}

// ── 2. Inquiry responses ─────────────────────────────────────────────────────

export async function generateInquiryResponseProposals(
  organizationId: string,
  clinicName: string,
  now: Date = new Date(),
): Promise<number> {
  if (!aiConfigured()) return 0
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const leads = await db
    .select({
      id: schema.lead.id,
      name: schema.lead.name,
      email: schema.lead.email,
      message: schema.lead.message,
      preferredDate: schema.lead.preferredDate,
      createdAt: schema.lead.createdAt,
    })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.status, 'new'),
        gte(schema.lead.createdAt, weekAgo),
      ),
    )
    .orderBy(desc(schema.lead.createdAt))
    .limit(10)

  let filed = 0
  for (const lead of leads) {
    if (filed >= MAX_INQUIRY_RESPONSES_PER_RUN) break
    if (!lead.email?.trim()) continue // phone-only inquiries stay on the Leads board
    const sourceKey = `inquiry_response:${lead.id}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const first = lead.name.trim().split(/\s+/)[0] || 'there'
    const draft = await draftText(organizationId, {
      system: `You are the front desk of ${clinicName}, a dental clinic, drafting an email reply to someone who wrote in through the website. A staff member reviews and edits before it sends. ${CORE_VOICE_RULES}
Additional rules:
- 2–4 sentences. Answer their actual question as far as you honestly can; where you can't, say a team member will confirm the specifics.
- Warmly invite them to book a visit. Do not fabricate available times, prices, or insurance answers.
- No signature block — the email template signs for the clinic.`,
      user: `Their name: ${lead.name}\n${lead.preferredDate ? `Preferred date they mentioned: ${lead.preferredDate}\n` : ''}Their message:\n${lead.message?.trim() || '(no message — they just left contact details)'}\n\nDraft the reply email body.`,
    })
    if (!draft) break

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'inquiry_response',
      sourceKey,
      title: `Answer ${first}’s website inquiry`,
      body: draft,
      payload: { leadId: lead.id, subject: `Your question for ${clinicName}` },
      expiresAt: new Date(now.getTime() + 7 * DAY_MS),
    })
    if (ok) filed++
  }
  return filed
}

// ── 3. Social posts (quiet channels) ─────────────────────────────────────────

const SOCIAL_QUIET_DAYS = 14

export async function generateSocialPostProposals(
  organizationId: string,
  clinicName: string,
  now: Date = new Date(),
): Promise<number> {
  if (!aiConfigured()) return 0
  const sourceKey = `social_post:${monthKey(now)}`
  if (await sourceKeyTaken(organizationId, sourceKey)) return 0

  const { getComposerChannels } = await import('@/lib/services/social-posts')
  const channels = await getComposerChannels(organizationId)
  if (channels.length === 0) return 0

  // Quiet = nothing published on any channel in the window.
  const since = new Date(now.getTime() - SOCIAL_QUIET_DAYS * DAY_MS)
  const [recent] = await db
    .select({ id: schema.socialPostTarget.id })
    .from(schema.socialPostTarget)
    .where(
      and(
        eq(schema.socialPostTarget.organizationId, organizationId),
        eq(schema.socialPostTarget.status, 'published'),
        gte(schema.socialPostTarget.publishedAt, since),
      ),
    )
    .limit(1)
  if (recent) return 0

  const draft = await draftText(organizationId, {
    system: `You write short social posts for ${clinicName}, a dental clinic. A staff member reviews and edits before anything publishes. ${CORE_VOICE_RULES}
Additional rules:
- 2–4 sentences, no hashtag walls (at most one natural hashtag, or none).
- Evergreen and warm: a genuinely useful dental-health tip, a note about what a first visit is like, or a friendly reminder that the practice welcomes new patients.
- NEVER invent events, offers, staff names, or anything clinic-specific you weren't told.`,
    user: `Draft one post the clinic could publish this week.`,
  })
  if (!draft) return 0

  const { filed } = await fileProposal({
    organizationId,
    capability: 'social_post',
    sourceKey,
    title: `Your channels have been quiet — post this?`,
    body: draft,
    payload: { accountIds: channels.map((c) => c.accountId) },
    expiresAt: new Date(now.getTime() + 21 * DAY_MS),
  })
  return filed ? 1 : 0
}

// ── 4. Quiet-engine recall campaign ──────────────────────────────────────────

const RECALL_MIN_REACHABLE = 10

// Code-owned default copy (same posture as the retention automations'
// defaults): deterministic, anti-shame, edited by staff in the inbox.
// {{firstName}} and {{bookingUrl}} are per-recipient merge tokens.
export const RECALL_PROPOSAL_SUBJECT = 'Time for a cleaning? We’d love to see you'
export const RECALL_PROPOSAL_BODY = `Hi {{firstName}},

It’s been a while since your last visit, and a regular cleaning is the easiest way to keep small things small.

No judgment — life gets busy. Pick a time that works and we’ll take care of the rest.`

export async function generateOutreachCampaignProposals(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const sourceKey = `outreach_campaign:recall:${monthKey(now)}`
  if (await sourceKeyTaken(organizationId, sourceKey)) return 0

  const { getRecallStats } = await import('@/lib/services/recall-stats')
  const stats = await getRecallStats(organizationId)
  // The engine is QUIET: enough reachable due patients, nothing sent in the
  // last 30 days, nothing already scheduled to go.
  if (stats.recallDueReachableCount < RECALL_MIN_REACHABLE) return 0
  if (stats.recentSends.length > 0) return 0
  if (stats.upcomingSends.length > 0) return 0

  const { ensureOutreachTierAudiences } = await import('@/lib/services/outreach-tiers')
  const audienceIds = await ensureOutreachTierAudiences(organizationId)
  const audienceId = audienceIds.get('recall_due')
  if (!audienceId) return 0

  const n = stats.recallDueReachableCount
  const { filed } = await fileProposal({
    organizationId,
    capability: 'outreach_campaign',
    sourceKey,
    title: `${n} patients are due for a cleaning — I wrote the campaign. Send it?`,
    body: RECALL_PROPOSAL_BODY,
    payload: {
      audienceId,
      subject: RECALL_PROPOSAL_SUBJECT,
      name: `Recall — ${monthKey(now)}`,
      recipientCount: n,
    },
    expiresAt: new Date(now.getTime() + 14 * DAY_MS),
  })
  return filed ? 1 : 0
}
