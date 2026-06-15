import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Demo Google reviews seed — patient-guard (no orphan rows on an empty context),
 * idempotent upsert, and field coverage (varied ratings incl. a 4★ + a
 * rating-only null-comment + at least one already-replied), so /reviews/received,
 * the dashboard stats, and the public AggregateRating all showcase populated.
 */

const store: { reviews: Array<Record<string, unknown>>; patients: Array<Record<string, unknown>> } = {
  reviews: [],
  patients: [],
}

vi.mock('@/lib/db', () => {
  const T_REVIEW = 'platform_review'
  const T_PAT = 'patient'
  function select() {
    let table = ''
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => {
      table = t.__name
      return api
    }
    api.where = () => api
    api.limit = async () => (table === T_PAT ? store.patients : store.reviews)
    return api
  }
  function insert(t: { __name: string }) {
    return {
      values: (vals: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          then: (resolve: (v: unknown) => void) => {
            if (t.__name === T_REVIEW) {
              const dup = store.reviews.find(
                (r) => r.organizationId === vals.organizationId && r.externalReviewId === vals.externalReviewId,
              )
              if (!dup) store.reviews.push(vals)
            }
            resolve(undefined)
          },
        }),
      }),
    }
  }
  return {
    db: { select, insert },
    schema: {
      platformReview: { __name: T_REVIEW },
      googleReview: { __name: T_REVIEW },
      patient: { __name: T_PAT, organizationId: { __col: 'organizationId' }, id: { __col: 'id' } },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  eq: () => () => true,
  and: (...p: unknown[]) => p,
  desc: () => 'desc',
  sql: () => 'sql',
}))
// The service also imports the connection resolver + client; neither is used by
// seedDemoGoogleReviews, but the module evaluates the imports.
vi.mock('@/lib/services/zernio', () => ({ getZernioConnection: vi.fn(), resolveGbpAccount: vi.fn() }))
vi.mock('@/lib/zernio', () => ({
  listGoogleReviews: vi.fn(),
  replyToGoogleReview: vi.fn(),
  deleteGoogleReviewReply: vi.fn(),
}))

import { seedDemoGoogleReviews } from '@/lib/services/google-reviews'

beforeEach(() => {
  store.reviews = []
  store.patients = []
})

describe('seedDemoGoogleReviews', () => {
  it('seeds NOTHING when the org has no patients (orphan-row guard)', async () => {
    store.patients = []
    await seedDemoGoogleReviews('org_empty')
    expect(store.reviews).toHaveLength(0)
  })

  it('seeds the curated demo review set for a real demo org', async () => {
    store.patients = [{ id: 'pat_1' }]
    await seedDemoGoogleReviews('org_demo')
    expect(store.reviews.length).toBeGreaterThanOrEqual(5)
    // Every row is demo-scoped, tagged as the Google platform, + carries the
    // synthetic account id.
    for (const r of store.reviews) {
      expect(r.isDemo).toBe(1)
      expect(r.platform).toBe('googlebusiness')
      expect(r.organizationId).toBe('org_demo')
      expect(r.accountId).toBe('demo_gbp_dream_dental')
      expect(r.externalReviewId).toBeTruthy()
    }
  })

  it('covers varied ratings incl. a 4★ and a rating-only null-comment review', async () => {
    store.patients = [{ id: 'pat_1' }]
    await seedDemoGoogleReviews('org_demo')
    const ratings = store.reviews.map((r) => r.starRating as number | null)
    expect(ratings).toContain(5)
    expect(ratings).toContain(4)
    // At least one rating-only (null comment) review for the empty-comment path.
    expect(store.reviews.some((r) => r.comment == null && r.starRating != null)).toBe(true)
  })

  it('seeds at least one review that already has a clinic reply', async () => {
    store.patients = [{ id: 'pat_1' }]
    await seedDemoGoogleReviews('org_demo')
    expect(store.reviews.some((r) => typeof r.replyComment === 'string' && (r.replyComment as string).length > 0)).toBe(true)
    // And at least one still awaiting a reply (a live target for the Reply CTA).
    expect(store.reviews.some((r) => r.replyComment == null)).toBe(true)
  })

  it('is idempotent — a second run adds no duplicate rows', async () => {
    store.patients = [{ id: 'pat_1' }]
    await seedDemoGoogleReviews('org_demo')
    const first = store.reviews.length
    await seedDemoGoogleReviews('org_demo')
    expect(store.reviews).toHaveLength(first)
  })
})
