import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * THE MONTHLY NEWSLETTER (ML-36, G3-12). The month gate keys on the
 * clinic-local first weekday; no fresh post or no opted-in audience files
 * nothing; one card per clinic month; the yes creates a DRAFT campaign and
 * NEVER sends; the draft is stamped so a retry never drafts twice.
 */

const db = vi.hoisted(() => ({
  queues: {} as Record<string, unknown[][]>,
  updates: [] as unknown[],
  reads: [] as string[],
}))
vi.mock('@/lib/db', () => {
  const schema = new Proxy({}, {
    get: (_t, table: string) => new Proxy({ __name: table }, { get: (o, c: string) => (c in o ? (o as Record<string, unknown>)[c] : { __col: c }) }),
  })
  const select = () => {
    let rows: unknown[] = []
    const api: Record<string, unknown> = {}
    for (const m of ['where', 'limit', 'orderBy']) api[m] = () => api
    api.from = (t: { __name: string }) => {
      db.reads.push(t.__name)
      rows = (db.queues[t.__name] ?? []).shift() ?? []
      return api
    }
    api.then = (res: (v: unknown[]) => unknown) => Promise.resolve(rows).then(res)
    return api
  }
  const update = () => ({
    set: (v: unknown) => {
      db.updates.push(v)
      return { where: async () => {} }
    },
  })
  return { db: { select, update }, schema }
})
vi.mock('drizzle-orm', () => ({
  and: () => true, eq: () => true, gt: () => true, desc: () => true, like: () => true,
  isNull: () => true, inArray: () => true,
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}))

const filed = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, result: true }))
vi.mock('@/lib/services/proposals', () => ({
  fileProposal: vi.fn(async (i: Record<string, unknown>) => {
    filed.calls.push(i)
    return { filed: filed.result, id: filed.result ? 'p_new' : null }
  }),
  textToCampaignHtml: (t: string) => `<edited>${t}</edited>`,
}))
const news = vi.hoisted(() => ({ created: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/newsletter', () => ({
  POSTS_PER_ISSUE: 3,
  NEWSLETTER_NAME_PREFIX: 'Patient newsletter ·',
  composeNewsletter: vi.fn(async (_o: string, posts: Array<{ id: string }>) =>
    posts.length === 0
      ? null
      : {
          name: 'Patient newsletter · November 2026',
          subject: 'This month from Acme Dental',
          previewText: 'preview',
          bodyHtml: '<styled/>',
          bodyText: 'Hi {{firstName}},\n\nissue',
          clinicName: 'Acme Dental',
        },
  ),
  createNewsletterDraft: vi.fn(async (_o: string, _u: string | null, issue: Record<string, unknown>) => {
    news.created.push(issue)
    return 77
  }),
}))
vi.mock('@/lib/services/blog', () => ({
  listPublishedPosts: vi.fn(async () => [{ id: 'b1' }, { id: 'b2' }]),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/Chicago') }))

import {
  generateNewsletterProposals,
  firstWeekdayOfMonth,
  newsletterMonthKey,
} from '@/lib/services/proposal-generators/newsletter'
import { executeNewsletter } from '@/lib/services/proposal-executors/newsletter'

const TZ = 'America/Chicago'
// 2026-11-01 is a Sunday → the first weekday is Monday Nov 2.
const FIRST_WEEKDAY = new Date('2026-11-02T16:00:00Z')

function seed(o: { taken?: boolean; last?: Date | null; fresh?: number; audience?: number } = {}) {
  db.queues = {
    proposal: [o.taken ? [{ id: 'old' }] : []],
    campaigns: [o.last ? [{ createdAt: o.last }] : []],
    blogPost: [[{ n: o.fresh ?? 2 }]],
    patient: [[{ n: o.audience ?? 120 }]],
  }
}

beforeEach(() => {
  filed.calls = []
  filed.result = true
  news.created = []
  db.updates = []
  db.reads = []
  seed()
})

describe('the month gate', () => {
  it('first weekday of a month: the 1st when it is Mon–Fri, else the following Monday', () => {
    expect(firstWeekdayOfMonth(2026, 11)).toBe(2) // Sun Nov 1
    expect(firstWeekdayOfMonth(2026, 10)).toBe(1) // Thu Oct 1
    expect(firstWeekdayOfMonth(2026, 8)).toBe(3) // Sat Aug 1
    expect(firstWeekdayOfMonth(2027, 2)).toBe(1) // Mon Feb 1
    expect(newsletterMonthKey(2026, 3)).toBe('2026-03')
  })

  it('files nothing on any other day — and reads nothing', async () => {
    expect(await generateNewsletterProposals('org_1', new Date('2026-11-10T16:00:00Z'), TZ)).toBe(0)
    expect(await generateNewsletterProposals('org_1', new Date('2026-11-01T16:00:00Z'), TZ)).toBe(0)
    expect(db.reads).toHaveLength(0)
    expect(filed.calls).toHaveLength(0)
  })

  it('uses the CLINIC day, not the UTC one', async () => {
    // 04:00Z on Nov 3 is 10 PM on Nov 2 in Chicago — still the first weekday there.
    expect(await generateNewsletterProposals('org_1', new Date('2026-11-03T04:00:00Z'), TZ)).toBe(1)
  })
})

describe('the generator', () => {
  it('files ONE ask-first card carrying the draft, deduped per org-month by sourceKey', async () => {
    expect(await generateNewsletterProposals('org_1', FIRST_WEEKDAY, TZ)).toBe(1)
    expect(filed.calls).toHaveLength(1)
    const c = filed.calls[0]
    expect(c.capability).toBe('newsletter')
    expect(c.organizationId).toBe('org_1')
    expect(c.sourceKey).toBe('newsletter:2026-11')
    expect(c.body).toContain('issue')
    const payload = c.payload as Record<string, unknown>
    expect(payload.postIds).toEqual(['b1', 'b2'])
    expect(payload.recipientCount).toBe(120)
    expect(payload.originalBody).toBe(c.body)
  })

  it('a month already filed (open, approved or declined) files nothing', async () => {
    seed({ taken: true })
    expect(await generateNewsletterProposals('org_1', FIRST_WEEKDAY, TZ)).toBe(0)
    expect(filed.calls).toHaveLength(0)
  })

  it('no post published since the last newsletter → nothing', async () => {
    seed({ last: new Date('2026-10-02T12:00:00Z'), fresh: 0 })
    expect(await generateNewsletterProposals('org_1', FIRST_WEEKDAY, TZ)).toBe(0)
    expect(filed.calls).toHaveLength(0)
  })

  it('no opted-in audience → nothing', async () => {
    seed({ audience: 0 })
    expect(await generateNewsletterProposals('org_1', FIRST_WEEKDAY, TZ)).toBe(0)
    expect(filed.calls).toHaveLength(0)
  })

  it('a lost race on the sourceKey reports nothing filed', async () => {
    filed.result = false
    expect(await generateNewsletterProposals('org_1', FIRST_WEEKDAY, TZ)).toBe(0)
  })
})

describe('the executor', () => {
  const proposal = (over: Record<string, unknown> = {}) =>
    ({
      id: 'p1',
      organizationId: 'org_1',
      capability: 'newsletter',
      body: 'Hi {{firstName}},\n\nissue',
      decidedByUserId: 'u1',
      payload: {},
      ...over,
    }) as unknown as Parameters<typeof executeNewsletter>[0]
  const PAYLOAD = {
    postIds: ['b1', 'b2'],
    subject: 'This month from Acme Dental',
    name: 'Patient newsletter · November 2026',
    originalBody: 'Hi {{firstName}},\n\nissue',
  }
  const YES = '— you approved it'
  const posts = [{ id: 'b2' }, { id: 'b1' }]

  it('creates the DRAFT campaign with the styled issue, stamps it, narrates "nothing goes out"', async () => {
    db.queues = { blogPost: [posts] }
    const r = await executeNewsletter(proposal(), PAYLOAD, YES)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ledgerSummary).toMatch(/nothing goes out until you send it/)
      expect(r.ledgerDetail).toMatchObject({ campaignId: 77 })
    }
    expect(news.created).toHaveLength(1)
    expect(news.created[0].bodyHtml).toBe('<styled/>')
    expect(db.updates).toEqual([{ payload: { ...PAYLOAD, campaignId: 77 } }])
  })

  it('an EDITED body drafts the edited words, not the filed ones', async () => {
    db.queues = { blogPost: [posts] }
    await executeNewsletter(proposal({ body: 'Hi {{firstName}},\n\nmy own note' }), PAYLOAD, YES)
    expect(news.created[0].bodyHtml).toBe('<edited>Hi {{firstName}},\n\nmy own note</edited>')
  })

  it('a retry after a stamped draft never drafts twice', async () => {
    const r = await executeNewsletter(proposal(), { ...PAYLOAD, campaignId: 77 }, YES)
    expect(r.ok).toBe(true)
    expect(news.created).toHaveLength(0)
  })

  it('posts unpublished since the card was filed retire it instead of drafting an empty issue', async () => {
    db.queues = { blogPost: [[]] }
    const r = await executeNewsletter(proposal(), PAYLOAD, YES)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.expired).toBe(true)
    expect(news.created).toHaveLength(0)
  })

  it('NEVER sends: the executor and generator reach for no send path', () => {
    for (const f of ['lib/services/proposal-executors/newsletter.ts', 'lib/services/proposal-generators/newsletter.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/import\(?[^\n]*(marketing-send|sms-consent|lib\/email)|sendCampaign\(|deliver\(/)
    }
  })
})
