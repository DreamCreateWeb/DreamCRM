import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * draftGoogleReviewReply — AI reply drafts for synced Google reviews.
 * Allowance gate (per-tier monthly cap), not-configured degrade, happy path
 * (drafts + meters usage), malformed model output degrades, review lookup
 * is org-scoped.
 */

const state = { selectQueue: [] as unknown[][] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: { select: () => chain() },
    schema: {
      platformReview: { organizationId: 'org', platform: 'p', externalReviewId: 'x', reviewerName: 'n', starRating: 'r', comment: 'c' },
      clinicProfile: { organizationId: 'org', displayName: 'd' },
    },
  }
})
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => ({})), eq: vi.fn(() => ({})) }))

const { aiConfiguredMock, runClaudeJsonMock } = vi.hoisted(() => ({
  aiConfiguredMock: vi.fn(() => true),
  runClaudeJsonMock: vi.fn(async () => ({ reply: 'Thank you so much — that means a lot to the whole team.' })),
}))
vi.mock('@/lib/ai', () => ({ aiConfigured: aiConfiguredMock, runClaudeJson: runClaudeJsonMock }))

const { usageCountMock, bumpMock } = vi.hoisted(() => ({
  usageCountMock: vi.fn(async () => 0),
  bumpMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/ai-usage', () => ({
  getAiUsageCount: usageCountMock,
  bumpAiUsage: bumpMock,
}))

import { draftGoogleReviewReply, reviewReplyAllowance } from '@/lib/services/review-reply-ai'

const REVIEW = { reviewerName: 'Mia H.', starRating: 5, comment: 'Best cleaning I have ever had!' }

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
  aiConfiguredMock.mockReturnValue(true)
  usageCountMock.mockResolvedValue(0)
  runClaudeJsonMock.mockResolvedValue({ reply: 'Thank you so much — that means a lot to the whole team.' })
})

describe('reviewReplyAllowance', () => {
  it('scales by plan tier', () => {
    expect(reviewReplyAllowance('premium')).toBe(200)
    expect(reviewReplyAllowance('pro')).toBe(80)
    expect(reviewReplyAllowance('basic')).toBe(20)
    expect(reviewReplyAllowance(null)).toBe(20)
  })
})

describe('draftGoogleReviewReply', () => {
  const input = { organizationId: 'org_1', externalReviewId: 'gr_1', planTier: 'pro' }

  it('drafts + meters usage on the happy path', async () => {
    state.selectQueue.push([REVIEW]) // review lookup
    state.selectQueue.push([{ displayName: 'Dream Dental' }]) // clinic name
    const r = await draftGoogleReviewReply(input)
    expect(r).toMatchObject({ ok: true, draft: expect.stringContaining('Thank you'), remaining: 79 })
    expect(bumpMock).toHaveBeenCalledWith('org_1', 'review_reply_draft')
    // The prompt carries the review content + the public/HIPAA guardrails.
    const req = runClaudeJsonMock.mock.calls[0]![0] as { system: string; messages: Array<{ content: string }> }
    expect(req.system).toContain('NEVER confirm the reviewer is a patient')
    expect(req.messages[0]!.content).toContain('Best cleaning')
  })

  it('degrades when AI is not configured', async () => {
    aiConfiguredMock.mockReturnValue(false)
    const r = await draftGoogleReviewReply(input)
    expect(r.ok).toBe(false)
    expect(runClaudeJsonMock).not.toHaveBeenCalled()
  })

  it('enforces the monthly allowance (no model call, no bump)', async () => {
    usageCountMock.mockResolvedValue(80) // pro cap
    const r = await draftGoogleReviewReply(input)
    expect(r.ok).toBe(false)
    expect(runClaudeJsonMock).not.toHaveBeenCalled()
    expect(bumpMock).not.toHaveBeenCalled()
  })

  it('returns not-found for a review outside the org (tenant scoping)', async () => {
    state.selectQueue.push([]) // review lookup misses
    const r = await draftGoogleReviewReply(input)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('not found') })
  })

  it('degrades on malformed model output without metering', async () => {
    state.selectQueue.push([REVIEW])
    state.selectQueue.push([{ displayName: 'Dream Dental' }])
    runClaudeJsonMock.mockResolvedValue({ nope: true } as never)
    const r = await draftGoogleReviewReply(input)
    expect(r.ok).toBe(false)
    expect(bumpMock).not.toHaveBeenCalled()
  })
})
