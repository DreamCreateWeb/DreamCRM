import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * listFeaturableGoogleReviews (maps qualifying Google reviews → the shared
 * testimonial shape; drops empty-comment rows; reads the per-clinic
 * featureMinStars threshold) + setGoogleReviewHidden (toggle scoping).
 *
 * NOTE: the star/hidden/threshold WHERE filtering runs in SQL, which the db
 * mock doesn't execute — so this covers the JS mapping, the empty-comment
 * guard, the threshold READ, and the hide toggle. The SQL predicates are
 * verified by manual/integration checks.
 */

const state = {
  config: [] as Array<Record<string, unknown>>,
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}

function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'orderBy', 'limit']) c[m] = () => c
  c.then = (resolve: (v: unknown) => unknown) => resolve(rows)
  return c
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (sel?: Record<string, unknown>) => {
      const keys = sel ? Object.keys(sel) : []
      if (keys.includes('featureMinStars')) return chain(state.config)
      return chain(state.rows)
    },
    update: () => ({
      set: (s: Record<string, unknown>) => ({ where: async () => { state.updates.push(s) } }),
    }),
  },
  schema: {
    clinicReviewConfig: { organizationId: 'organizationId', featureMinStars: 'featureMinStars' },
    platformReview: {
      organizationId: 'organizationId', platform: 'platform', externalReviewId: 'externalReviewId',
      starRating: 'starRating', comment: 'comment', hiddenFromSite: 'hiddenFromSite', createdAt: 'createdAt',
      reviewCreatedAt: 'reviewCreatedAt',
    },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })), eq: vi.fn(() => ({ _: 'eq' })), gte: vi.fn(() => ({ _: 'gte' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })), desc: vi.fn((x) => x),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/zernio', () => ({ resolveGbpAccount: vi.fn(async () => null) }))
vi.mock('@/lib/zernio', () => ({
  listGoogleReviews: vi.fn(), replyToGoogleReview: vi.fn(), deleteGoogleReviewReply: vi.fn(),
}))

import { listFeaturableGoogleReviews, setGoogleReviewHidden } from '@/lib/services/google-reviews'

beforeEach(() => {
  state.config = []
  state.rows = []
  state.updates = []
})

describe('listFeaturableGoogleReviews', () => {
  it('maps a review into the shared testimonial shape with rating + google source', async () => {
    state.config = [{ featureMinStars: 4 }]
    state.rows = [
      { externalReviewId: 'r1', comment: 'Wonderful team!', reviewerName: 'Priya N.', reviewerPhotoUrl: 'http://x/p.jpg', starRating: 5 },
    ]
    const out = await listFeaturableGoogleReviews('org_1')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'gr_r1',
      quote: 'Wonderful team!',
      authorName: 'Priya N.',
      authorPhotoUrl: 'http://x/p.jpg',
      patientId: null,
      rating: 5,
      source: 'google',
    })
  })

  it('drops rows whose comment is empty/whitespace (nothing to show)', async () => {
    state.config = [{ featureMinStars: 4 }]
    state.rows = [
      { externalReviewId: 'r1', comment: '   ', reviewerName: 'A', reviewerPhotoUrl: null, starRating: 5 },
      { externalReviewId: 'r2', comment: 'Great', reviewerName: 'B', reviewerPhotoUrl: null, starRating: 4 },
    ]
    const out = await listFeaturableGoogleReviews('org_1')
    expect(out.map((r) => r.id)).toEqual(['gr_r2'])
  })

  it('falls back to "Google reviewer" when the reviewer name is missing', async () => {
    state.config = [{ featureMinStars: 4 }]
    state.rows = [{ externalReviewId: 'r1', comment: 'Nice', reviewerName: null, reviewerPhotoUrl: null, starRating: 5 }]
    const out = await listFeaturableGoogleReviews('org_1')
    expect(out[0].authorName).toBe('Google reviewer')
  })

  it('defaults the threshold to 4 when no config row exists (no crash)', async () => {
    state.config = []
    state.rows = [{ externalReviewId: 'r1', comment: 'Nice', reviewerName: 'C', reviewerPhotoUrl: null, starRating: 5 }]
    const out = await listFeaturableGoogleReviews('org_1')
    expect(out).toHaveLength(1)
  })
})

describe('setGoogleReviewHidden', () => {
  it('writes hiddenFromSite=1 when hiding an existing review', async () => {
    state.rows = [{ id: 'gr1', isDemo: 0 }]
    const r = await setGoogleReviewHidden('org_1', 'r1', true)
    expect(r.ok).toBe(true)
    expect(state.updates[0]).toMatchObject({ hiddenFromSite: 1 })
  })

  it('writes hiddenFromSite=0 when un-hiding', async () => {
    state.rows = [{ id: 'gr1', isDemo: 0 }]
    const r = await setGoogleReviewHidden('org_1', 'r1', false)
    expect(r.ok).toBe(true)
    expect(state.updates[0]).toMatchObject({ hiddenFromSite: 0 })
  })

  it('errors (no write) when the review is not found', async () => {
    state.rows = []
    const r = await setGoogleReviewHidden('org_1', 'nope', true)
    expect(r.ok).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})
