import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Facebook reviews service — sync (upsert idempotency + demo-no-network +
 * best-effort), recommend/don't tallies, list (scoped to platform='facebook'),
 * connection guard, and the demo seed (patient-guard + idempotent + populated +
 * Google rows untouched). The Zernio client + the connection reader are mocked;
 * the DB is a small in-memory fake keyed by (organizationId, platform,
 * externalReviewId).
 */

const client = { listFacebookReviews: vi.fn() }
vi.mock('@/lib/zernio', () => ({
  listFacebookReviews: (...a: unknown[]) => client.listFacebookReviews(...a),
}))

const conn = {
  value: null as null | { isDemo: boolean; accounts: Array<{ id: string; platform: string }> },
}
vi.mock('@/lib/services/zernio', () => ({
  getZernioConnection: vi.fn(async () => conn.value ?? { isDemo: false, accounts: [] }),
}))

// ── In-memory DB fake (keyed by org + platform + externalReviewId) ────────────
interface Row {
  id: string
  organizationId: string
  platform: string
  externalReviewId: string
  accountId: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  starRating: number | null
  recommendationType: string | null
  comment: string | null
  reviewCreatedAt: Date | null
  reviewUpdatedAt: Date | null
  replyComment: string | null
  replyUpdatedAt: Date | null
  isDemo: number
}
const store: { reviews: Row[]; patients: Array<{ organizationId: string }>; conns: Array<{ organizationId: string }> } = {
  reviews: [],
  patients: [],
  conns: [],
}

vi.mock('@/lib/db', () => {
  const T_REVIEW = 'platform_review'
  const T_PAT = 'patient'
  const T_CONN = 'zernio_connection'

  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => {
      table = t.__name
      return api
    }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.orderBy = () => api
    const rowsFor = (): Record<string, unknown>[] => {
      let rows: Record<string, unknown>[]
      if (table === T_REVIEW) rows = store.reviews as unknown as Record<string, unknown>[]
      else if (table === T_PAT) rows = store.patients as unknown as Record<string, unknown>[]
      else if (table === T_CONN) rows = store.conns as unknown as Record<string, unknown>[]
      else rows = []
      const out = rows.filter((r) => filters.every((f) => f(r)))
      if (cols) return out.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, r[k]])))
      return out
    }
    api.limit = async () => rowsFor()
    api.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
    return api
  }

  function insert(t: { __name: string }) {
    return {
      values: (vals: Record<string, unknown>) => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
          then: (resolve: (v: unknown) => void) => {
            if (t.__name === T_REVIEW) {
              const existing = store.reviews.find(
                (r) =>
                  r.organizationId === vals.organizationId &&
                  r.platform === vals.platform &&
                  r.externalReviewId === vals.externalReviewId,
              )
              if (existing) Object.assign(existing, set)
              else store.reviews.push(vals as unknown as Row)
            }
            resolve(undefined)
          },
        }),
        onConflictDoNothing: () => ({
          then: (resolve: (v: unknown) => void) => {
            if (t.__name === T_REVIEW) {
              const existing = store.reviews.find(
                (r) =>
                  r.organizationId === vals.organizationId &&
                  r.platform === vals.platform &&
                  r.externalReviewId === vals.externalReviewId,
              )
              if (!existing) store.reviews.push(vals as unknown as Row)
            }
            resolve(undefined)
          },
        }),
      }),
    }
  }

  const eq = (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val
  const col = (name: string) => ({ __col: name })
  const platformReview = {
    __name: T_REVIEW,
    organizationId: col('organizationId'),
    platform: col('platform'),
    externalReviewId: col('externalReviewId'),
    recommendationType: col('recommendationType'),
    reviewCreatedAt: col('reviewCreatedAt'),
    createdAt: col('createdAt'),
  }
  const schema = {
    platformReview,
    googleReview: platformReview,
    patient: { __name: T_PAT, organizationId: col('organizationId'), id: col('id') },
    zernioConnection: { __name: T_CONN, organizationId: col('organizationId'), status: col('status'), isDemo: col('isDemo') },
  }
  void eq
  return { db: { select, insert }, schema }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds.flat(),
  desc: () => 'desc',
  sql: () => 'sql',
}))

import {
  syncFacebookReviews,
  getFacebookReviewStats,
  listFacebookReviews as listFbSvc,
  hasFacebookConnection,
  seedDemoFacebookReviews,
} from '@/lib/services/facebook-reviews'

const ORG = 'org_1'

function setFb(opts: { isDemo?: boolean; accountId?: string } = {}) {
  conn.value = { isDemo: opts.isDemo ?? false, accounts: [{ id: opts.accountId ?? 'fb_acct', platform: 'facebook' }] }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.reviews = []
  store.patients = [{ organizationId: ORG }]
  store.conns = []
  conn.value = null
})

describe('syncFacebookReviews', () => {
  it('skips with no_connection when no FB Page is connected (no network)', async () => {
    conn.value = { isDemo: false, accounts: [{ id: 'gbp', platform: 'googlebusiness' }] } // no FB
    const r = await syncFacebookReviews(ORG)
    expect(r).toMatchObject({ ok: true, synced: 0, skipped: 'no_connection' })
    expect(client.listFacebookReviews).not.toHaveBeenCalled()
  })

  it('a DEMO connection never hits the network — seeded rows stand', async () => {
    setFb({ isDemo: true })
    store.reviews.push({ organizationId: ORG, platform: 'facebook', externalReviewId: 'demo_1' } as Row)
    const r = await syncFacebookReviews(ORG)
    expect(r).toMatchObject({ ok: true, synced: 0, skipped: 'demo' })
    expect(client.listFacebookReviews).not.toHaveBeenCalled()
    expect(store.reviews).toHaveLength(1)
  })

  it('upserts pulled recommendations, idempotent on (org, platform, externalReviewId)', async () => {
    setFb()
    client.listFacebookReviews.mockResolvedValue({
      reviews: [
        { id: 'f1', recommendationType: 'recommended', starRating: null, comment: 'A', reviewerName: 'X', reviewerPhotoUrl: null, createTime: '2026-06-01T00:00:00Z', updateTime: null, permalink: null },
        { id: 'f2', recommendationType: 'not_recommended', starRating: null, comment: 'B', reviewerName: 'Y', reviewerPhotoUrl: null, createTime: null, updateTime: null, permalink: null },
      ],
      nextPageToken: null,
    })
    const first = await syncFacebookReviews(ORG)
    expect(first).toMatchObject({ ok: true, synced: 2 })
    expect(store.reviews).toHaveLength(2)
    for (const r of store.reviews) expect(r.platform).toBe('facebook')

    const second = await syncFacebookReviews(ORG)
    expect(second.synced).toBe(2)
    expect(store.reviews).toHaveLength(2)
  })

  it('pages through nextPageToken', async () => {
    setFb()
    client.listFacebookReviews
      .mockResolvedValueOnce({ reviews: [{ id: 'p1', recommendationType: 'recommended', starRating: null, comment: null, reviewerName: null, reviewerPhotoUrl: null, createTime: null, updateTime: null, permalink: null }], nextPageToken: 'tok2' })
      .mockResolvedValueOnce({ reviews: [{ id: 'p2', recommendationType: 'recommended', starRating: null, comment: null, reviewerName: null, reviewerPhotoUrl: null, createTime: null, updateTime: null, permalink: null }], nextPageToken: null })
    const r = await syncFacebookReviews(ORG)
    expect(r.synced).toBe(2)
    expect(client.listFacebookReviews).toHaveBeenCalledTimes(2)
  })

  it('records nothing destructive on an API failure (best-effort, ok:false)', async () => {
    setFb()
    client.listFacebookReviews.mockRejectedValue(new Error('Zernio 500'))
    const r = await syncFacebookReviews(ORG)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Zernio 500')
    expect(store.reviews).toHaveLength(0)
  })
})

describe('getFacebookReviewStats', () => {
  it('returns zeros when there are no FB reviews', async () => {
    const s = await getFacebookReviewStats(ORG)
    expect(s).toEqual({ count: 0, recommended: 0, notRecommended: 0 })
  })

  it('tallies recommend / don\'t-recommend', async () => {
    store.reviews = [
      { organizationId: ORG, platform: 'facebook', externalReviewId: 'a', recommendationType: 'recommended' },
      { organizationId: ORG, platform: 'facebook', externalReviewId: 'b', recommendationType: 'recommended' },
      { organizationId: ORG, platform: 'facebook', externalReviewId: 'c', recommendationType: 'not_recommended' },
      // A Google row must NOT be counted (platform filter).
      { organizationId: ORG, platform: 'googlebusiness', externalReviewId: 'g', recommendationType: null, starRating: 5 },
    ] as Row[]
    const s = await getFacebookReviewStats(ORG)
    expect(s).toEqual({ count: 3, recommended: 2, notRecommended: 1 })
  })
})

describe('listFacebookReviews + hasFacebookConnection', () => {
  it('lists only the FB rows for the org (not Google rows)', async () => {
    store.reviews = [
      { organizationId: ORG, platform: 'facebook', externalReviewId: 'f', recommendationType: 'recommended' } as Row,
      { organizationId: ORG, platform: 'googlebusiness', externalReviewId: 'g', starRating: 5 } as Row,
    ]
    const rows = await listFbSvc(ORG)
    expect(rows).toHaveLength(1)
    expect(rows[0].externalReviewId).toBe('f')
    expect(rows[0].recommendationType).toBe('recommended')
  })

  it('reflects the FB connection status', async () => {
    expect(await hasFacebookConnection(ORG)).toBe(false)
    setFb()
    expect(await hasFacebookConnection(ORG)).toBe(true)
  })
})

describe('seedDemoFacebookReviews', () => {
  it('seeds NOTHING when the org has no patients (orphan-row guard)', async () => {
    store.patients = []
    await seedDemoFacebookReviews('org_empty')
    expect(store.reviews).toHaveLength(0)
  })

  it('seeds populated FB recommendations (recommend + not-recommend + bare) tagged platform=facebook', async () => {
    await seedDemoFacebookReviews(ORG)
    expect(store.reviews.length).toBeGreaterThanOrEqual(4)
    for (const r of store.reviews) {
      expect(r.isDemo).toBe(1)
      expect(r.platform).toBe('facebook')
      expect(r.accountId).toBe('demo_fb_dream_dental')
      expect(r.starRating).toBeNull() // FB recommendations carry no star
    }
    expect(store.reviews.some((r) => r.recommendationType === 'recommended')).toBe(true)
    expect(store.reviews.some((r) => r.recommendationType === 'not_recommended')).toBe(true)
    // A bare recommendation (no written comment) for the empty-comment path.
    expect(store.reviews.some((r) => r.comment == null)).toBe(true)
  })

  it('is idempotent — a second run adds no duplicate rows', async () => {
    await seedDemoFacebookReviews(ORG)
    const first = store.reviews.length
    await seedDemoFacebookReviews(ORG)
    expect(store.reviews).toHaveLength(first)
  })
})
