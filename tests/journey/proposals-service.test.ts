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
  originalBody: string | null
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
  socialPosts: Array<Record<string, unknown>>
  campaigns: Array<Record<string, unknown>>
  profiles: Array<Record<string, unknown>>
  /** When true, the next UPDATE that stamps executedAt throws — the
   *  bookkeeping-after-success failure the reopen region must NOT catch. */
  failExecutedAtStamp: boolean
} = { proposals: [], reviews: [], leads: [], postTargets: [], socialPosts: [], campaigns: [], profiles: [], failExecutedAtStamp: false }

const { recordActionMock, hasEntryForProposalMock } = vi.hoisted(() => ({
  recordActionMock: vi.fn(async (..._a: unknown[]) => true),
  // The narrate-once guard, MODELLED rather than stubbed (round-2 audit):
  // it answers "is there already a WORK entry for this proposal?" from the
  // entries actually recorded. A blanket false hid the seam where a
  // hand-back note ("I couldn't do this") satisfied the guard and swallowed
  // the entry for the send that eventually happened.
  hasEntryForProposalMock: vi.fn(async (..._a: unknown[]) => {
    const proposalId = _a[1]
    return recordActionMock.mock.calls.some((c) => {
      const detail = ((c[0] as Record<string, unknown>)?.detail ?? {}) as Record<string, unknown>
      return (
        detail.proposalId === proposalId &&
        detail.autonomyChange === undefined &&
        detail.autoFailure !== true
      )
    })
  }),
}))
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: recordActionMock,
  hasEntryForProposal: hasEntryForProposalMock,
}))

const executors = vi.hoisted(() => ({
  replyToGoogleReview: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  // Mirrors the real service's persist-then-publish contract: onPersisted
  // fires with the post id BEFORE any network work (fixture realism — the
  // executor's stamp now rides this hook).
  createSocialPost: vi.fn(
    async (_org: unknown, _input: unknown, opts?: { onPersisted?: (id: string) => Promise<void> }) => {
      await opts?.onPersisted?.('sp1')
      return { ok: true as const, postId: 'sp1', status: 'published' }
    },
  ),
  markLeadContacted: vi.fn(async (..._a: unknown[]) => undefined),
  deliver: vi.fn(async (..._a: unknown[]) => undefined),
  createMarketingCampaign: vi.fn(async (..._a: unknown[]) => ({ id: 77 })),
  sendCampaign: vi.fn(async (..._a: unknown[]) => ({ channel: 'resend', attempted: 41, sent: 41, failed: 0, errors: [], suppressed: 2 })),
  getRecallStats: vi.fn(async (..._a: unknown[]) => ({ recallDueReachableCount: 41, recentSends: [] as unknown[], upcomingSends: [] as unknown[] })),
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
  authEmailShell: (o: { introHtml: string; buttonUrl?: string; buttonLabel?: string }) =>
    `<html>${o.introHtml}${o.buttonUrl ? `<a href="${o.buttonUrl}">${o.buttonLabel}</a>` : ''}</html>`,
}))
vi.mock('@/lib/services/marketing-campaigns', () => ({ createMarketingCampaign: executors.createMarketingCampaign }))
vi.mock('@/lib/services/marketing-send', () => ({
  sendCampaign: executors.sendCampaign,
  resolveClinicBookingUrl: vi.fn(async () => 'https://acme.dreamcreatestudio.com/book'),
}))
vi.mock('@/lib/services/recall-stats', () => ({ getRecallStats: executors.getRecallStats }))

vi.mock('@/lib/db', () => {
  const T_PROPOSAL = 'proposal'
  const T_REVIEW = 'platform_review'
  const T_LEAD = 'lead'

  const tableRows = (name: string): Array<Record<string, unknown>> => {
    if (name === T_PROPOSAL) return store.proposals as unknown as Array<Record<string, unknown>>
    if (name === T_REVIEW) return store.reviews
    if (name === T_LEAD) return store.leads
    if (name === 'social_post_target') return store.postTargets
    if (name === 'social_post') return store.socialPosts
    if (name === 'campaigns') return store.campaigns
    if (name === 'clinic_profile') return store.profiles
    return []
  }

  // PRODUCTION REALISM (verification round 5): real drizzle/node-postgres
  // returns MATERIALIZED SNAPSHOTS — never live references into storage.
  // The old aliasing harness hid a real bug: reopen() wrote back a stale
  // claim-time payload, which "worked" here only because `claimed` WAS the
  // store row. Snapshot everything a query hands out (jsonb deep-copied).
  const snap = (r: Record<string, unknown>): Record<string, unknown> => ({
    ...r,
    ...(r.payload && typeof r.payload === 'object'
      ? { payload: JSON.parse(JSON.stringify(r.payload)) }
      : {}),
  })

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
      let out = tableRows(table).filter((r) => filters.every((f) => f(r))).map(snap)
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
          touched.push(snap(r)) // RETURNING yields a snapshot, not the live row
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

  function del(t: { __name: string }) {
    return {
      where: async (preds: unknown) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = []
        if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
        else if (typeof preds === 'function') filters.push(preds as never)
        const rows = tableRows(t.__name)
        for (let i = rows.length - 1; i >= 0; i--) {
          if (filters.every((f) => f(rows[i]))) rows.splice(i, 1)
        }
      },
    }
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
      originalBody: col('originalBody'),
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
      publishedAt: col('publishedAt'),
    },
    socialPost: {
      __name: 'social_post',
      id: col('id'),
      organizationId: col('organizationId'),
    },
    clinicProfile: {
      __name: 'clinic_profile',
      organizationId: col('organizationId'),
      autonomy: col('autonomy'),
    },
    campaigns: {
      __name: 'campaigns',
      id: col('id'),
      organizationId: col('organizationId'),
      status: col('status'),
      subject: col('subject'),
      bodyHtml: col('bodyHtml'),
      updatedAt: col('updatedAt'),
    },
  }
  return { db: { select, insert, update, delete: del }, schema }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) =>
    (col.__col === 'platform' ? (r.platform ?? 'googlebusiness') : r[col.__col]) === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  // An and(...) in this mock is an ARRAY of predicates — evaluate it as a
  // conjunction inside the disjunction.
  or: (...preds: unknown[]) => (r: Record<string, unknown>) =>
    preds
      .filter(Boolean)
      .some((p) => (typeof p === 'function' ? (p as (row: Record<string, unknown>) => boolean)(r) : Array.isArray(p) ? (p as Array<(row: Record<string, unknown>) => boolean>).every((f) => f(r)) : false)),
  gt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) > val,
  lt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) < val,
  isNull: (col: { __col: string }) => (r: Record<string, unknown>) => r[col.__col] == null,
  isNotNull: (col: { __col: string }) => (r: Record<string, unknown>) => r[col.__col] != null,
  // and(...) yields an ARRAY of predicates in this mock, so not() has to
  // evaluate it as a conjunction (mirrors the or() handling below).
  not: (pred: unknown) => (r: Record<string, unknown>) => {
    const run = (p: unknown): boolean =>
      typeof p === 'function'
        ? (p as (row: Record<string, unknown>) => boolean)(r)
        : Array.isArray(p)
          ? (p as unknown[]).every(run)
          : false
    return !run(pred)
  },
  inArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    vals.includes(r[col.__col]),
  notInArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    !vals.includes(r[col.__col]),
  desc: () => 'desc',
  asc: () => 'asc',
  // The raw fragments this service uses are jsonb payload probes, so the
  // harness models them as row predicates rather than an opaque token —
  // a mock that matched nothing would have made the hand-back guard look
  // like it worked while excluding every card (fixture realism).
  sql: (strings?: TemplateStringsArray, ..._vals: unknown[]) => {
    const text = Array.isArray(strings) ? (strings as unknown as string[]).join('?') : ''
    if (text.includes("'handBack'")) {
      const negated = text.includes('is distinct from')
      return (r: Record<string, unknown>) => {
        const payload = (r.payload ?? {}) as Record<string, unknown>
        const given = payload.handBack === true
        return negated ? !given : given
      }
    }
    return 'sql'
  },
}))

import {
  autoExecuteProposal,
  countConsecutiveUneditedApprovals,
  fileProposal,
  listOpenProposals,
  countOpenProposals,
  approveProposal,
  declineProposal,
  expireStaleProposals,
  reconcileStrandedApprovals,
  closeRecoveredProposal,
  getSentInquiryReply,
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
    originalBody: null,
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
  store.socialPosts = []
  store.campaigns = []
  store.profiles = [{ organizationId: ORG, autonomy: null }]
  store.failExecutedAtStamp = false
  executors.markLeadContacted.mockResolvedValue(undefined)
  executors.createSocialPost.mockImplementation(
    (async (_org: unknown, _input: unknown, opts?: { onPersisted?: (id: string) => Promise<void> }) => {
      await opts?.onPersisted?.('sp1')
      return { ok: true, postId: 'sp1', status: 'published' }
    }) as never,
  )
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

  it('"waiting on your yes" EXCLUDES a capability the clinic handed over — the badge, the digest and the standup all read this count, and none of that work waits on a human (Phase 3)', async () => {
    store.profiles = [{ organizationId: ORG, autonomy: { review_reply: 'auto' } }]
    seedProposal({ id: 'p_auto', capability: 'review_reply', sourceKey: 'ka' })
    seedProposal({ id: 'p_ask', capability: 'social_post', sourceKey: 'kb' })
    expect(await countOpenProposals(ORG)).toBe(1)
    // …but the inbox still LISTS both: the count means "on you", the list
    // means "in my hands" (the granted card renders its own honest line).
    expect((await listOpenProposals(ORG)).map((r) => r.id).sort()).toEqual(['p_ask', 'p_auto'])
  })

  it('includeGranted counts the whole open population — the inbox truncation notice must compare against the list it draws from (round-1 Phase-3 audit)', async () => {
    store.profiles = [{ organizationId: ORG, autonomy: { review_reply: 'auto' } }]
    seedProposal({ id: 'p_auto', capability: 'review_reply', sourceKey: 'kg1' })
    seedProposal({ id: 'p_ask', capability: 'social_post', sourceKey: 'kg2' })
    expect(await countOpenProposals(ORG, { includeGranted: true })).toBe(2)
    expect(await countOpenProposals(ORG)).toBe(1)
  })

  it('a HANDED-BACK card counts again even under a grant — the machine stopped trying, so it really is on a human', async () => {
    store.profiles = [{ organizationId: ORG, autonomy: { review_reply: 'auto' } }]
    seedProposal({ id: 'p_given_up', capability: 'review_reply', sourceKey: 'kh1', payload: { handBack: true } })
    seedProposal({ id: 'p_running', capability: 'review_reply', sourceKey: 'kh2' })
    expect(await countOpenProposals(ORG)).toBe(1)
  })

  it('an unreadable trust setting counts EVERYTHING — never hide real work behind a failed read', async () => {
    store.profiles = []
    seedProposal({ id: 'p1', capability: 'review_reply', sourceKey: 'kc' })
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

  it('REOPENS when the execution fails — the work is never silently lost, the approve-attempt marker is stamped, and a near-death expiry is EXTENDED so "try again" is true (rounds 1 + verification 4)', async () => {
    executors.replyToGoogleReview.mockResolvedValueOnce({ ok: false, error: 'Google rejected the reply: 500' } as never)
    const p = seedProposal({ expiresAt: new Date(Date.now() + 60 * 1000) }) // last minute of the card's life
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    expect(p.status).toBe('open')
    expect(p.decidedByUserId).toBeNull()
    expect(recordActionMock).not.toHaveBeenCalled()
    // The marker lets later attribution tell our stranded work from a
    // human's; the extension keeps the reopened card VISIBLE (a reopen the
    // inbox can't show is a slower way to lose the yes).
    expect((p.payload as Record<string, unknown>).approveAttempted).toBe(true)
    expect(p.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000)
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
    // The email SIGNS for the clinic (the shell's own footer names the
    // platform) and carries the booking button — the draft invites them to
    // book, so the invitation has somewhere to go (verification round).
    expect(String(msg.html)).toContain('— Acme Dental')
    expect(String(msg.html)).toContain('https://acme.dreamcreatestudio.com/book')
    expect(String(msg.html)).toContain('Book a time')
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
    expect(executors.createSocialPost).toHaveBeenCalledWith(
      ORG,
      {
        postType: 'standard',
        summary: p.body,
        accountIds: ['acc_1', 'acc_2'],
      },
      expect.objectContaining({ onPersisted: expect.any(Function) }),
    )
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

  it('social_post: createSocialPost failing reopens — never a ledger entry for nothing, and the dead post row is superseded on retry (round-2)', async () => {
    executors.createSocialPost.mockImplementationOnce(
      (async (_org: unknown, _input: unknown, opts?: { onPersisted?: (id: string) => Promise<void> }) => {
        await opts?.onPersisted?.('sp_dead')
        return { ok: false, postId: 'sp_dead', status: 'failed', error: 'Every channel refused it.' }
      }) as never,
    )
    store.socialPosts.push({ id: 'sp_dead_seed', organizationId: ORG })
    const p = seedProposal({ capability: 'social_post', sourceKey: 'social_post:k2', payload: { accountIds: ['a'] } })
    const first = await approveProposal(ORG, p.id, 'user_1')
    expect(first.ok).toBe(false)
    expect(p.status).toBe('open')
    expect(recordActionMock).not.toHaveBeenCalled()
    // The failed attempt stamped its post id into the payload…
    expect((p.payload as Record<string, unknown>).socialPostId).toBe('sp_dead')
    // …and a retry whose prior targets are all 'failed' DELETES the dead row
    // before publishing fresh (one post history per proposal).
    store.socialPosts.push({ id: 'sp_dead', organizationId: ORG })
    store.postTargets = [
      { id: 'td', organizationId: ORG, socialPostId: 'sp_dead', status: 'failed' },
      { id: 't1', organizationId: ORG, socialPostId: 'sp1', status: 'published' },
    ]
    const second = await approveProposal(ORG, p.id, 'user_1')
    expect(second.ok).toBe(true)
    expect(store.socialPosts.some((r) => r.id === 'sp_dead')).toBe(false)
    expect(executors.createSocialPost).toHaveBeenCalledTimes(2)
    expect(recordActionMock).toHaveBeenCalledTimes(1)
  })

  it('social_post: a card filed on QUIET channels expires at the tap once a post is queued or published since drafting (round-3 self-sweep)', async () => {
    // A post the CLINIC scheduled after this card was drafted.
    store.postTargets = [{ id: 'tq', organizationId: ORG, socialPostId: 'sp_theirs', status: 'scheduled' }]
    const p = seedProposal({
      capability: 'social_post',
      sourceKey: 'social_post:k4',
      payload: { accountIds: ['a'] },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true)
    expect(p.status).toBe('expired')
    expect(executors.createSocialPost).not.toHaveBeenCalled()
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('social_post: activity that PREDATES the card does not retire it — that quiet spell is why it was filed', async () => {
    store.postTargets = [
      { id: 'told', organizationId: ORG, socialPostId: 'sp_old', status: 'published', publishedAt: new Date(Date.now() - 20 * DAY) },
      { id: 't1', organizationId: ORG, socialPostId: 'sp1', status: 'published' },
      { id: 't2', organizationId: ORG, socialPostId: 'sp1', status: 'published' },
    ]
    const p = seedProposal({ capability: 'social_post', sourceKey: 'social_post:k5', payload: { accountIds: ['a', 'b'] } })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(executors.createSocialPost).toHaveBeenCalledTimes(1)
  })

  it('social_post: a prior post with a PUBLISHED target retires the card, never double-publishes — and RECOVERY-NARRATES the work that landed exactly once (round-2 + verification)', async () => {
    store.postTargets = [{ id: 't1', organizationId: ORG, socialPostId: 'sp_prior', status: 'published' }]
    const p = seedProposal({
      capability: 'social_post',
      sourceKey: 'social_post:k3',
      payload: { accountIds: ['a'], socialPostId: 'sp_prior' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true)
    expect(p.status).toBe('expired')
    expect(p.executedAt).toBeInstanceOf(Date) // the work happened — never reopened by the reconcile sweep
    expect(executors.createSocialPost).not.toHaveBeenCalled()
    // The stranded-approve loop (die mid-approve → reconcile reopens →
    // re-approve → retire) must still satisfy narrate-EXACTLY-ONCE: the
    // prior attempt's post reached a channel and nothing had narrated it.
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('social_post')
    expect((entry.detail as Record<string, unknown>).recovered).toBe(true)
    expect(String(entry.summary)).toContain('1 channel')
  })

  it('ORDERING PIN (fixture realism): our own published target carries a real publishedAt AFTER the card was drafted — recovery still narrates; the org-wide staleness check must never shadow it (verification round 2)', async () => {
    store.postTargets = [
      { id: 't1', organizationId: ORG, socialPostId: 'sp_mine', status: 'published', publishedAt: new Date(Date.now() + 1000) },
    ]
    const p = seedProposal({
      capability: 'social_post',
      sourceKey: 'social_post:k3c',
      payload: { accountIds: ['a'], socialPostId: 'sp_mine' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.expired).toBe(true)
      // The honest message — our own earlier approve, not "a post went out
      // since I drafted this" blaming the clinic.
      expect(r.error).toContain('earlier approve')
    }
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).detail).toMatchObject({ recovered: true })
  })

  it('ORDERING PIN: the own-row recovery runs BEFORE the recall staleness check — getRecallStats (whose recentSends would include our own completed campaign) is never even consulted (verification round 2)', async () => {
    store.campaigns.push({ id: 77, organizationId: ORG, status: 'completed', subject: 'We miss you', bodyHtml: '<p>b</p>' })
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k18',
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 77 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('earlier approve')
    expect(p.status).toBe('expired')
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).detail).toMatchObject({ recovered: true })
    expect(executors.sendCampaign).not.toHaveBeenCalled()
    // The strongest ordering pin: the staleness read never ran — a match
    // there can therefore only ever be the clinic's own sending.
    expect(executors.getRecallStats).not.toHaveBeenCalled()
  })

  it('social_post: the post id is stamped the moment rows PERSIST — a death mid-publish stays attributable (verification round 3, the unstamped window)', async () => {
    executors.createSocialPost.mockImplementationOnce(
      (async (_org: unknown, _input: unknown, opts?: { onPersisted?: (id: string) => Promise<void> }) => {
        await opts?.onPersisted?.('sp_new')
        throw new Error('container replaced mid-publish')
      }) as never,
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = seedProposal({ capability: 'social_post', sourceKey: 'social_post:k6', payload: { accountIds: ['a'] } })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    expect(p.status).toBe('open') // reopened for retry
    // THE pin: the link was written before the network work began, so the
    // retry (or the reconcile) can attribute whatever published.
    expect((p.payload as Record<string, unknown>).socialPostId).toBe('sp_new')
    err.mockRestore()
  })

  it('closeRecoveredProposal (the sweep + reconcile shared home): attributable work narrates once and closes; unattributable is not_ours and touches nothing (verification rounds 3–4)', async () => {
    // Attributable on an OPEN row requires the reopened-from-approval
    // marker — verbatim text alone is not proof of OUR attempt.
    store.reviews[0].replyComment = 'Thank you for the kind words.'
    const ours = seedProposal({
      sourceKey: 'review_reply:r1x',
      payload: { externalReviewId: 'r1', approveAttempted: true },
    })
    expect(await closeRecoveredProposal(ours, 'open')).toBe('closed')
    expect(ours.status).toBe('expired')
    expect(ours.executedAt).toBeInstanceOf(Date)
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).detail).toMatchObject({ recovered: true })

    // Unattributable: someone else's words.
    recordActionMock.mockClear()
    store.reviews[0].replyComment = 'Handled at the counter'
    const theirs = seedProposal({
      sourceKey: 'review_reply:r1y',
      payload: { externalReviewId: 'r1', approveAttempted: true },
    })
    expect(await closeRecoveredProposal(theirs, 'open')).toBe('not_ours')
    expect(theirs.status).toBe('open')
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('MIS-CREDIT GUARD: a hand-pasted verbatim reply on a NEVER-APPROVED card is not_ours — the machine never claims "you approved it" for the front desk’s own work (verification round 4)', async () => {
    store.reviews[0].replyComment = 'Thank you for the kind words.'
    const neverApproved = seedProposal({ sourceKey: 'review_reply:r1z' }) // no marker, never decided
    expect(await closeRecoveredProposal(neverApproved, 'open')).toBe('not_ours')
    expect(neverApproved.status).toBe('open')
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('a TRANSIENT narration failure is skip — never a terminal unnarrated close (verification round 4)', async () => {
    hasEntryForProposalMock.mockRejectedValueOnce(new Error('db blip'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.reviews[0].replyComment = 'Thank you for the kind words.'
    const p = seedProposal({
      sourceKey: 'review_reply:r1s',
      payload: { externalReviewId: 'r1', approveAttempted: true },
    })
    expect(await closeRecoveredProposal(p, 'open')).toBe('skip')
    expect(p.status).toBe('open') // untouched — the next hourly pass retries
    expect(p.executedAt).toBeNull()
    expect(recordActionMock).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('the close is ATOMIC on the expected status: a row a concurrent approve just claimed is skip, never clobbered to expired (verification round 4)', async () => {
    hasEntryForProposalMock.mockResolvedValueOnce(true) // the approve already narrated
    store.reviews[0].replyComment = 'Thank you for the kind words.'
    const p = seedProposal({
      sourceKey: 'review_reply:r1r',
      status: 'approved', // flipped by the racing approve after the sweep read it as open
      payload: { externalReviewId: 'r1', approveAttempted: true },
    })
    expect(await closeRecoveredProposal(p, 'open')).toBe('skip')
    expect(p.status).toBe('approved') // the approve owns it
  })

  it('the TAP’s recovered retire narrates FIRST: a failed narration leaves the row approved for the hourly reconcile — never a terminal unnarrated close (verification round 5)', async () => {
    recordActionMock.mockResolvedValueOnce(false) // ledger insert swallowed a failure
    store.postTargets = [{ id: 't1', organizationId: ORG, socialPostId: 'sp_prior', status: 'published' }]
    const p = seedProposal({
      capability: 'social_post',
      sourceKey: 'social_post:k3d',
      payload: { accountIds: ['a'], socialPostId: 'sp_prior' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true) // the card still clears for the staffer
    expect(p.status).toBe('approved') // NOT terminally expired — the reconcile re-attributes
    expect(p.executedAt).toBeNull()
  })

  it('recovery narration is GUARDED: a prior ledger entry for the proposal (the stamp-failed sibling case) means no second entry', async () => {
    hasEntryForProposalMock.mockResolvedValueOnce(true)
    store.postTargets = [{ id: 't1', organizationId: ORG, socialPostId: 'sp_prior', status: 'published' }]
    const p = seedProposal({
      capability: 'social_post',
      sourceKey: 'social_post:k3b',
      payload: { accountIds: ['a'], socialPostId: 'sp_prior' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    expect(p.status).toBe('expired')
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('review_reply: OUR OWN reply already on the review recovery-narrates; SOMEONE ELSE’S words never do (verification)', async () => {
    store.reviews[0].replyComment = 'Thank you for the kind words.' // === the seeded proposal body
    const ours = seedProposal({ sourceKey: 'review_reply:r1a' })
    const r1 = await approveProposal(ORG, ours.id, 'user_1')
    expect(r1.ok).toBe(false)
    expect(ours.status).toBe('expired')
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).capability).toBe('review_reply')

    recordActionMock.mockClear()
    store.reviews[0].replyComment = 'Handled at the counter by Dr. Reyes'
    const theirs = seedProposal({ sourceKey: 'review_reply:r1b' })
    const r2 = await approveProposal(ORG, theirs.id, 'user_1')
    expect(r2.ok).toBe(false)
    expect(theirs.status).toBe('expired')
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
    // …so the retry never mints a second campaign row — and the CURRENT
    // (staff-edited) subject + body are synced onto the reused row before
    // sending, so the retry sends exactly what was approved (round-2 audit).
    store.campaigns.push({ id: 77, organizationId: ORG, status: 'draft', subject: 'We miss you', bodyHtml: '<p>old draft</p>' })
    const second = await approveProposal(ORG, p.id, 'user_1', {
      body: 'Hi {{firstName}}, the edited copy.',
      subject: 'A fresh subject',
    })
    expect(second.ok).toBe(true)
    expect(executors.createMarketingCampaign).toHaveBeenCalledTimes(1)
    expect(executors.sendCampaign).toHaveBeenLastCalledWith(expect.objectContaining({ campaignId: 77 }))
    const row = store.campaigns.find((c) => c.id === 77)
    expect(row?.subject).toBe('A fresh subject')
    expect(String(row?.bodyHtml)).toContain('the edited copy')
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

  it('outreach_campaign: a reused row that already WENT OUT retires the card pre-send, keeps the sent copy, and recovery-narrates once (rounds 1+3 + verification)', async () => {
    // The reused row already went out (a prior approve's send succeeded but
    // its bookkeeping failed) — it sits at 'completed'.
    store.campaigns.push({ id: 77, organizationId: ORG, status: 'completed', subject: 'We miss you', bodyHtml: '<p>what actually sent</p>' })
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k11',
      body: 'A body the staff edited after the send',
      payload: { audienceId: 5, subject: 'A different subject', campaignId: 77 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true)
    expect(p.status).toBe('expired')
    expect(executors.createMarketingCampaign).not.toHaveBeenCalled()
    expect(executors.sendCampaign).not.toHaveBeenCalled() // caught BEFORE any send attempt
    // The permanent record of what was SENT keeps its real copy (round-3:
    // the sync must never run against a row that already went out).
    const row = store.campaigns.find((c) => c.id === 77)
    expect(row?.subject).toBe('We miss you')
    expect(row?.bodyHtml).toBe('<p>what actually sent</p>')
    // …and the work that reached patients narrates exactly once (recovery).
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).capability).toBe('outreach_campaign')
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).detail).toMatchObject({ recovered: true })
  })

  it('outreach_campaign: the already_sending RACE (row flips after our check) HOLDS the card — the claim flag is not completion evidence, so no retire and no narration (verification round 4)', async () => {
    executors.sendCampaign.mockResolvedValueOnce({
      channel: 'resend', attempted: 0, sent: 0, failed: 0, errors: [],
      skipped: 'already_sending', error: 'This campaign is already sending or has already been sent.',
    } as never)
    store.campaigns.push({ id: 77, organizationId: ORG, status: 'draft', subject: 'We miss you', bodyHtml: '<p>b</p>' })
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k11b',
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 77 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.expired).toBeUndefined()
      expect(r.error).toContain('sending this right now')
    }
    expect(p.status).toBe('open') // held for the next look
    expect(executors.createMarketingCampaign).not.toHaveBeenCalled()
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('outreach_campaign: a STUCK claim (active, no sentAt, stale) is REPAIRED — released to draft, copy synced, and the send actually runs (verification round 4)', async () => {
    store.campaigns.push({
      id: 77,
      organizationId: ORG,
      status: 'active', // sendCampaign's claim flag, orphaned by a pre-send throw
      sentAt: null,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      subject: 'old', bodyHtml: '<p>old</p>',
    })
    // The harness sendCampaign default succeeds; the repair must let it run.
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k11c',
      body: 'Hi {{firstName}}, the recovered copy.',
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 77 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(executors.sendCampaign).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 77 }))
    const row = store.campaigns.find((c) => c.id === 77)
    expect(String(row?.bodyHtml)).toContain('the recovered copy') // the sync ran after the repair
    expect(recordActionMock).toHaveBeenCalledTimes(1) // the normal narrate-once, not a recovery
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).detail).not.toMatchObject({ recovered: true })
  })

  it('outreach_campaign: a FRESH active claim (possibly mid-flight) holds — no repair, no send, no narration', async () => {
    store.campaigns.push({
      id: 77, organizationId: ORG, status: 'active', sentAt: null,
      updatedAt: new Date(), subject: 'S', bodyHtml: 'B',
    })
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k11d',
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 77 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBeUndefined()
    expect(p.status).toBe('open')
    expect(executors.sendCampaign).not.toHaveBeenCalled()
    expect(recordActionMock).not.toHaveBeenCalled()
    const row = store.campaigns.find((c) => c.id === 77)
    expect(row?.status).toBe('active') // untouched — it may genuinely be sending
  })

  it('outreach_campaign: a DELETED reused campaign row re-mints instead of failing forever (round-3)', async () => {
    // payload.campaignId points at a row staff tidied away — no campaigns row.
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k12',
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 55 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(executors.createMarketingCampaign).toHaveBeenCalledTimes(1)
    expect((p.payload as Record<string, unknown>).campaignId).toBe(77)
    expect(recordActionMock).toHaveBeenCalledTimes(1)
  })

  it('outreach_campaign: a card filed on a quiet engine EXPIRES at the tap when a campaign has since gone out (round-3 staleness)', async () => {
    executors.getRecallStats.mockResolvedValueOnce({
      recallDueReachableCount: 41,
      recentSends: [{ id: 9 }],
      upcomingSends: [],
    } as never)
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k13',
      payload: { audienceId: 5, subject: 'We miss you' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true)
    expect(p.status).toBe('expired')
    expect(executors.createMarketingCampaign).not.toHaveBeenCalled()
    expect(executors.sendCampaign).not.toHaveBeenCalled()
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('a STRANDED approve with NO evidence of executed work is reopened by the reconcile sweep — with a passed expiry EXTENDED so the card is visible again (rounds 3 + verification 2)', async () => {
    const stranded = seedProposal({
      sourceKey: 'k14',
      status: 'approved',
      decidedAt: new Date(Date.now() - 60 * 60 * 1000),
      decidedByUserId: 'user_1',
      executedAt: null,
      expiresAt: new Date(Date.now() - 60 * 1000), // expired while stranded — must not reopen into invisibility
    })
    const fresh = seedProposal({
      sourceKey: 'k15',
      status: 'approved',
      decidedAt: new Date(Date.now() - 2 * 60 * 1000), // an executor may still be running
      executedAt: null,
    })
    const done = seedProposal({
      sourceKey: 'k16',
      status: 'approved',
      decidedAt: new Date(Date.now() - 60 * 60 * 1000),
      executedAt: new Date(),
    })
    const n = await reconcileStrandedApprovals(ORG)
    expect(n).toBe(1)
    expect(stranded.status).toBe('open')
    expect(stranded.decidedByUserId).toBeNull()
    expect(stranded.expiresAt!.getTime()).toBeGreaterThan(Date.now()) // the inbox can show it again
    expect(fresh.status).toBe('approved')
    expect(done.status).toBe('approved')
    expect(recordActionMock).not.toHaveBeenCalled() // unexecuted work never narrates
  })

  it('reconcile CLOSES a stranded approve whose work evidently executed — narrated once, expired with executedAt, never handed to the sweep (verification round 2)', async () => {
    // Social: our post's target published.
    store.postTargets = [
      { id: 't1', organizationId: ORG, socialPostId: 'sp_r', status: 'published', publishedAt: new Date() },
    ]
    const social = seedProposal({
      capability: 'social_post',
      sourceKey: 'k19',
      status: 'approved',
      decidedAt: new Date(Date.now() - 60 * 60 * 1000),
      decidedByUserId: 'user_1',
      executedAt: null,
      payload: { accountIds: ['a'], socialPostId: 'sp_r' },
    })
    // Campaign: our row completed.
    store.campaigns.push({ id: 88, organizationId: ORG, status: 'completed', subject: 'S', bodyHtml: 'B' })
    const campaign = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k20',
      status: 'approved',
      decidedAt: new Date(Date.now() - 60 * 60 * 1000),
      executedAt: null,
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 88 },
    })
    const n = await reconcileStrandedApprovals(ORG)
    expect(n).toBe(2)
    expect(social.status).toBe('expired')
    expect(social.executedAt).toBeInstanceOf(Date)
    expect(campaign.status).toBe('expired')
    expect(campaign.executedAt).toBeInstanceOf(Date)
    expect(recordActionMock).toHaveBeenCalledTimes(2)
    for (const call of recordActionMock.mock.calls) {
      expect((call[0] as Record<string, unknown>).detail).toMatchObject({ recovered: true })
    }
  })

  it('reconcile closes a stranded review approve when OUR reply is on the review; someone else’s words reopen instead', async () => {
    store.reviews[0].replyComment = 'Thank you for the kind words.'
    const ours = seedProposal({
      sourceKey: 'k21',
      status: 'approved',
      decidedAt: new Date(Date.now() - 60 * 60 * 1000),
      executedAt: null,
    })
    let n = await reconcileStrandedApprovals(ORG)
    expect(n).toBe(1)
    expect(ours.status).toBe('expired')
    expect(recordActionMock).toHaveBeenCalledTimes(1)

    recordActionMock.mockClear()
    store.reviews[0].replyComment = 'Handled at the counter'
    const theirs = seedProposal({
      sourceKey: 'k22',
      status: 'approved',
      decidedAt: new Date(Date.now() - 60 * 60 * 1000),
      executedAt: null,
    })
    n = await reconcileStrandedApprovals(ORG)
    expect(n).toBe(1)
    expect(theirs.status).toBe('open') // not ours — a human decides what happens next
    expect(recordActionMock).not.toHaveBeenCalled()
    // The reconcile's reopen stamps the marker too — this row WAS approved
    // once, so a later verbatim match may be attributed (verification 4).
    expect((theirs.payload as Record<string, unknown>).approveAttempted).toBe(true)
  })

  it('inquiry executor: a draft staff signed THEMSELVES sends as written — no second sign-off appended (verification round 2)', async () => {
    const p = seedProposal({
      capability: 'inquiry_response',
      sourceKey: 'inquiry_response:lead_1d',
      body: 'Hi Dana — happy to help.\n\n— Dr. Reyes',
      payload: { leadId: 'lead_1', subject: 'S' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    const msg = executors.deliver.mock.calls[0][0] as Record<string, unknown>
    expect(String(msg.html)).toContain('— Dr. Reyes')
    expect(String(msg.html)).not.toContain('— Acme Dental')
  })

  it('inquiry_response: a transport failure REOPENS with the mapped friendly message, never generic swallow (round-3)', async () => {
    executors.deliver.mockRejectedValueOnce(new Error('Their inbox said no thanks — try again in a bit.'))
    const p = seedProposal({
      capability: 'inquiry_response',
      sourceKey: 'inquiry_response:lead_1c',
      payload: { leadId: 'lead_1', subject: 'S' },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Their inbox said no thanks — try again in a bit.')
    expect(p.status).toBe('open')
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('an executor THROWING raw developer text answers in the voice, not the stack trace (round-3)', async () => {
    executors.sendCampaign.mockRejectedValueOnce(new Error('Campaign missing subject'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.campaigns.push({ id: 77, organizationId: ORG, status: 'draft', subject: 'S', bodyHtml: 'B' })
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'k17',
      payload: { audienceId: 5, subject: 'We miss you', campaignId: 77 },
    })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).not.toContain('missing subject')
      expect(r.error).toContain('Something went wrong on my side')
    }
    expect(p.status).toBe('open')
    err.mockRestore()
  })

  it('DEMO proposals simulate: no executor runs, and the narration carries the demo hedge — the toast never claims real work went out (verification)', async () => {
    const p = seedProposal({ isDemo: 1 })
    const r = await approveProposal(ORG, p.id, 'user_1')
    expect(r.ok).toBe(true)
    expect(executors.replyToGoogleReview).not.toHaveBeenCalled()
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).detail).toMatchObject({ simulated: true })
    expect(String((recordActionMock.mock.calls[0][0] as Record<string, unknown>).summary)).toContain(
      'demo — nothing actually went out',
    )
    if (r.ok) expect(r.message).toContain('demo — nothing actually went out')
  })
})

describe('THE LADDER LIVE (Phase 3): autoExecuteProposal', () => {
  it('the machine says yes to its own card: same execution, the AUTONOMOUS voice, and the ledger says autonomous — not "you approved it"', async () => {
    const p = seedProposal()
    const r = await autoExecuteProposal(ORG, p.id)
    expect(r.ok).toBe(true)
    // Identical execution to a human approve — autonomy reuses every guard.
    expect(executors.replyToGoogleReview).toHaveBeenCalledWith(ORG, 'r1', p.body)
    expect(p.status).toBe('approved')
    expect(p.executedAt).toBeInstanceOf(Date)
    // NO human is credited for work no human touched.
    expect(p.decidedByUserId).toBeNull()
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(String(entry.summary)).toContain('handled on my own, as you asked')
    expect(String(entry.summary)).not.toContain('you approved it')
    expect(entry.detail).toMatchObject({ autonomous: true })
    expect(entry.detail).not.toHaveProperty('approvedByUserId')
    if (r.ok) expect(r.message).toContain('handled on my own')
  })

  it('autonomous work respects EVERY staleness guard — a review handled at the counter retires instead of double-replying', async () => {
    store.reviews[0].replyComment = 'Handled in person'
    const p = seedProposal()
    const r = await autoExecuteProposal(ORG, p.id)
    expect(r.ok).toBe(false)
    expect(p.status).toBe('expired')
    expect(executors.replyToGoogleReview).not.toHaveBeenCalled()
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('an autonomous FAILURE reopens the card — the work returns to human view, never silently lost', async () => {
    executors.replyToGoogleReview.mockResolvedValueOnce({ ok: false, error: 'Google said no' } as never)
    const p = seedProposal()
    const r = await autoExecuteProposal(ORG, p.id)
    expect(r.ok).toBe(false)
    expect(p.status).toBe('open')
    expect((p.payload as Record<string, unknown>).approveAttempted).toBe(true)
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('the SECOND autonomous failure hands the card back: the machine says so once, stops retrying, and stops extending the expiry (round-1 Phase-3 audit)', async () => {
    executors.replyToGoogleReview.mockResolvedValue({ ok: false, error: 'Google said no' } as never)
    const p = seedProposal({ expiresAt: new Date(Date.now() + 60 * 60 * 1000) })
    await autoExecuteProposal(ORG, p.id)
    let payload = p.payload as Record<string, unknown>
    expect(payload.autoFailures).toBe(1)
    expect(payload.handBack).toBeUndefined() // one blip is not giving up
    expect(recordActionMock).not.toHaveBeenCalled()
    // A retryable failure keeps the card alive to be retried.
    const afterFirst = p.expiresAt as Date
    expect(afterFirst.getTime()).toBeGreaterThan(Date.now() + 2 * DAY)

    await autoExecuteProposal(ORG, p.id)
    payload = p.payload as Record<string, unknown>
    expect(payload.autoFailures).toBe(2)
    expect(payload.handBack).toBe(true)
    // Said out loud, once, and marked as NOT work — the standup must never
    // count "I couldn't" as something that got done.
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(String(entry.summary)).toContain('couldn’t')
    expect((entry.detail as Record<string, unknown>).autoFailure).toBe(true)

    // Giving up stops the life support: an unbounded +3d on every hourly
    // retry meant a permanently-failing card could never expire.
    expect((p.expiresAt as Date).getTime()).toBe(afterFirst.getTime())

    // A third failure never re-narrates — one hand-back, one sentence.
    await autoExecuteProposal(ORG, p.id)
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((p.expiresAt as Date).getTime()).toBe(afterFirst.getTime())
    executors.replyToGoogleReview.mockResolvedValue({ ok: true } as never)
  })

  it('a human approving a HANDED-BACK card still narrates the work — the "I couldn’t" note must not eat the entry (round-2 audit)', async () => {
    executors.replyToGoogleReview.mockResolvedValueOnce({ ok: false, error: 'Google said no' } as never)
    executors.replyToGoogleReview.mockResolvedValueOnce({ ok: false, error: 'Google said no' } as never)
    const p = seedProposal()
    await autoExecuteProposal(ORG, p.id)
    await autoExecuteProposal(ORG, p.id)
    expect((p.payload as Record<string, unknown>).handBack).toBe(true)
    expect(recordActionMock).toHaveBeenCalledTimes(1) // the hand-back note

    // Google is healthy again and a human taps Approve: the reply really
    // posts, so the ledger must say so.
    await approveProposal(ORG, p.id, 'user_1')
    expect(recordActionMock).toHaveBeenCalledTimes(2)
    const entry = recordActionMock.mock.calls[1][0] as Record<string, unknown>
    expect((entry.detail as Record<string, unknown>).approvedByUserId).toBe('user_1')
    expect((entry.detail as Record<string, unknown>).autoFailure).toBeUndefined()
  })

  it('a HUMAN retry never counts against the machine’s two tries', async () => {
    executors.replyToGoogleReview.mockResolvedValueOnce({ ok: false, error: 'Google said no' } as never)
    const p = seedProposal()
    await approveProposal(ORG, p.id, 'user_1')
    expect((p.payload as Record<string, unknown>).autoFailures).toBeUndefined()
    expect((p.payload as Record<string, unknown>).handBack).toBeUndefined()
  })

  it('an autonomous campaign still SILENCES the underlying send’s own ledger writer — one yes, one entry, whoever said it', async () => {
    const p = seedProposal({
      capability: 'outreach_campaign',
      sourceKey: 'auto:k1',
      payload: { audienceId: 5, subject: 'We miss you' },
    })
    const r = await autoExecuteProposal(ORG, p.id)
    expect(r.ok).toBe(true)
    // decidedByUserId is null for autonomy, so the sentinel must ride —
    // a null initiator would make sendCampaign narrate campaign_send too.
    const call = executors.sendCampaign.mock.calls[0][0] as Record<string, unknown>
    expect(call.initiatedByUserId).toBe('machine')
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    expect((recordActionMock.mock.calls[0][0] as Record<string, unknown>).capability).toBe('outreach_campaign')
  })

  it('a DEMO card’s autonomous narration keeps both hedges — the demo hedge AND the honest voice', async () => {
    const p = seedProposal({ isDemo: 1 })
    const r = await autoExecuteProposal(ORG, p.id)
    expect(r.ok).toBe(true)
    const summary = String((recordActionMock.mock.calls[0][0] as Record<string, unknown>).summary)
    expect(summary).toContain('handled on my own')
    expect(summary).toContain('demo — nothing actually went out')
  })
})

describe('EARNED TRUST (Phase 3): originalBody + the unedited run', () => {
  it('approving WITH edits stashes the machine’s draft as filed; approving as written leaves it null', async () => {
    const edited = seedProposal({ sourceKey: 'trust:k1' })
    const draft = edited.body
    await approveProposal(ORG, edited.id, 'user_1', { body: 'Rob — my own words entirely.' })
    expect(edited.body).toBe('Rob — my own words entirely.')
    expect(edited.originalBody).toBe(draft) // what the machine wrote, preserved

    const asWritten = seedProposal({ sourceKey: 'trust:k2' })
    await approveProposal(ORG, asWritten.id, 'user_1')
    expect(asWritten.originalBody).toBeNull() // the signal the suggestion counts
  })

  it('a second edit never overwrites the FIRST stash — the machine’s original draft is what it is', async () => {
    const p = seedProposal({ sourceKey: 'trust:k3', originalBody: 'the machine’s first draft' })
    await approveProposal(ORG, p.id, 'user_1', { body: 'a later rewrite' })
    expect(p.originalBody).toBe('the machine’s first draft')
  })

  it('an "edit" that changes nothing is not an edit — the run survives a no-op save', async () => {
    const p = seedProposal({ sourceKey: 'trust:k4' })
    await approveProposal(ORG, p.id, 'user_1', { body: p.body })
    expect(p.originalBody).toBeNull()
  })

  it('countConsecutiveUneditedApprovals counts the RUN and breaks at the first edited yes', async () => {
    const mk = (n: number, originalBody: string | null) =>
      seedProposal({
        sourceKey: `run:${n}`,
        status: 'approved',
        decidedAt: new Date(Date.now() - n * 1000),
        decidedByUserId: 'user_1',
        originalBody,
      })
    mk(1, null)
    mk(2, null)
    mk(3, 'they rewrote this one')
    mk(4, null)
    expect(await countConsecutiveUneditedApprovals(ORG, 'review_reply')).toBe(2)
  })

  it('the MACHINE’s own yeses are not the human’s — a grant, six auto-sends and a revoke leave the run at zero (round-1 Phase-3 audit)', async () => {
    for (let n = 1; n <= 6; n++)
      seedProposal({
        sourceKey: `auto:${n}`,
        status: 'approved',
        decidedAt: new Date(Date.now() - n * 1000),
        decidedByUserId: null, // autonomous claims carry no user
        originalBody: null,
      })
    expect(await countConsecutiveUneditedApprovals(ORG, 'review_reply')).toBe(0)
  })

  it('a DECLINE breaks the run — "you said yes to the last 3" must not skip over the noes in between', async () => {
    seedProposal({
      sourceKey: 'mix:1',
      status: 'approved',
      decidedAt: new Date(Date.now() - 1000),
      decidedByUserId: 'user_1',
      originalBody: null,
    })
    seedProposal({
      sourceKey: 'mix:2',
      status: 'declined',
      decidedAt: new Date(Date.now() - 2000),
      decidedByUserId: 'user_1',
      originalBody: null,
    })
    seedProposal({
      sourceKey: 'mix:3',
      status: 'approved',
      decidedAt: new Date(Date.now() - 3000),
      decidedByUserId: 'user_1',
      originalBody: null,
    })
    expect(await countConsecutiveUneditedApprovals(ORG, 'review_reply')).toBe(1)
  })

  it('a SUBJECT-only edit is an edit — the run breaks on it too', async () => {
    const p = seedProposal({ sourceKey: 'subj:1', payload: { subject: 'Time for your checkup' } })
    await approveProposal(ORG, p.id, 'user_1', { subject: 'We miss you at the office' })
    expect(p.originalBody).toBe(p.body)
  })

  it('no history is no suggestion (a run of zero)', async () => {
    expect(await countConsecutiveUneditedApprovals(ORG, 'review_reply')).toBe(0)
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

  it('getSentInquiryReply surfaces the APPROVED reply for its lead — and only approved (round-3, the lead drawer’s "What we sent")', async () => {
    seedProposal({
      capability: 'inquiry_response',
      sourceKey: 'inquiry_response:lead_9',
      status: 'approved',
      body: 'Hi Dana — yes, we take your insurance.',
      payload: { leadId: 'lead_9', subject: 'Your question for Acme Dental' },
      executedAt: new Date('2026-07-20T15:00:00Z'),
      isDemo: 1,
    })
    seedProposal({
      capability: 'inquiry_response',
      sourceKey: 'inquiry_response:lead_10',
      status: 'declined',
      payload: { leadId: 'lead_10', subject: 'S' },
    })
    const sent = await getSentInquiryReply(ORG, 'lead_9')
    expect(sent).not.toBeNull()
    expect(sent?.subject).toBe('Your question for Acme Dental')
    expect(sent?.body).toContain('yes, we take your insurance')
    expect(sent?.sentAt).toEqual(new Date('2026-07-20T15:00:00Z'))
    expect(sent?.simulated).toBe(true) // demo rows are labelled, never claimed as real sends
    expect(await getSentInquiryReply(ORG, 'lead_10')).toBeNull() // a decline sent nothing
    expect(await getSentInquiryReply('org_2', 'lead_9')).toBeNull() // tenant-scoped
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
