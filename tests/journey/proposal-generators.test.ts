import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The proposal generators (Transformation Phase 2). Pins the generator laws:
 *  - AI-drafted types (review replies, inquiry answers, social posts) SKIP
 *    entirely when AI is unconfigured — a generic template aimed at a
 *    specific human is worse than nothing;
 *  - sourceKey dedupe happens BEFORE any AI spend;
 *  - per-run caps hold; phone-only inquiries are left to the Leads board;
 *  - the quiet-engine campaign fires only when the engine is truly quiet
 *    (enough reachable due patients, nothing sent, nothing scheduled) and
 *    needs no AI at all (code-owned copy);
 *  - the invalidation sweep expires proposals whose work vanished.
 */

const ai = vi.hoisted(() => ({
  configured: true,
  runClaudeJson: vi.fn(async (..._a: unknown[]) => ({ text: 'A warm, drafted reply.' })),
}))
vi.mock('@/lib/ai', () => ({
  aiConfigured: () => ai.configured,
  runClaudeJson: (...a: unknown[]) => ai.runClaudeJson(...a),
}))
vi.mock('@/lib/services/service-library-ai', () => ({ CORE_VOICE_RULES: 'Voice rules.' }))

const usage = vi.hoisted(() => ({ overCap: false, bumps: 0 }))
vi.mock('@/lib/services/ai-usage', () => ({
  isAiUsageOverCap: vi.fn(async () => usage.overCap),
  bumpAiUsage: vi.fn(async () => { usage.bumps++ }),
}))

const proposalsSvc = vi.hoisted(() => ({
  fileProposal: vi.fn(async (..._a: unknown[]) => ({ filed: true, id: 'prop_x' })),
  expireStaleProposals: vi.fn(async () => 0),
  reconcileStrandedApprovals: vi.fn(async () => 0),
  // false = not attributable → the sweep's plain batch expiry proceeds.
  closeRecoveredProposal: vi.fn(async (..._a: unknown[]) => false),
}))
vi.mock('@/lib/services/proposals', () => proposalsSvc)

// THE single review-reply drafting home (hardened public+HIPAA prompt +
// the one review_reply_draft meter) — the generator must call this, never
// its own prompt (round-1 audit #17).
const reviewReplyAi = vi.hoisted(() => ({
  draftGoogleReviewReply: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, draft: 'A warm, drafted public reply.', remaining: 100 })),
}))
vi.mock('@/lib/services/review-reply-ai', () => reviewReplyAi)
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

const channels = vi.hoisted(() => ({
  list: [
    { accountId: 'acc_gbp', platform: 'googlebusiness', label: 'Google Business', icon: 'G', handle: 'Acme' },
    { accountId: 'acc_ig', platform: 'instagram', label: 'Instagram', icon: 'I', handle: '@acme' },
  ] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/services/social-posts', () => ({
  getComposerChannels: vi.fn(async () => channels.list),
}))

const recall = vi.hoisted(() => ({
  stats: {
    recallDueReachableCount: 41,
    recentSends: [] as unknown[],
    upcomingSends: [] as unknown[],
  },
}))
vi.mock('@/lib/services/recall-stats', () => ({
  getRecallStats: vi.fn(async () => recall.stats),
}))
vi.mock('@/lib/services/outreach-tiers', () => ({
  ensureOutreachTierAudiences: vi.fn(async () => new Map([['recall_due', 5]])),
}))

const store: {
  orgs: Array<Record<string, unknown>>
  reviews: Array<Record<string, unknown>>
  leads: Array<Record<string, unknown>>
  postTargets: Array<Record<string, unknown>>
  proposals: Array<Record<string, unknown>>
} = { orgs: [], reviews: [], leads: [], postTargets: [], proposals: [] }

vi.mock('@/lib/db', () => {
  const tableRows = (name: string) => {
    if (name === 'organization') return store.orgs
    if (name === 'platform_review') return store.reviews
    if (name === 'lead') return store.leads
    if (name === 'social_post_target') return store.postTargets
    if (name === 'proposal') return store.proposals
    return []
  }
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    const rowsFor = () => {
      let out = tableRows(table).filter((r) => filters.every((f) => f(r)))
      if (cols) out = out.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, r[k]])))
      return out
    }
    api.orderBy = () => api
    api.limit = async (n?: number) => (typeof n === 'number' ? rowsFor().slice(0, n) : rowsFor())
    api.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
    return api
  }
  function update(t: { __name: string }) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.set = (p: Record<string, unknown>) => { patch = p; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      for (const r of tableRows(t.__name)) if (filters.every((f) => f(r))) Object.assign(r, patch)
      resolve(undefined)
    }
    return api
  }
  const col = (name: string) => ({ __col: name })
  const schema = {
    organization: { __name: 'organization', id: col('id'), name: col('name'), type: col('type'), isDemo: col('isDemo') },
    platformReview: {
      __name: 'platform_review',
      organizationId: col('organizationId'),
      platform: col('platform'),
      externalReviewId: col('externalReviewId'),
      reviewerName: col('reviewerName'),
      starRating: col('starRating'),
      comment: col('comment'),
      replyComment: col('replyComment'),
      reviewCreatedAt: col('reviewCreatedAt'),
      createdAt: col('createdAt'),
    },
    lead: {
      __name: 'lead',
      id: col('id'),
      organizationId: col('organizationId'),
      name: col('name'),
      email: col('email'),
      message: col('message'),
      preferredDate: col('preferredDate'),
      status: col('status'),
      createdAt: col('createdAt'),
    },
    socialPostTarget: {
      __name: 'social_post_target',
      id: col('id'),
      organizationId: col('organizationId'),
      status: col('status'),
      publishedAt: col('publishedAt'),
    },
    proposal: {
      __name: 'proposal',
      id: col('id'),
      organizationId: col('organizationId'),
      capability: col('capability'),
      sourceKey: col('sourceKey'),
      status: col('status'),
      payload: col('payload'),
      decidedAt: col('decidedAt'),
      createdAt: col('createdAt'),
      updatedAt: col('updatedAt'),
    },
  }
  return { db: { select, update }, schema }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) =>
    (col.__col === 'platform' ? (r.platform ?? 'googlebusiness') : r[col.__col]) === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  gte: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) >= val,
  inArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    vals.includes(r[col.__col]),
  // An and(...) in this mock is an ARRAY of predicates — evaluate it as a
  // conjunction, do NOT flatten it into the or's disjuncts.
  or: (...preds: unknown[]) => (r: Record<string, unknown>) =>
    preds
      .filter(Boolean)
      .some((p) => (typeof p === 'function' ? (p as (row: Record<string, unknown>) => boolean)(r) : Array.isArray(p) ? (p as Array<(row: Record<string, unknown>) => boolean>).every((f) => f(r)) : false)),
  isNull: (col: { __col: string }) => (r: Record<string, unknown>) => r[col.__col] == null,
  desc: () => 'desc',
  sql: () => () => true,
}))

import {
  generateReviewReplyProposals,
  generateInquiryResponseProposals,
  generateSocialPostProposals,
  generateOutreachCampaignProposals,
  sweepInvalidatedProposals,
  monthKey,
} from '@/lib/services/proposal-generators'

const ORG = 'org_1'
const NOW = new Date('2026-07-27T15:00:00Z')
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
  ai.configured = true
  ai.runClaudeJson.mockResolvedValue({ text: 'A warm, drafted reply.' })
  usage.overCap = false
  usage.bumps = 0
  channels.list = [
    { accountId: 'acc_gbp', platform: 'googlebusiness', label: 'Google Business', icon: 'G', handle: 'Acme' },
    { accountId: 'acc_ig', platform: 'instagram', label: 'Instagram', icon: 'I', handle: '@acme' },
  ]
  recall.stats = { recallDueReachableCount: 41, recentSends: [], upcomingSends: [] }
  store.orgs = [{ id: ORG, name: 'Acme Dental', type: 'clinic', isDemo: false }]
  store.reviews = []
  store.leads = []
  store.postTargets = []
  store.proposals = []
  proposalsSvc.fileProposal.mockResolvedValue({ filed: true, id: 'prop_x' })
})

describe('review replies', () => {
  const review = (id: string, over: Record<string, unknown> = {}) => ({
    organizationId: ORG, platform: 'googlebusiness', externalReviewId: id,
    reviewerName: 'Rob', starRating: 2, comment: 'Long wait.', replyComment: null,
    reviewCreatedAt: new Date(NOW.getTime() - DAY), createdAt: new Date(NOW.getTime() - DAY),
    ...over,
  })

  it('drafts through THE single review-reply home (the hardened HIPAA prompt), capped at 2 per run, with the review quoted in payload.context', async () => {
    store.reviews = [review('r1'), review('r2'), review('r3')]
    const n = await generateReviewReplyProposals(ORG, NOW)
    expect(n).toBe(2)
    // The single home — never a local prompt fork (round-1 audit #17).
    expect(reviewReplyAi.draftGoogleReviewReply).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, externalReviewId: 'r1' }),
    )
    expect(proposalsSvc.fileProposal).toHaveBeenCalledTimes(2)
    const first = proposalsSvc.fileProposal.mock.calls[0][0] as Record<string, unknown>
    expect(first.capability).toBe('review_reply')
    expect(first.sourceKey).toBe('review_reply:r1')
    expect(first.payload).toMatchObject({
      externalReviewId: 'r1',
      context: { kind: 'review', author: 'Rob', starRating: 2, text: 'Long wait.' },
    })
    expect(String(first.body)).toBe('A warm, drafted public reply.')
  })

  it('SKIPS entirely when AI is unconfigured — no template fallback for a specific human', async () => {
    ai.configured = false
    store.reviews = [review('r1')]
    const n = await generateReviewReplyProposals(ORG, NOW)
    expect(n).toBe(0)
    expect(proposalsSvc.fileProposal).not.toHaveBeenCalled()
  })

  it('checks the sourceKey BEFORE spending an AI draft', async () => {
    store.reviews = [review('r1')]
    store.proposals = [{ organizationId: ORG, sourceKey: 'review_reply:r1', status: 'declined' }]
    const n = await generateReviewReplyProposals(ORG, NOW)
    expect(n).toBe(0)
    expect(reviewReplyAi.draftGoogleReviewReply).not.toHaveBeenCalled()
  })

  it('STOPS at the first global refusal (no allowance) — never burns a call per remaining review (round-2)', async () => {
    reviewReplyAi.draftGoogleReviewReply.mockResolvedValue({ ok: false, reason: 'no_allowance', error: 'over the monthly cap' } as never)
    store.reviews = [review('r1'), review('r2')]
    const n = await generateReviewReplyProposals(ORG, NOW)
    expect(n).toBe(0)
    expect(reviewReplyAi.draftGoogleReviewReply).toHaveBeenCalledTimes(1)
    expect(proposalsSvc.fileProposal).not.toHaveBeenCalled()
  })

  it('a PER-REVIEW failure skips just that review — the siblings still get their drafts (round-2)', async () => {
    reviewReplyAi.draftGoogleReviewReply
      .mockResolvedValueOnce({ ok: false, reason: 'failed', error: 'the model hiccuped' } as never)
      .mockResolvedValueOnce({ ok: true, draft: 'A warm, drafted public reply.', remaining: 99 } as never)
    store.reviews = [review('r1'), review('r2')]
    const n = await generateReviewReplyProposals(ORG, NOW)
    expect(n).toBe(1)
    expect(reviewReplyAi.draftGoogleReviewReply).toHaveBeenCalledTimes(2)
    expect(proposalsSvc.fileProposal).toHaveBeenCalledTimes(1)
  })
})

describe('inquiry responses', () => {
  const lead = (id: string, over: Record<string, unknown> = {}) => ({
    id, organizationId: ORG, name: 'Dana Reyes', email: 'dana@x.com',
    message: 'Do you take my insurance?', preferredDate: null, status: 'new',
    createdAt: new Date(NOW.getTime() - DAY),
    ...over,
  })

  it('drafts an email answer for fresh NEW leads with an email', async () => {
    store.leads = [lead('l1')]
    const n = await generateInquiryResponseProposals(ORG, 'Acme Dental', NOW)
    expect(n).toBe(1)
    const call = proposalsSvc.fileProposal.mock.calls[0][0] as Record<string, unknown>
    expect(call.capability).toBe('inquiry_response')
    expect(call.sourceKey).toBe('inquiry_response:l1')
    expect(call.payload).toMatchObject({
      leadId: 'l1',
      subject: 'Your question for Acme Dental',
      // The inquiry itself rides the card (round-1 gap: never answer blind).
      context: { kind: 'inquiry', author: 'Dana Reyes', text: 'Do you take my insurance?' },
    })
    expect(String(call.title)).toContain('Dana')
  })

  it('phone-only inquiries stay on the Leads board (no email to write to)', async () => {
    store.leads = [lead('l1', { email: null })]
    const n = await generateInquiryResponseProposals(ORG, 'Acme Dental', NOW)
    expect(n).toBe(0)
    expect(ai.runClaudeJson).not.toHaveBeenCalled()
  })

  it('caps at 3 filings per run', async () => {
    store.leads = ['l1', 'l2', 'l3', 'l4', 'l5'].map((id) => lead(id))
    const n = await generateInquiryResponseProposals(ORG, 'Acme Dental', NOW)
    expect(n).toBe(3)
  })

  it('a PER-LEAD draft failure skips just that lead — the older inquiries behind it still get answers (round-3)', async () => {
    ai.runClaudeJson
      .mockRejectedValueOnce(new Error('model hiccup'))
      .mockResolvedValueOnce({ text: 'A warm, drafted reply.' })
    store.leads = [lead('l1'), lead('l2', { createdAt: new Date(NOW.getTime() - 2 * DAY) })]
    const n = await generateInquiryResponseProposals(ORG, 'Acme Dental', NOW)
    expect(n).toBe(1)
    expect(ai.runClaudeJson).toHaveBeenCalledTimes(2)
    const call = proposalsSvc.fileProposal.mock.calls[0][0] as Record<string, unknown>
    expect(call.sourceKey).toBe('inquiry_response:l2')
  })

  it('an ORG-GLOBAL refusal (over the monthly cap) still ends the pass after one probe (round-3)', async () => {
    usage.overCap = true
    store.leads = [lead('l1'), lead('l2', { createdAt: new Date(NOW.getTime() - 2 * DAY) })]
    const n = await generateInquiryResponseProposals(ORG, 'Acme Dental', NOW)
    expect(n).toBe(0)
    expect(ai.runClaudeJson).not.toHaveBeenCalled()
    expect(proposalsSvc.fileProposal).not.toHaveBeenCalled()
  })
})

const TZ = 'America/Chicago'

describe('social posts (quiet channels)', () => {
  it('files ONE per clinic-local calendar month when channels exist and nothing published in 14d', async () => {
    const n = await generateSocialPostProposals(ORG, 'Acme Dental', NOW, TZ)
    expect(n).toBe(1)
    const call = proposalsSvc.fileProposal.mock.calls[0][0] as Record<string, unknown>
    expect(call.capability).toBe('social_post')
    expect(call.sourceKey).toBe(`social_post:${monthKey(NOW, TZ)}`)
    // The DESTINATIONS ride the payload, named on the card (verification
    // round: a count hid that one channel is the Google Business listing).
    expect(call.payload).toEqual({
      accountIds: ['acc_gbp', 'acc_ig'],
      channels: [
        { accountId: 'acc_gbp', label: 'Google Business' },
        { accountId: 'acc_ig', label: 'Instagram' },
      ],
    })
  })

  it('stays silent when a post went out recently — the channels are not quiet', async () => {
    store.postTargets = [
      { id: 't1', organizationId: ORG, status: 'published', publishedAt: new Date(NOW.getTime() - 3 * DAY) },
    ]
    expect(await generateSocialPostProposals(ORG, 'Acme Dental', NOW, TZ)).toBe(0)
  })

  it('stays silent with no connected channels', async () => {
    channels.list = []
    expect(await generateSocialPostProposals(ORG, 'Acme Dental', NOW, TZ)).toBe(0)
  })

  it('asks at most once per month (the monthKey sourceKey)', async () => {
    store.proposals = [{ organizationId: ORG, sourceKey: `social_post:${monthKey(NOW, TZ)}`, status: 'declined' }]
    expect(await generateSocialPostProposals(ORG, 'Acme Dental', NOW, TZ)).toBe(0)
    expect(ai.runClaudeJson).not.toHaveBeenCalled()
  })

  it('RESPECTS a fresh no across the month boundary: declined <14 days ago blocks the next month key too', async () => {
    // Declined July 25; it's now Aug 2 clinic-local — a new month key, but
    // the no is 8 days old. The machine does not re-ask yet (round-1 audit).
    const AUG = new Date('2026-08-02T15:00:00Z')
    store.proposals = [
      { organizationId: ORG, capability: 'social_post', sourceKey: 'social_post:2026-07', status: 'declined', decidedAt: new Date('2026-07-25T15:00:00Z') },
    ]
    expect(await generateSocialPostProposals(ORG, 'Acme Dental', AUG, TZ)).toBe(0)
    expect(ai.runClaudeJson).not.toHaveBeenCalled()
  })

  it('the clinic-local month key differs from UTC at the boundary (the CLAUDE.md bucketing law)', () => {
    // 2026-08-01T02:00Z is still July 31 evening in Chicago.
    const boundary = new Date('2026-08-01T02:00:00Z')
    expect(monthKey(boundary, 'America/Chicago')).toBe('2026-07')
    expect(monthKey(boundary, 'UTC')).toBe('2026-08')
  })
})

describe('quiet-engine recall campaign', () => {
  it('files with the real audience + reachable count when the engine is quiet — NO AI involved', async () => {
    const n = await generateOutreachCampaignProposals(ORG, NOW, TZ)
    expect(n).toBe(1)
    expect(ai.runClaudeJson).not.toHaveBeenCalled()
    const call = proposalsSvc.fileProposal.mock.calls[0][0] as Record<string, unknown>
    expect(call.capability).toBe('outreach_campaign')
    expect(call.sourceKey).toBe(`outreach_campaign:recall:${monthKey(NOW, TZ)}`)
    expect(call.payload).toMatchObject({ audienceId: 5, recipientCount: 41 })
    expect(String(call.title)).toContain('41 patients')
    expect(String(call.body)).toContain('{{firstName}}')
    // Anti-shame copy law — the draft carries the voice.
    expect(String(call.body)).toContain('No judgment')
  })

  it('stays silent below the reachable threshold', async () => {
    recall.stats.recallDueReachableCount = 9
    expect(await generateOutreachCampaignProposals(ORG, NOW, TZ)).toBe(0)
  })

  it('stays silent when something was sent recently or is already scheduled', async () => {
    recall.stats.recentSends = [{ id: 1 }]
    expect(await generateOutreachCampaignProposals(ORG, NOW, TZ)).toBe(0)
    recall.stats.recentSends = []
    recall.stats.upcomingSends = [{ id: 2 }]
    expect(await generateOutreachCampaignProposals(ORG, NOW, TZ)).toBe(0)
  })

  it('a fresh decline blocks the recall ask across the month boundary too', async () => {
    const AUG = new Date('2026-08-02T15:00:00Z')
    store.proposals = [
      { organizationId: ORG, capability: 'outreach_campaign', sourceKey: 'outreach_campaign:recall:2026-07', status: 'declined', decidedAt: new Date('2026-07-25T15:00:00Z') },
    ]
    expect(await generateOutreachCampaignProposals(ORG, AUG, TZ)).toBe(0)
  })
})

describe('the invalidation sweep', () => {
  it('expires proposals whose review got replied / lead got handled; leaves live ones open', async () => {
    store.proposals = [
      { id: 'p1', organizationId: ORG, capability: 'review_reply', sourceKey: 'k1', status: 'open', payload: { externalReviewId: 'r1' } },
      { id: 'p2', organizationId: ORG, capability: 'review_reply', sourceKey: 'k2', status: 'open', payload: { externalReviewId: 'r2' } },
      { id: 'p3', organizationId: ORG, capability: 'inquiry_response', sourceKey: 'k3', status: 'open', payload: { leadId: 'l1' } },
      { id: 'p4', organizationId: ORG, capability: 'inquiry_response', sourceKey: 'k4', status: 'open', payload: { leadId: 'l2' } },
    ]
    store.reviews = [
      { organizationId: ORG, platform: 'googlebusiness', externalReviewId: 'r1', replyComment: 'Handled at the counter' },
      { organizationId: ORG, platform: 'googlebusiness', externalReviewId: 'r2', replyComment: null },
    ]
    store.leads = [
      { id: 'l1', organizationId: ORG, status: 'contacted' },
      { id: 'l2', organizationId: ORG, status: 'new' },
    ]
    const n = await sweepInvalidatedProposals(ORG)
    expect(n).toBe(2)
    const byId = new Map(store.proposals.map((p) => [p.id, p.status]))
    expect(byId.get('p1')).toBe('expired')
    expect(byId.get('p2')).toBe('open')
    expect(byId.get('p3')).toBe('expired')
    expect(byId.get('p4')).toBe('open')
  })

  it('routes every expiry candidate through closeRecoveredProposal FIRST — our own completed work closes with its narration, never a silent batch expire (verification round 3)', async () => {
    store.proposals = [
      { id: 'p1', organizationId: ORG, capability: 'review_reply', sourceKey: 'k1', status: 'open', payload: { externalReviewId: 'r1' }, body: 'Our reply.', patientId: null, isDemo: 0 },
    ]
    store.reviews = [
      { organizationId: ORG, platform: 'googlebusiness', externalReviewId: 'r1', replyComment: 'Our reply.' },
    ]
    // Attributable: the shared closer handles it (narration + expire live
    // in proposals.ts — pinned there); the sweep must NOT batch-expire it.
    proposalsSvc.closeRecoveredProposal.mockResolvedValueOnce(true)
    const n = await sweepInvalidatedProposals(ORG)
    expect(n).toBe(1)
    expect(proposalsSvc.closeRecoveredProposal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', organizationId: ORG, capability: 'review_reply', body: 'Our reply.' }),
    )
    // The mock didn't mutate the row, and the sweep's own batch expiry
    // skipped it — proof the close path owned it.
    expect(store.proposals[0].status).toBe('open')
  })

  it('expires a "quiet channels" social card once the clinic publishes or schedules a post itself (round-3)', async () => {
    store.proposals = [
      { id: 'p1', organizationId: ORG, capability: 'social_post', sourceKey: 'social_post:2026-07', status: 'open', payload: {}, createdAt: new Date(NOW.getTime() - 5 * DAY) },
    ]
    store.postTargets = [
      { id: 't1', organizationId: ORG, status: 'published', publishedAt: new Date(NOW.getTime() - 2 * DAY) },
    ]
    expect(await sweepInvalidatedProposals(ORG)).toBe(1)
    expect(store.proposals[0].status).toBe('expired')
  })

  it('leaves the social card open when the only activity PREDATES it (that quiet spell is why it was filed)', async () => {
    store.proposals = [
      { id: 'p1', organizationId: ORG, capability: 'social_post', sourceKey: 'social_post:2026-07', status: 'open', payload: {}, createdAt: new Date(NOW.getTime() - 5 * DAY) },
    ]
    store.postTargets = [
      { id: 't1', organizationId: ORG, status: 'published', publishedAt: new Date(NOW.getTime() - 30 * DAY) },
    ]
    expect(await sweepInvalidatedProposals(ORG)).toBe(0)
    expect(store.proposals[0].status).toBe('open')
  })

  it('expires a "quiet engine" recall card once a campaign has gone out or been scheduled (round-3)', async () => {
    store.proposals = [
      { id: 'p1', organizationId: ORG, capability: 'outreach_campaign', sourceKey: 'outreach_campaign:recall:2026-07', status: 'open', payload: { audienceId: 5 }, createdAt: new Date(NOW.getTime() - 5 * DAY) },
    ]
    recall.stats.recentSends = [{ id: 9 }]
    expect(await sweepInvalidatedProposals(ORG)).toBe(1)
    expect(store.proposals[0].status).toBe('expired')

    // …and stays open while the engine is still quiet.
    store.proposals = [
      { id: 'p2', organizationId: ORG, capability: 'outreach_campaign', sourceKey: 'outreach_campaign:recall:2026-08', status: 'open', payload: { audienceId: 5 }, createdAt: new Date(NOW.getTime() - 5 * DAY) },
    ]
    recall.stats.recentSends = []
    recall.stats.upcomingSends = []
    expect(await sweepInvalidatedProposals(ORG)).toBe(0)
    expect(store.proposals[0].status).toBe('open')
  })
})
