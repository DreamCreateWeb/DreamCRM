import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Google Business reviews service — sync (upsert idempotency + reply-field
 * update + demo-no-network), stats math, reply/delete (network + demo-local).
 * The Zernio client + the connection resolver are mocked; the DB is a small
 * in-memory fake keyed by (organizationId, externalReviewId).
 */

// ── Zernio review client mock ────────────────────────────────────────────────
const client = {
  listGoogleReviews: vi.fn(),
  replyToGoogleReview: vi.fn(),
  deleteGoogleReviewReply: vi.fn(),
}
vi.mock('@/lib/zernio', () => ({
  listGoogleReviews: (...a: unknown[]) => client.listGoogleReviews(...a),
  replyToGoogleReview: (...a: unknown[]) => client.replyToGoogleReview(...a),
  deleteGoogleReviewReply: (...a: unknown[]) => client.deleteGoogleReviewReply(...a),
}))

// ── Connection resolver mock ─────────────────────────────────────────────────
const conn = { value: null as null | { status: string; isDemo: boolean; googleBusinessAccounts: Array<{ id: string }> } }
vi.mock('@/lib/services/zernio', () => ({
  getZernioConnection: vi.fn(async () => conn.value ?? { status: 'disconnected', isDemo: false, googleBusinessAccounts: [] }),
  // `resolveGbpAccount` now lives in lib/services/zernio (shared); the service
  // imports it from there, so mirror the real derivation off `conn.value`.
  resolveGbpAccount: vi.fn(async () => {
    const c = conn.value
    if (!c || c.status !== 'connected') return null
    const account = c.googleBusinessAccounts[0]
    if (!account) return null
    return { accountId: account.id, isDemo: c.isDemo }
  }),
}))

// ── In-memory DB fake ────────────────────────────────────────────────────────
interface Row {
  id: string
  organizationId: string
  platform: string
  externalReviewId: string
  accountId: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  starRating: number | null
  comment: string | null
  reviewCreatedAt: Date | null
  reviewUpdatedAt: Date | null
  replyComment: string | null
  replyUpdatedAt: Date | null
  isDemo: number
}
const store: { reviews: Row[]; patients: Array<{ organizationId: string }>; conns: Array<{ organizationId: string; status: string; isDemo: number }> } = {
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
      // Project to selected columns when given (so stats/loadReview shapes match).
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
                  (r.platform ?? 'googlebusiness') === (vals.platform ?? 'googlebusiness') &&
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
                  (r.platform ?? 'googlebusiness') === (vals.platform ?? 'googlebusiness') &&
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

  function update(t: { __name: string }) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.set = (p: Record<string, unknown>) => {
      patch = p
      return api
    }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      if (t.__name === T_REVIEW) {
        for (const r of store.reviews as unknown as Record<string, unknown>[]) {
          if (filters.every((f) => f(r))) Object.assign(r, patch)
        }
      }
      resolve(undefined)
    }
    return api
  }

  // Drizzle column refs → predicate builders. eq(col, val) returns a fn.
  // `platform` defaults to 'googlebusiness' on the real table, so a seeded row
  // that omits it still matches the service's platform filter.
  const eq = (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) =>
    (col.__col === 'platform' ? (r.platform ?? 'googlebusiness') : r[col.__col]) === val
  const and = (...preds: unknown[]) => preds
  const desc = () => 'desc'
  const sql = () => 'sql'

  // Tag schema tables + columns so the fake can disambiguate.
  const col = (name: string) => ({ __col: name })
  const platformReview = {
    __name: T_REVIEW,
    organizationId: col('organizationId'),
    platform: col('platform'),
    externalReviewId: col('externalReviewId'),
    starRating: col('starRating'),
    recommendationType: col('recommendationType'),
    replyComment: col('replyComment'),
    reviewCreatedAt: col('reviewCreatedAt'),
    createdAt: col('createdAt'),
  }
  const schema = {
    // The table was generalized google_review → platform_review; the service uses
    // `schema.platformReview` now (with the back-compat `googleReview` alias).
    platformReview,
    googleReview: platformReview,
    patient: { __name: T_PAT, organizationId: col('organizationId'), id: col('id') },
    zernioConnection: { __name: T_CONN, organizationId: col('organizationId'), status: col('status'), isDemo: col('isDemo') },
  }

  return {
    db: { select, insert, update },
    schema,
    // Re-export the drizzle helpers the service imports from 'drizzle-orm' — but
    // those come from the real package; we only need our db/schema here.
    __eq: eq,
    __and: and,
    __desc: desc,
    __sql: sql,
  }
})

// drizzle-orm helpers used by the service must operate on our predicate shape.
vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) =>
    (col.__col === 'platform' ? (r.platform ?? 'googlebusiness') : r[col.__col]) === val,
  and: (...preds: unknown[]) => preds.flat(),
  desc: () => 'desc',
  sql: () => 'sql',
}))

import {
  syncGoogleReviews,
  getGoogleReviewStats,
  listGoogleReviews as listGoogleReviewsSvc,
  replyToGoogleReview,
  deleteGoogleReviewReply,
  hasGoogleBusinessConnection,
} from '@/lib/services/google-reviews'

const ORG = 'org_1'

function setConnected(opts: { isDemo?: boolean; accountId?: string } = {}) {
  conn.value = {
    status: 'connected',
    isDemo: opts.isDemo ?? false,
    googleBusinessAccounts: [{ id: opts.accountId ?? 'acct_1' }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.reviews = []
  store.patients = [{ organizationId: ORG }]
  store.conns = []
  conn.value = null
})

describe('syncGoogleReviews', () => {
  it('skips with no_connection when no GBP is connected (no network)', async () => {
    conn.value = null
    const r = await syncGoogleReviews(ORG)
    expect(r).toMatchObject({ ok: true, synced: 0, skipped: 'no_connection' })
    expect(client.listGoogleReviews).not.toHaveBeenCalled()
  })

  it('a DEMO connection never hits the network — seeded rows stand', async () => {
    setConnected({ isDemo: true })
    store.reviews.push({ organizationId: ORG, externalReviewId: 'demo_1', starRating: 5 } as Row)
    const r = await syncGoogleReviews(ORG)
    expect(r).toMatchObject({ ok: true, synced: 0, skipped: 'demo' })
    expect(client.listGoogleReviews).not.toHaveBeenCalled()
    expect(store.reviews).toHaveLength(1)
  })

  it('upserts pulled reviews, idempotent on (org, externalReviewId)', async () => {
    setConnected()
    client.listGoogleReviews.mockResolvedValue({
      reviews: [
        { id: 'r1', starRating: 5, comment: 'A', reviewerName: 'X', createTime: '2026-06-01T00:00:00Z', updateTime: null, reviewerPhotoUrl: null, replyComment: null, replyUpdateTime: null },
        { id: 'r2', starRating: 4, comment: 'B', reviewerName: 'Y', createTime: null, updateTime: null, reviewerPhotoUrl: null, replyComment: null, replyUpdateTime: null },
      ],
      nextPageToken: null,
    })
    const first = await syncGoogleReviews(ORG)
    expect(first).toMatchObject({ ok: true, synced: 2 })
    expect(store.reviews).toHaveLength(2)

    // Re-sync the same ids → no duplicate rows.
    const second = await syncGoogleReviews(ORG)
    expect(second.synced).toBe(2)
    expect(store.reviews).toHaveLength(2)
  })

  it('updates the reply fields when a previously-unanswered review gains a reply', async () => {
    setConnected()
    client.listGoogleReviews.mockResolvedValueOnce({
      reviews: [{ id: 'r1', starRating: 5, comment: 'A', reviewerName: 'X', createTime: null, updateTime: null, reviewerPhotoUrl: null, replyComment: null, replyUpdateTime: null }],
      nextPageToken: null,
    })
    await syncGoogleReviews(ORG)
    expect(store.reviews[0].replyComment).toBeNull()

    client.listGoogleReviews.mockResolvedValueOnce({
      reviews: [{ id: 'r1', starRating: 5, comment: 'A', reviewerName: 'X', createTime: null, updateTime: null, reviewerPhotoUrl: null, replyComment: 'Thanks!', replyUpdateTime: '2026-06-05T00:00:00Z' }],
      nextPageToken: null,
    })
    await syncGoogleReviews(ORG)
    expect(store.reviews).toHaveLength(1)
    expect(store.reviews[0].replyComment).toBe('Thanks!')
  })

  it('does NOT wipe an existing reply when a later sync pulls no reply (propagation lag)', async () => {
    setConnected()
    // First sync: the clinic's reply is present in the pulled payload.
    client.listGoogleReviews.mockResolvedValueOnce({
      reviews: [{ id: 'r1', starRating: 5, comment: 'A', reviewerName: 'X', createTime: null, updateTime: null, reviewerPhotoUrl: null, replyComment: 'Thank you!', replyUpdateTime: '2026-06-05T00:00:00Z' }],
      nextPageToken: null,
    })
    await syncGoogleReviews(ORG)
    expect(store.reviews[0].replyComment).toBe('Thank you!')

    // Second sync: Google hasn't propagated the reply back yet → null. The upsert
    // must NOT overwrite the stored reply (the dashboard would flicker empty).
    client.listGoogleReviews.mockResolvedValueOnce({
      reviews: [{ id: 'r1', starRating: 5, comment: 'A', reviewerName: 'X', createTime: null, updateTime: null, reviewerPhotoUrl: null, replyComment: null, replyUpdateTime: null }],
      nextPageToken: null,
    })
    await syncGoogleReviews(ORG)
    expect(store.reviews[0].replyComment).toBe('Thank you!')
  })

  it('pages through nextPageToken', async () => {
    setConnected()
    client.listGoogleReviews
      .mockResolvedValueOnce({ reviews: [{ id: 'p1', starRating: 5, comment: null, reviewerName: null, createTime: null, updateTime: null, reviewerPhotoUrl: null, replyComment: null, replyUpdateTime: null }], nextPageToken: 'tok2' })
      .mockResolvedValueOnce({ reviews: [{ id: 'p2', starRating: 5, comment: null, reviewerName: null, createTime: null, updateTime: null, reviewerPhotoUrl: null, replyComment: null, replyUpdateTime: null }], nextPageToken: null })
    const r = await syncGoogleReviews(ORG)
    expect(r.synced).toBe(2)
    expect(client.listGoogleReviews).toHaveBeenCalledTimes(2)
  })

  it('records nothing destructive on an API failure (best-effort, ok:false)', async () => {
    setConnected()
    client.listGoogleReviews.mockRejectedValue(new Error('Zernio 500'))
    const r = await syncGoogleReviews(ORG)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Zernio 500')
    expect(store.reviews).toHaveLength(0)
  })
})

describe('getGoogleReviewStats', () => {
  it('returns zeros + null average when there are no reviews', async () => {
    const s = await getGoogleReviewStats(ORG)
    expect(s).toEqual({ count: 0, averageRating: null, needsReply: 0 })
  })

  it('averages only rated reviews, rounds to 1 decimal, counts needs-reply', async () => {
    store.reviews = [
      { organizationId: ORG, externalReviewId: 'a', starRating: 5, replyComment: 'hi' },
      { organizationId: ORG, externalReviewId: 'b', starRating: 4, replyComment: null },
      { organizationId: ORG, externalReviewId: 'c', starRating: 4, replyComment: null },
      // Comment-only (null rating) must NOT drag the average or count.
      { organizationId: ORG, externalReviewId: 'd', starRating: null, replyComment: null },
    ] as Row[]
    const s = await getGoogleReviewStats(ORG)
    expect(s.count).toBe(3)
    expect(s.averageRating).toBe(4.3) // (5+4+4)/3 = 4.333 → 4.3
    expect(s.needsReply).toBe(3)
  })
})

describe('replyToGoogleReview', () => {
  it('calls Zernio then persists the reply locally for a real connection', async () => {
    setConnected()
    store.reviews.push({ organizationId: ORG, externalReviewId: 'r1', isDemo: 0, replyComment: null } as Row)
    client.replyToGoogleReview.mockResolvedValue(undefined)
    const r = await replyToGoogleReview(ORG, 'r1', '  Thanks for visiting!  ')
    expect(r.ok).toBe(true)
    expect(client.replyToGoogleReview).toHaveBeenCalledWith({ accountId: 'acct_1', reviewId: 'r1', comment: 'Thanks for visiting!' })
    expect(store.reviews[0].replyComment).toBe('Thanks for visiting!')
  })

  it('persists locally only for a DEMO review (never networks)', async () => {
    setConnected({ isDemo: true })
    store.reviews.push({ organizationId: ORG, externalReviewId: 'demo_1', isDemo: 1, replyComment: null } as Row)
    const r = await replyToGoogleReview(ORG, 'demo_1', 'Demo reply')
    expect(r.ok).toBe(true)
    expect(client.replyToGoogleReview).not.toHaveBeenCalled()
    expect(store.reviews[0].replyComment).toBe('Demo reply')
  })

  it('rejects an empty reply', async () => {
    setConnected()
    store.reviews.push({ organizationId: ORG, externalReviewId: 'r1', isDemo: 0 } as Row)
    const r = await replyToGoogleReview(ORG, 'r1', '   ')
    expect(r).toMatchObject({ ok: false })
  })

  it('does not persist when Zernio rejects the reply', async () => {
    setConnected()
    store.reviews.push({ organizationId: ORG, externalReviewId: 'r1', isDemo: 0, replyComment: null } as Row)
    client.replyToGoogleReview.mockRejectedValue(new Error('forbidden'))
    const r = await replyToGoogleReview(ORG, 'r1', 'nope')
    expect(r.ok).toBe(false)
    expect(store.reviews[0].replyComment).toBeNull()
  })
})

describe('deleteGoogleReviewReply', () => {
  it('calls Zernio then clears the reply locally for a real connection', async () => {
    setConnected()
    store.reviews.push({ organizationId: ORG, externalReviewId: 'r1', isDemo: 0, replyComment: 'old', replyUpdatedAt: new Date() } as Row)
    client.deleteGoogleReviewReply.mockResolvedValue(undefined)
    const r = await deleteGoogleReviewReply(ORG, 'r1')
    expect(r.ok).toBe(true)
    expect(client.deleteGoogleReviewReply).toHaveBeenCalledWith({ accountId: 'acct_1', reviewId: 'r1' })
    expect(store.reviews[0].replyComment).toBeNull()
    expect(store.reviews[0].replyUpdatedAt).toBeNull()
  })

  it('clears locally only for a DEMO review (never networks)', async () => {
    setConnected({ isDemo: true })
    store.reviews.push({ organizationId: ORG, externalReviewId: 'demo_1', isDemo: 1, replyComment: 'old' } as Row)
    const r = await deleteGoogleReviewReply(ORG, 'demo_1')
    expect(r.ok).toBe(true)
    expect(client.deleteGoogleReviewReply).not.toHaveBeenCalled()
    expect(store.reviews[0].replyComment).toBeNull()
  })
})

describe('listGoogleReviews + hasGoogleBusinessConnection', () => {
  it('lists the org rows', async () => {
    store.reviews = [{ organizationId: ORG, externalReviewId: 'a', starRating: 5 } as Row]
    const rows = await listGoogleReviewsSvc(ORG)
    expect(rows).toHaveLength(1)
    expect(rows[0].externalReviewId).toBe('a')
  })

  it('reflects the connection status', async () => {
    expect(await hasGoogleBusinessConnection(ORG)).toBe(false)
    setConnected()
    expect(await hasGoogleBusinessConnection(ORG)).toBe(true)
  })
})
