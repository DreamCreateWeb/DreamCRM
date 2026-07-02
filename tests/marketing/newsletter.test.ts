import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * buildNewsletterDraft — the blog-powered newsletter. No posts → friendly
 * error; posts → a DRAFT campaign (never scheduled) with the all-patients
 * opt-in audience, post links into the clinic's public blog, and the
 * {{firstName}}/{{bookingUrl}} merge tokens intact.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            const name = (table as { _n: string })._n
            state.inserts.push({ table: name, values })
            return [{ id: state.inserts.length }]
          },
        }),
      }),
    },
    schema: {
      audiences: { _n: 'audiences', id: 'id', organizationId: 'org', name: 'name' },
      campaigns: { _n: 'campaigns', id: 'id', organizationId: 'org' },
      clinicProfile: { organizationId: 'org', displayName: 'dn', websiteDomain: 'wd' },
      organization: { id: 'id', slug: 'slug', name: 'name' },
    },
  }
})
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => ({})), eq: vi.fn(() => ({})) }))

const { listPostsMock } = vi.hoisted(() => ({ listPostsMock: vi.fn(async () => [] as unknown[]) }))
vi.mock('@/lib/services/blog', () => ({ listPublishedPosts: listPostsMock }))
vi.mock('@/lib/services/clinic-site', () => ({
  publicSiteUrl: vi.fn(() => 'https://acme.dreamcreatestudio.com'),
}))

import { buildNewsletterDraft } from '@/lib/services/newsletter'

const POSTS = [
  { title: 'Why your gums matter', slug: 'why-your-gums-matter', excerpt: 'The quiet early signs.' },
  { title: 'Whitening that works', slug: 'whitening-that-works', excerpt: null },
]

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  vi.clearAllMocks()
  listPostsMock.mockResolvedValue(POSTS)
})

describe('buildNewsletterDraft', () => {
  it('needs at least one published post', async () => {
    listPostsMock.mockResolvedValue([])
    const r = await buildNewsletterDraft('org_1', 'user_1')
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('blog post') })
    expect(state.inserts).toHaveLength(0)
  })

  it('drafts a campaign with post links, merge tokens, and the opt-in audience', async () => {
    state.selectQueue.push([{ displayName: 'Dream Dental', websiteDomain: null }]) // profile
    state.selectQueue.push([{ slug: 'acme-dental', name: 'Acme Dental' }]) // org
    state.selectQueue.push([]) // audience lookup misses → creates one

    const r = await buildNewsletterDraft('org_1', 'user_1', { now: new Date('2026-07-02T12:00:00Z') })
    expect(r.ok).toBe(true)

    const audience = state.inserts.find((i) => i.table === 'audiences')
    expect(audience!.values).toMatchObject({
      recipientSource: 'patients',
      patientFilter: expect.objectContaining({ requireEmailOptIn: true }),
    })

    const campaign = state.inserts.find((i) => i.table === 'campaigns')
    expect(campaign!.values).toMatchObject({
      status: 'draft', // never sends without a human look
      recipientSource: 'patients',
      name: 'Patient newsletter · July 2026',
      subject: 'This month from Dream Dental',
      createdBy: 'user_1',
    })
    const body = String(campaign!.values.bodyHtml)
    expect(body).toContain('https://acme.dreamcreatestudio.com/blog/why-your-gums-matter')
    expect(body).toContain('Whitening that works')
    expect(body).toContain('{{firstName}}')
    expect(body).toContain('{{bookingUrl}}')
    // scheduledAt untouched — a draft, not a queued send.
    expect(campaign!.values.scheduledAt).toBeUndefined()
  })

  it('reuses an existing newsletter audience', async () => {
    state.selectQueue.push([{ displayName: 'Dream Dental', websiteDomain: null }])
    state.selectQueue.push([{ slug: 'acme-dental', name: 'Acme Dental' }])
    state.selectQueue.push([{ id: 42 }]) // audience exists
    const r = await buildNewsletterDraft('org_1', 'user_1')
    expect(r.ok).toBe(true)
    expect(state.inserts.filter((i) => i.table === 'audiences')).toHaveLength(0)
    expect(state.inserts.find((i) => i.table === 'campaigns')!.values.audienceId).toBe(42)
  })
})
