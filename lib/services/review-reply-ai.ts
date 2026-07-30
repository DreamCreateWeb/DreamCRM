import 'server-only'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { aiConfigured, runClaudeJson } from '@/lib/ai'
import { getAiUsageCount, bumpAiUsage } from '@/lib/services/ai-usage'

/**
 * AI reply drafts for synced Google reviews (Weave parity). Drafts only —
 * the clinic reads/edits before posting through the existing reply rail
 * (Zernio GBP reply endpoint). Metered per org/month like every AI surface.
 *
 * Guardrails baked into the prompt: never confirm the reviewer is a patient
 * or reference any treatment detail (HIPAA — a review reply is public), no
 * incentives, no arguing; low ratings get an apology + an offline invite.
 */

const KIND = 'review_reply_draft'

/** Monthly allowance (drafts, not posts). One plan → one allowance; this is
 *  a fair-use cost control on the AI, never a plan gate. */
export const REVIEW_REPLY_ALLOWANCE = 200
export function reviewReplyAllowance(): number {
  return REVIEW_REPLY_ALLOWANCE
}

const DraftSchema = z.object({ reply: z.string().min(1).max(1500) })

/** Machine-readable failure class — the proposal generator branches on it:
 *  org-global reasons ('not_configured' | 'no_allowance') stop its whole
 *  pass, per-review reasons ('not_found' | 'failed') skip just that review
 *  (round-2 audit: conflating the two froze the generator on one
 *  un-draftable review). */
export type ReviewReplyDraftReason =
  | 'not_configured'
  | 'no_allowance'
  | 'not_found'
  /** The PROVIDER broke — transport, 429, 5xx. An engine-level signal. */
  | 'failed'
  /** The model answered, but not with anything usable FOR THIS REVIEW.
   *  Round-2 Phase-4 audit: this used to also be 'failed', so a single
   *  profane 1★ rant the model refuses — sorted worst-first, so it leads
   *  every run — looked identical to a dead API key. It produced one
   *  Guardian failure strike a day forever, and since the review is never
   *  replied to it stays at the head of the queue permanently: on day three
   *  the practice reads as `blocked` with "look at their integrations",
   *  which is false and can never clear. */
  | 'unusable'

export async function draftGoogleReviewReply(opts: {
  organizationId: string
  externalReviewId: string
  planTier: string | null | undefined
}): Promise<
  | { ok: true; draft: string; remaining: number }
  | { ok: false; error: string; reason: ReviewReplyDraftReason }
> {
  if (!aiConfigured()) {
    return { ok: false, error: 'AI drafting isn’t configured on this environment.', reason: 'not_configured' }
  }
  const cap = reviewReplyAllowance()
  const used = await getAiUsageCount(opts.organizationId, KIND)
  if (used >= cap) {
    return {
      ok: false,
      error: `You've used this month's ${cap} AI reply drafts — replies still post fine, just written by hand.`,
      reason: 'no_allowance',
    }
  }

  const [review] = await db
    .select({
      reviewerName: schema.platformReview.reviewerName,
      starRating: schema.platformReview.starRating,
      comment: schema.platformReview.comment,
    })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, opts.organizationId),
        eq(schema.platformReview.platform, 'googlebusiness'),
        eq(schema.platformReview.externalReviewId, opts.externalReviewId),
      ),
    )
    .limit(1)
  if (!review) return { ok: false, error: 'Review not found.', reason: 'not_found' }

  const [profile] = await db
    .select({ displayName: schema.clinicProfile.displayName })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, opts.organizationId))
    .limit(1)
  const clinicName = profile?.displayName ?? 'our practice'

  // Caught, never thrown (round-2 audit): runClaudeJson rejects on
  // transport/429/5xx, and an escaped throw here killed the proposal
  // generators' whole per-org pass — including the AI-free recall one.
  const rating = review.starRating ?? null
  let result: unknown
  try {
    result = await runClaudeJson({
    model: 'sonnet',
    maxTokens: 400,
    system: [
      `You draft public replies to Google reviews for ${clinicName}, a dental practice.`,
      'Hard rules (public + HIPAA):',
      '- NEVER confirm the reviewer is a patient, and never mention any visit, treatment, date, or clinical detail — even when the review does.',
      '- Warm, human, specific to what they wrote; 2–4 sentences; no corporate boilerplate, no emojis, no offers or incentives.',
      '- 4–5 stars: thank them genuinely, reflect one thing they praised in your own words.',
      '- 1–3 stars: lead with a sincere apology for their experience, never argue or explain, invite them to call the office so a person can make it right.',
      '- Sign off with the practice name only if it reads naturally.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: `Draft a reply to this Google review.\nReviewer: ${review.reviewerName ?? 'Anonymous'}\nRating: ${rating != null ? `${rating}★` : 'not given'}\nReview: ${review.comment?.trim() || '(rating only, no text)'}`,
      },
    ],
    toolName: 'draft_review_reply',
    toolDescription: 'Return the drafted public reply.',
    inputSchema: {
      type: 'object' as const,
      properties: { reply: { type: 'string' as const, description: 'The reply text, 2–4 sentences.' } },
      required: ['reply'],
    },
    })
  } catch (err) {
    console.warn('[review-reply-ai] draft call failed', err)
    return { ok: false, error: 'The draft didn’t come back — try again in a moment.', reason: 'failed' }
  }

  const parsed = DraftSchema.safeParse(result)
  if (!parsed.success) {
    return { ok: false, error: 'The draft didn’t come back usable — try again in a moment.', reason: 'unusable' }
  }

  await bumpAiUsage(opts.organizationId, KIND)
  return { ok: true, draft: parsed.data.reply.trim(), remaining: cap - used - 1 }
}
