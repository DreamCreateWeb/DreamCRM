import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The proposal service (Transformation Phase 2 — primitive #2). Pins the
 * contract the Approval Inbox stands on:
 *  - fileProposal is idempotent on (org, sourceKey) — one proposal per piece
 *    of work, ever (a decline is a "no" the machine never re-asks about);
 *  - approve atomically claims, executes the (possibly edited) body, and
 *    narrates EXACTLY ONCE in the ledger under the proposal's capability;
 *  - a failed execution REOPENS the proposal (work is never silently lost);
 *  - stale work (review already replied, lead already contacted) expires the
 *    proposal with a friendly error instead of double-acting;
 *  - demo proposals simulate — approve never networks.
 */

interface ProposalRow {
  id: string
  organizationId: string
  capability: string
  patientId: string | null
  sourceKey: string
  title: string
  body: string
  payload: Record<string, unknown> | null
  status: string
  decidedAt: Date | null
  decidedByUserId: string | null
  executedAt: Date | null
  expiresAt: Date | null
  isDemo: number
  createdAt: Date
  updatedAt: Date
}

const store: {
  proposals: ProposalRow[]
  reviews: Array<Record<string, unknown>>
  leads: Array<Record<string, unknown>>
  postTargets: Array<Record<string, unknown>>
  /** When true, the next UPDATE that stamps executedAt throws — the
   *  bookkeeping-after-success failure the reopen region must NOT catch. */
  failExecutedAtStamp: boolean
} = { proposals: [], reviews: [], leads: [], postTargets: [], failExecutedAtStamp: false }

const { recordActionMock } = vi.hoisted(() => ({ recordActionMock: vi.fn(async (..._a: unknown[]) => true) }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: recordActionMock }))

const executors = vi.hoisted(() => ({
  replyToGoogleReview: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  createSocialPost: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, postId: 'sp1', status: 'published' })),
  markLeadContacted: vi.fn(async (..._a: unknown[]) => undefined),
  deliver: vi.fn(async (..._a: unknown[]) => undefined),
  createMarketingCampaign: vi.fn(async (..._a: unknown[]) => ({ id: 77 })),
  sendCampaign: vi.fn(async (..._a: unknown[]) => ({ channel: 'resend', attempted: 41, sent: 41, failed: 0, errors: [], suppressed: 2 })),
}))
vi.mock('@/lib/services/google-reviews', () => ({ replyToGoogleReview: executors.replyToGoogleReview }))
vi.mock('@/lib/services/social-posts', () => ({ createSocialPost: executors.createSocialPost }))
vi.mock('@/lib/services/leads', () => ({ markLeadContacted: executors.markLeadContacted }))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    name: 'Acme Dental',
    from: '"Acme Dental" <acme@dreamcreatestudio.com>',
    replyTo: 'front@acme.com',
    timeZone: 'America/Chicago',
  })),
}))
vi.mock('@/lib/email', () => ({
  deliver: executors.deliver,
  authEmailShell: (o: { introHtml: string }) => `<html>${o.introHtml}</html>`,
}))
vi.mock('@/lib/services/marketing-campaigns', () => ({ createMarketingCampaign: executors.createMarketingCampaign }))
vi.mock('@/lib/services/marketing-send', () => ({ sendCampaign: executors.sendCampaign }))

vi.mock('@/lib/db', () => {
  const T_PROPOSAL = 'proposal'
  const T_REVIEW = 'platform_review'
  const T_LEAD = 'lead'

  const tableRows = (name: string): Array<Record<string, unknown>> => {
    if (name === T_PROPOSAL) return store.proposals as unknown as Array<Record<string, unknown>>
    if (name === T_REVIEW) return store.reviews
    if (name === T_LEAD) return store.leads
    if (name === 'social_post_target') return store.postTargets
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
      if (cols) out = out.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, k === 'c' ? out.length : r[k]])))
      return out
    }
    api.orderBy = () => api
    api.limit = async (n?: number) => (typeof n === 'number' ? rowsFor().slice(0, n) : rowsFor())
    api.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
    return api
  }

  function insert(t: { __name: string }) {
    return {
      values: (vals: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (t.__name !== T_PROPOSAL) return []
            const dup = store.proposals.find(
              (p) => p.organizationId === vals.organizationId && p.sourceKey === vals.sourceKey,
            )
            if (dup) return []
            const row: ProposalRow = {
              patientId: null,
              payload: null,
              status: 'open',
              decidedAt: null,
              decidedByUserId: null,
              executedAt: null,
              expiresAt: null,
              isDemo: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...(vals as object),
            } as ProposalRow
            store.proposals.push(row)
            return [{ id: row.id }]
          },
        }),
      }),
    }
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
    const apply = () => {
      if (store.failExecutedAtStamp && t.__name === T_PROPOSAL && 'executedAt' in patch) {
        store.failExecutedAtStamp = false
        throw new Error('db blipped during bookkeeping')
      }
      const touched: Array<Record<string, unknown>> = []
      for (const r of tableRows(t.__name)) {
        if (filters.every((f) => f(r))) {
          Object.assign(r, patch)
          touched.push(r)
        }
      }
      return touched
    }
    api.returning = async () => apply()
    api.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve(apply())
      } catch (e) {
        if (reject) reject(e)
        else throw e
      }
    }
    return api
  }

  const col = (name: string) => ({ __col: name })
  const schema = {
    proposal: {
      __name: T_PROPOSAL,
      id: col('id'),
      organizationId: col('organizationId'),
      capability: col('capability'),
      patientId: col('patientId'),
      sourceKey: col('sourceKey'),
      title: col('title'),
      body: col('body'),
      payload: col('payload'),
      status: col('status'),
      decidedAt: col('decidedAt'),
      decidedByUserId: col('decidedByUserId'),
      executedAt: col('executedAt'),
      expiresAt: col('expiresAt'),
      isDemo: col('isDemo'),
      createdAt: col('createdAt'),
      updatedAt: col('updatedAt'),
    },
    platformReview: {
      __name: T_REVIEW,
      organizationId: col('organizationId'),
      platform: col('platform'),
      externalReviewId: col('externalReviewId'),
      replyComment: col('replyComment'),
      reviewerName: col('reviewerName'),
      starRating: col('starRating'),
    },
    lead: {
      __name: T_LEAD,
      id: col('id'),
      organizationId: col('organizationId'),
      name: col('name'),
      email: col('email'),
      status: col('status'),
    },
    socialPostTarget: {
      __name: 'social_post_target',
      id: col('id'),
      organizationId: col('organizationId'),
      socialPostId: col('socialPostId'),
      status: col('status'),
    },
  }
  return { db: { select, insert, update }, schema }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) =>
    (col.__col === 'platform' ? (r.platform ?? 'googlebusiness') : r[col.__col]) === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  or: (...preds: Array<(r: Record<string, unknown>) => boolean>) => (r: Record<string, unknown>) =>
    preds.some((p) => p(r)),
  gt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) > val,
  lt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) < val,
  isNull: (col: { __col: string }) => (r: Record<string, unknown>) => r[col.__col] == null,
  desc: () => 'desc',
  sql: () => 'sql',
}))

import {
  fileProposal,
  listOpenProposals,
  countOpenProposals,
  approveProposal,
  declineProposal,
  expireStaleProposals,
  textToCampaignHtml,
} from '@/lib/services/proposals'

const ORG = 'org_1'
const DAY = 24 * 60 * 60 * 1000

function seedProposal(over: Partial<ProposalRow> = {}): ProposalRow {
  const row: ProposalRow = {
    id: `prop_${store.proposals.length + 1}`,
    organizationId: ORG,
    capability: 'review_reply',
    patientId: null,
    sourceKey: `review_reply:r${store.proposals.length + 1}`,
    title: 'Reply to a review',
    body: 'Thank you for the kind words.',
    payload: { externalReviewId: 'r1' },
    status: 'open',
    decidedAt: null,
    decidedByUserId: null,
    executedAt: null,
    expiresAt: new Date(Date.now() + 30 * DAY),
    isDemo: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
  store.proposals.push(row)
  return row
}

beforeEach(() => {
  vi.clearAllMocks()
  store.proposals = []
  store.reviews = [{ organizationId: ORG, externalReviewId: 'r1', replyComment: null, reviewerName: 'Rob', starRating: 2 }]
  store.leads = [{ id: 'lead_1', organizationId: ORG, name: 'Dana Reyes', email: 'dana@x.com', status: 'new' }]
  store.postTargets = [
    { id: 't1', organizationId: ORG, socialPostId: 'sp1', status: 'published' },
    { id: 't2', organizationId: ORG, socialPostId: 'sp1', status: 'published' },
  ]
  store.failExecutedAtStamp = false
  executors.markLeadContacted.mockResolvedValue(undefined)
  executors.createSocialPost.mockResolvedValue({ ok: true, postId: 'sp1', status: 'published' } as never)
  executors.sendCampaign.mockResolvedValue({ channel: 'resend', attempted: 41, sent: 41, failed: 0, errors: [], suppressed: 2 })
})

describe('fileProposal', () => {
  it('files once, then no-ops on the same sourceKey (one proposal per piece of work, ever)', async () => {
    const a = await fileProposal({ organizationId: ORG, capability: 'review_reply', sourceKey: 'review_reply:r1', title: 'T', body: 'B' })
    const b = await fileProposal({ organizationId: ORG, capability: 'review_reply', sourceKey: 'review_reply:r1', title: 'T2', body: 'B2' })
    expect(a.filed).toBe(true)
    expect(b.filed).toBe(false)
    expect(store.proposals).toHaveLength(1)
    expect(store.proposals[0].title).toBe('T') // the first filing stands
  })

  it('a DECLINED sourceKey still blocks refiling — respect the no', async () => {
    seedProposal({ sourceKey: 'review_reply:r9', status: 'declined' })
    const r = await fileProposal({ organizationId: ORG, capability: 'review_reply', sourceKey: 'review_reply:r9', title: 'T', body: 'B' })
    expect(r.filed).toBe(false)
  })

  it('refuses empty work products', async () => {
    const r = await fileProposal({ organizationId: ORG, capability: 'review_reply', sourceKey: 'k', title: '  ', body: 'B' })
    expect(r.filed).toBe(false)
    expect(store.proposals).toHaveLength(0)
  })
})

describe('listOpenProposals / countOpenProposals', () => {
  it('lists only OPEN, unexpired proposals for THIS org', async () => {
    seedProposal({ id: 'p_open' })
    seedProposal({ id: 'p_decided', status: 'approved', sourceKey: 'k2' })
    seedProposal({ id: 'p_expired_date', sourceKey: 'k3', expiresAt: new Date(Date.now() - DAY) })
    seedProposal({ id: 'p_other_org', sourceKey: 'k4', organizationId: 'org_2' })
    const rows = await listOpenProposals(ORG)
    expect(rows.map((r) => r.id)).toEqual(['p_open'])
    expect(await countOpenProposals(ORG)).toBe(1)
  })

  it('resolves the narrator label from the capability registry', async () => {
    seedProposal({ capability: 'outreach_campaign', sourceKey: 'k5' })
    const [row] = await listOpenProposals(ORG)
    expect(row.capabilityLabel).toBe('Launch outreach campaigns')
  })
})

describe('declineProposal', () => {
  it('marks declined with the decider; never executes, never ledgers', async () => {
    const p = seedProposal()
    const r = await declineProposal(ORG, p.id, 'user_1')
    expect(r).toEqual({ ok: true, status: 'declined' })
    expect(p.status).toBe('declined')
    expect(p.decidedByUserId).toBe('user_1')
    expect(executors.replyToGoogleReview).not.toHaveBeenCalled()
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('a second decision loses cleanly', async () => {
    const p = seedProposal()
    await declineProposal(ORG, p.id, 'user_1')
    const again = await approveProposal(ORG, p.id, 'user_2')
    expect(again.ok).toBe(false)
  })
})

describe('approveProposal — review_reply', () => {
  it('executes with the body, narrates ONCE under the proposal capability', async () => {
    const p = seedProposal()
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r).toMatchObject({ ok: true, status: 'approved' })
    expect(executors.replyToGoogleReview).toHaveBeenCalledWith(ORG, 'r1', p.body)
    expect(p.status).toBe('approved')
    expect(p.executedAt).toBeInstanceOf(Date)
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('review_reply')
    expect(String(entry.summary)).toContain('Rob')
    expect(String(entry.summary)).toContain('you approved it')
    expect((entry.detail as Record<string, unknown>).approvedByUserId).toBe('user_1')
    expect((entry.detail as Record<string, unknown>).proposalId).toBe(p.id)
  })

  it('an EDITED body is what executes', async () => {
    const p = seedProposal()
    await approveProposal(ORG, p.id, 'user_1', { body: 'Rob — thank you, and the wait was on us.' })
    expect(executors.replyToGoogleReview).toHaveBeenCalledWith(ORG, 'r1', 'Rob — thank you, and the wait was on us.')
    expect(p.body).toBe('Rob — thank you, and the wait was on us.')
  })

  it('an empty edited body is refused before anything executes', async () => {
    const p = seedProposal()
    const r = await approveProposal(ORG, p.id, 'user_1', { body: '   ' })
    expect(r.ok).toBe(false)
    expect(p.status).toBe('open')
    expect(executors.replyToGoogleReview).not.toHaveBeenCalled()
  })

  it('REOPENS when the execution fails — the work is never silently lost', async () => {
    executors.replyToGoogleReview.mockResolvedValueOnce({ ok: false, error: 'Google rejected the reply: 500' } as never)
    const p = seedProposal()
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    expect(p.status).toBe('open')
    expect(p.decidedByUserId).toBeNull()
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('EXPIRES (not reopens) when someone already replied at the counter', async () => {
    store.reviews[0].replyComment = 'Handled in person'
    const p = seedProposal()
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true)
    expect(p.status).toBe('expired')
    expect(executors.replyToGoogleReview).not.toHaveBeenCalled()
    expect(recordActionMock).not.toHaveBeenCalled()
  })
})

describe('approveProposal — the other executors', () => {
  it('inquiry_response: emails the lead, marks contacted, ledgers once', async () => {
    const p = seedProposal({
      capability: 'inquiry_response',
      sourceKey: 'inquiry_response:lead_1',
      body: 'Hi Dana — we would love to see you.',
      payload: { leadId: 'lead_1', subject: 'Your question for Acme Dental' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(executors.deliver).toHaveBeenCalledTimes(1)
    const msg = executors.deliver.mock.calls[0][0] as Record<string, unknown>
    expect(msg.to).toBe('dana@x.com')
    expect(msg.subject).toBe('Your question for Acme Dental')
    expect(executors.markLeadContacted).toHaveBeenCalledWith(ORG, 'lead_1')
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect(String((recordActionMock.mock.calls[0][0] as Record<string, unknown>).summary)).toContain('Dana')
  })

  it('inquiry_response: expires when the lead was already contacted', async () => {
    store.leads[0].status = 'contacted'
    const p = seedProposal({
      capability: 'inquiry_response',
      sourceKey: 'inquiry_response:lead_1',
      payload: { leadId: 'lead_1', subject: 'S' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    expect(p.status).toBe('expired')
    expect(executors.deliver).not.toHaveBeenCalled()
  })

  it('social_post: publishes to the payload channels and narrates the ACTUAL published count', async () => {
    const p = seedProposal({
      capability: 'social_post',
      sourceKey: 'social_post:2026-07',
      body: 'A friendly reminder from our chairs to yours.',
      payload: { accountIds: ['acc_1', 'acc_2'] },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(executors.createSocialPost).toHaveBeenCalledWith(ORG, {
      postType: 'standard',
      summary: p.body,
      accountIds: ['acc_1', 'acc_2'],
    })
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect(String((recordActionMock.mock.calls[0][0] as Record<string, unknown>).summary)).toContain('2 channels')
  })

  it('social_post: a PARTIAL publish narrates what actually landed, never the requested list (round-1 #3)', async () => {
    store.postTargets = [
      { id: 't1', organizationId: ORG, socialPostId: 'sp1', status: 'published' },
      { id: 't2', organizationId: ORG, socialPostId: 'sp1', status: 'failed' },
      { id: 't3', organizationId: ORG, socialPostId: 'sp1', status: 'failed' },
    ]
    const p = seedProposal({
      capability: 'social_post',
      sourceKey: 'social_post:k',
      payload: { accountIds: ['a', 'b', 'c'] },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    const summary = String((recordActionMock.mock.calls[0][0] as Record<string, unknown>).summary)
    expect(summary).toContain('1 channel')
    expect(summary).toContain('2 channels didn’t take it')
  })

  it('social_post: ZERO channels accepting reopens — never a ledger entry for nothing', async () => {
    store.postTargets = [{ id: 't1', organizationId: ORG, socialPostId: 'sp1', status: 'failed' }]
    const p = seedProposal({ capability: 'social_post', sourceKey: 'social_post:k2', payload: { accountIds: ['a'] } })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    expect(p.status).toBe('open')
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('inquiry_response: a markLeadContacted blip after the email went out does NOT reopen (a reopen would re-send)', async () => {
    executors.markLeadContacted.mockRejectedValueOnce(new Error('db blip'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = seedProposal({
      capability: 'inquiry_response',
      sourceKey: 'inquiry_response:lead_1b',
      payload: { leadId: 'lead_1', subject: 'S' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(p.status).toBe('approved')
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('POST-EXECUTION bookkeeping failure never reopens — the work happened (round-1 #5)', async () => {
    store.failExecutedAtStamp = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = seedProposal()
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(p.status).toBe('approved') // NOT reopened — a second Approve would double-send
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it('approve answers with WHAT HAPPENED — the message is the ledger one-liner (the confirmation toast)', async () => {
    const p = seedProposal()
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.message).toContain('Replied to Rob')
  })

  it('outreach_campaign: creates + sends AS THE APPROVER so campaign_send stays silent, then narrates outreach_campaign once', async () => {
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'outreach_campaign:recall:2026-07',
      body: 'Hi {{firstName}},\n\nCome see us.',
      payload: { audienceId: 5, subject: 'We miss you', name: 'Recall — 2026-07', recipientCount: 41 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    // The approver's id rides the send — THE double-narration guard.
    expect(executors.sendCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, campaignId: 77, initiatedByUserId: 'user_1' }),
    )
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('outreach_campaign')
    expect(String(entry.summary)).toContain('41 patients')
  })

  it('outreach_campaign: a refused send (compliance gate) reopens — and the RETRY reuses the SAME campaign row (round-1 #7)', async () => {
    executors.sendCampaign.mockResolvedValueOnce({
      channel: 'resend', attempted: 0, sent: 0, failed: 0, errors: [],
      skipped: 'missing_postal_address', error: 'Add your practice address first.',
    } as never)
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k9',
      payload: { audienceId: 5, subject: 'We miss you' },
    })
    const first = await approveProposal(ORG, p.id, 'user_1')
    expect(first.ok).toBe(false)
    expect(p.status).toBe('open')
    expect(recordActionMock).not.toHaveBeenCalled()
    // The campaign id is stamped into the payload BEFORE sending…
    expect((p.payload as Record<string, unknown>).campaignId).toBe(77)
    // …so the retry never mints a second campaign row.
    const second = await approveProposal(ORG, p.id, 'user_1')
    expect(second.ok).toBe(true)
    expect(executors.createMarketingCampaign).toHaveBeenCalledTimes(1)
    expect(executors.sendCampaign).toHaveBeenLastCalledWith(expect.objectContaining({ campaignId: 77 }))
  })

  it('outreach_campaign: ZERO people reached is never a success — no "Sent to 0 patients" ledger lie (round-1 #6)', async () => {
    executors.sendCampaign.mockResolvedValueOnce({
      channel: 'resend', attempted: 0, sent: 0, failed: 0, errors: [], suppressed: 41,
    } as never)
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k10',
      payload: { audienceId: 5, subject: 'We miss you' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('emailed recently')
    expect(p.status).toBe('open')
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('outreach_campaign: already_sending on a REUSED campaign retires the card — never a re-blast (round-1 #5)', async () => {
    executors.sendCampaign.mockResolvedValueOnce({
      channel: 'resend', attempted: 0, sent: 0, failed: 0, errors: [],
      skipped: 'already_sending', error: 'This campaign is already sending or has already been sent.',
    } as never)
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k11',
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 77 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true)
    expect(p.status).toBe('expired')
    expect(executors.createMarketingCampaign).not.toHaveBeenCalled()
  })

  it('DEMO proposals simulate: no executor runs, the ledger still tells the story', async () => {
    const p = seedProposal({ isDemo: 1 })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(executors.replyToGoogleReview).not.toHaveBeenCalled()
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).detail).toMatchObject({ simulated: true })
  })
})

describe('expiry + helpers', () => {
  it('expireStaleProposals flips only past-expiry OPEN rows', async () => {
    const stale = seedProposal({ sourceKey: 'k10', expiresAt: new Date(Date.now() - DAY) })
    const fresh = seedProposal({ sourceKey: 'k11' })
    const decided = seedProposal({ sourceKey: 'k12', status: 'declined', expiresAt: new Date(Date.now() - DAY) })
    const n = await expireStaleProposals(ORG)
    expect(n).toBe(1)
    expect(stale.status).toBe('expired')
    expect(fresh.status).toBe('open')
    expect(decided.status).toBe('declined')
  })

  it('textToCampaignHtml escapes, keeps merge tokens, and adds a booking button when the draft has none', () => {
    const html = textToCampaignHtml('Hi {{firstName}},\n\nWe <3 you.')
    expect(html).toContain('{{firstName}}')
    expect(html).toContain('&lt;3')
    expect(html).toContain('href="{{bookingUrl}}"')
    // A draft that places the link itself gets no duplicate button.
    const own = textToCampaignHtml('Book here: {{bookingUrl}}')
    expect(own.match(/\{\{bookingUrl\}\}/g)).toHaveLength(1)
  })
})
