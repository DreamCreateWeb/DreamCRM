import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GBP posting service — validation, publish (success stores ids; failure →
 * status=failed + error, never throws), demo no-network, list, delete. The
 * Zernio client + connection resolver are mocked; the DB is an in-memory fake
 * over the single `gbp_post` table.
 */

// ── Zernio client + connection-resolver mocks ───────────────────────────────
const zernio = {
  createGbpPost: vi.fn(),
  deletePost: vi.fn(),
}
vi.mock('@/lib/zernio', async (orig) => {
  // Keep the real constants (GBP_POST_TYPES etc.) — only stub the network fns.
  const actual = await orig<typeof import('@/lib/zernio')>()
  return {
    ...actual,
    createGbpPost: (...a: unknown[]) => zernio.createGbpPost(...a),
    deletePost: (...a: unknown[]) => zernio.deletePost(...a),
  }
})

const conn = {
  resolveGbpAccount: vi.fn(),
  getZernioConnection: vi.fn(),
}
vi.mock('@/lib/services/zernio', () => ({
  resolveGbpAccount: (...a: unknown[]) => conn.resolveGbpAccount(...a),
  getZernioConnection: (...a: unknown[]) => conn.getZernioConnection(...a),
}))

// ── In-memory DB fake (gbp_post + patient) ──────────────────────────────────
interface Store {
  posts: Array<Record<string, unknown>>
  patients: Array<Record<string, unknown>>
  orgs: Array<Record<string, unknown>>
}
const store: Store = { posts: [], patients: [], orgs: [] }

vi.mock('@/lib/db', () => {
  const T_POST = 'gbp_post'
  const T_PAT = 'patient'
  const T_ORG = 'organization'

  function select(_cols?: unknown) {
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
    const run = () => {
      const rows = table === T_PAT ? store.patients : table === T_ORG ? store.orgs : store.posts
      return rows.filter((r) => filters.every((f) => f(r)))
    }
    api.limit = async () => run()
    api.then = (resolve: (v: unknown) => void) => resolve(run())
    return api
  }

  function insert(_t: { __name: string }) {
    // Support BOTH `await db.insert(t).values(v)` (createGbpPost) and
    // `db.insert(t).values(v).onConflictDoNothing()` (seedDemoGbpPosts).
    return {
      values: (v: Record<string, unknown>) => {
        const push = () => {
          store.posts.push({ ...v })
        }
        const pushIfNew = () => {
          if (!store.posts.some((r) => r.id === v.id)) store.posts.push({ ...v })
        }
        return {
          // awaited directly → plain insert
          then: (resolve: (x: unknown) => void) => {
            push()
            resolve(undefined)
          },
          onConflictDoNothing: () => ({
            then: (resolve: (x: unknown) => void) => {
              pushIfNew()
              resolve(undefined)
            },
          }),
        }
      },
    }
  }

  function update(_t: { __name: string }) {
    let set: Record<string, unknown> = {}
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.set = (s: Record<string, unknown>) => {
      set = s
      return api
    }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      for (const row of store.posts) if (filters.every((f) => f(row))) Object.assign(row, set)
      resolve(undefined)
    }
    return api
  }

  function del(_t: { __name: string }) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      store.posts = store.posts.filter((row) => !filters.every((f) => f(row)))
      resolve(undefined)
    }
    return api
  }

  return {
    db: { select, insert, update, delete: del },
    schema: {
      gbpPost: {
        __name: T_POST,
        organizationId: { __col: 'organizationId' },
        id: { __col: 'id' },
        createdAt: { __col: 'createdAt' },
      },
      patient: { __name: T_PAT, organizationId: { __col: 'organizationId' } },
      organization: { __name: T_ORG, id: { __col: 'id' }, slug: { __col: 'slug' } },
    },
  }
})

// drizzle helpers → predicate builders the fake understands.
vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds,
  desc: () => 'desc',
}))

import {
  createGbpPost,
  listGbpPosts,
  deleteGbpPost,
  validateGbpPostInput,
  seedDemoGbpPosts,
} from '@/lib/services/gbp-posts'

beforeEach(() => {
  store.posts = []
  store.patients = []
  store.orgs = []
  vi.clearAllMocks()
})

describe('validateGbpPostInput', () => {
  it('rejects an empty summary', () => {
    const r = validateGbpPostInput({ postType: 'standard', summary: '   ' })
    expect(r.ok).toBe(false)
  })
  it('rejects an over-length summary (>1500)', () => {
    const r = validateGbpPostInput({ postType: 'standard', summary: 'x'.repeat(1501) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/1500/)
  })
  it('requires a URL for a non-CALL CTA', () => {
    const r = validateGbpPostInput({ postType: 'standard', summary: 'hi', ctaType: 'BOOK' })
    expect(r.ok).toBe(false)
  })
  it('accepts a CALL CTA with no URL', () => {
    const r = validateGbpPostInput({ postType: 'standard', summary: 'hi', ctaType: 'CALL' })
    expect(r.ok).toBe(true)
  })
  it('rejects a bad CTA URL', () => {
    const r = validateGbpPostInput({ postType: 'standard', summary: 'hi', ctaType: 'BOOK', ctaUrl: 'not-a-url' })
    expect(r.ok).toBe(false)
  })
  it('requires event title + start for an event post', () => {
    expect(validateGbpPostInput({ postType: 'event', summary: 'hi', eventStartAt: '2099-01-01T00:00' }).ok).toBe(false)
    expect(validateGbpPostInput({ postType: 'event', summary: 'hi', eventTitle: 'Day' }).ok).toBe(false)
    expect(
      validateGbpPostInput({ postType: 'event', summary: 'hi', eventTitle: 'Day', eventStartAt: '2099-01-01T00:00' }).ok,
    ).toBe(true)
  })
  it('rejects an event end before its start', () => {
    const r = validateGbpPostInput({
      postType: 'event',
      summary: 'hi',
      eventTitle: 'Day',
      eventStartAt: '2099-02-01T10:00',
      eventEndAt: '2099-02-01T09:00',
    })
    expect(r.ok).toBe(false)
  })
  it('rejects a past scheduled time', () => {
    const r = validateGbpPostInput({ postType: 'standard', summary: 'hi', scheduledAt: '2000-01-01T00:00' })
    expect(r.ok).toBe(false)
  })
  it('rejects a bad image URL', () => {
    const r = validateGbpPostInput({ postType: 'standard', summary: 'hi', imageUrl: 'ftp://x' })
    expect(r.ok).toBe(false)
  })
})

describe('createGbpPost — no connection', () => {
  it('returns skipped:no_connection without persisting', async () => {
    conn.resolveGbpAccount.mockResolvedValue(null)
    const r = await createGbpPost('org_1', { postType: 'standard', summary: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.skipped).toBe('no_connection')
    expect(store.posts).toHaveLength(0)
  })
})

describe('createGbpPost — demo (no network)', () => {
  it('persists a published row with a synthetic id + fake permalink, never networks', async () => {
    conn.resolveGbpAccount.mockResolvedValue({ accountId: 'demo_gbp', isDemo: true })
    const r = await createGbpPost('org_demo', { postType: 'standard', summary: 'Same-week cleanings' })
    expect(r.ok).toBe(true)
    expect(r.status).toBe('published')
    expect(zernio.createGbpPost).not.toHaveBeenCalled()
    expect(store.posts).toHaveLength(1)
    const row = store.posts[0]
    expect(row.isDemo).toBe(1)
    expect(row.status).toBe('published')
    expect(row.zernioPostId).toMatch(/^demo_zpost_/)
    expect(row.googleUrl).toBeTruthy()
    expect(row.publishedAt).toBeInstanceOf(Date)
  })

  it('a demo schedule persists a scheduled row (no publishedAt), no network', async () => {
    conn.resolveGbpAccount.mockResolvedValue({ accountId: 'demo_gbp', isDemo: true })
    const r = await createGbpPost('org_demo', { postType: 'standard', summary: 'hi', scheduledAt: '2099-01-01T00:00' })
    expect(r.status).toBe('scheduled')
    expect(store.posts[0].status).toBe('scheduled')
    expect(store.posts[0].publishedAt).toBeNull()
    expect(zernio.createGbpPost).not.toHaveBeenCalled()
  })
})

describe('createGbpPost — real publish', () => {
  beforeEach(() => {
    conn.resolveGbpAccount.mockResolvedValue({ accountId: 'acct_1', isDemo: false })
    conn.getZernioConnection.mockResolvedValue({ zernioProfileId: 'prof_1' })
  })

  it('persists the row first, then stores zernioPostId + googleUrl on success', async () => {
    zernio.createGbpPost.mockResolvedValue({ zernioPostId: 'zpost_1', googleUrl: 'https://g/1' })
    const r = await createGbpPost('org_1', {
      postType: 'offer',
      summary: 'Whitening special',
      offerCouponCode: 'SMILE99',
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe('published')
    expect(zernio.createGbpPost).toHaveBeenCalledTimes(1)
    // The Zernio call carried the resolved profile + account + offer.
    const arg = zernio.createGbpPost.mock.calls[0][0]
    expect(arg.profileId).toBe('prof_1')
    expect(arg.accountId).toBe('acct_1')
    expect(arg.offer).toEqual({ couponCode: 'SMILE99', redeemUrl: null, terms: null })
    const row = store.posts[0]
    expect(row.status).toBe('published')
    expect(row.zernioPostId).toBe('zpost_1')
    expect(row.googleUrl).toBe('https://g/1')
    expect(row.offerCouponCode).toBe('SMILE99')
  })

  it('on a Zernio failure → status=failed + lastError, NEVER throws', async () => {
    zernio.createGbpPost.mockRejectedValue(new Error('Google rejected: image too small'))
    const r = await createGbpPost('org_1', { postType: 'standard', summary: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/image too small/)
    const row = store.posts[0]
    expect(row.status).toBe('failed')
    expect(row.lastError).toMatch(/image too small/)
    expect(row.zernioPostId).toBeNull()
  })

  it('fails cleanly (no network) when no profile is linked', async () => {
    conn.getZernioConnection.mockResolvedValue({ zernioProfileId: null })
    const r = await createGbpPost('org_1', { postType: 'standard', summary: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('failed')
    expect(zernio.createGbpPost).not.toHaveBeenCalled()
    expect(store.posts[0].status).toBe('failed')
  })

  it('rejects invalid input before any DB or network work', async () => {
    const r = await createGbpPost('org_1', { postType: 'standard', summary: '' })
    expect(r.ok).toBe(false)
    expect(store.posts).toHaveLength(0)
    expect(zernio.createGbpPost).not.toHaveBeenCalled()
  })
})

describe('listGbpPosts', () => {
  it('returns the org rows as views', async () => {
    store.posts = [
      {
        id: 'gbp_1',
        organizationId: 'org_1',
        accountId: 'a',
        postType: 'offer',
        summary: 'x',
        imageUrl: null,
        ctaType: 'BOOK',
        ctaUrl: 'https://b',
        eventTitle: null,
        eventStartAt: null,
        eventEndAt: null,
        offerCouponCode: 'C',
        offerRedeemUrl: null,
        offerTerms: null,
        status: 'published',
        scheduledAt: null,
        publishedAt: new Date('2026-06-01T00:00:00Z'),
        googleUrl: 'https://g',
        lastError: null,
        isDemo: 1,
        createdAt: new Date('2026-06-01T00:00:00Z'),
        updatedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ]
    const out = await listGbpPosts('org_1')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'gbp_1', postType: 'offer', status: 'published', ctaType: 'BOOK' })
    expect(out[0].publishedAtIso).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('deleteGbpPost', () => {
  function seedRow(over: Record<string, unknown>) {
    store.posts.push({
      id: 'gbp_1',
      organizationId: 'org_1',
      accountId: 'a',
      zernioPostId: 'zpost_1',
      isDemo: 0,
      status: 'published',
      ...over,
    })
  }

  it('deletes at Zernio (best-effort) then drops the local row', async () => {
    zernio.deletePost.mockResolvedValue(undefined)
    seedRow({})
    const r = await deleteGbpPost('org_1', 'gbp_1')
    expect(r.ok).toBe(true)
    expect(zernio.deletePost).toHaveBeenCalledWith('zpost_1')
    expect(store.posts).toHaveLength(0)
  })

  it('still drops the local row when Zernio errors', async () => {
    zernio.deletePost.mockRejectedValue(new Error('not found'))
    seedRow({})
    const r = await deleteGbpPost('org_1', 'gbp_1')
    expect(r.ok).toBe(true)
    expect(store.posts).toHaveLength(0)
  })

  it('demo rows are local-only (never network)', async () => {
    seedRow({ isDemo: 1 })
    const r = await deleteGbpPost('org_1', 'gbp_1')
    expect(r.ok).toBe(true)
    expect(zernio.deletePost).not.toHaveBeenCalled()
    expect(store.posts).toHaveLength(0)
  })

  it('returns an error for an unknown post', async () => {
    const r = await deleteGbpPost('org_1', 'missing')
    expect(r.ok).toBe(false)
  })
})

describe('seedDemoGbpPosts', () => {
  beforeEach(() => {
    conn.resolveGbpAccount.mockResolvedValue({ accountId: 'demo_gbp_dream_dental', isDemo: true })
    // The book-URL resolver reads the organization slug.
    store.patients = [{ organizationId: 'org_demo' }]
    store.orgs = [{ id: 'org_demo', slug: 'acme-dental-demo' }]
  })

  it('seeds NOTHING when the org has no patients (orphan guard)', async () => {
    store.patients = []
    await seedDemoGbpPosts('org_demo')
    expect(store.posts).toHaveLength(0)
  })

  it('seeds the curated demo posts (Update + Offer + Event), all demo-scoped', async () => {
    await seedDemoGbpPosts('org_demo')
    expect(store.posts.length).toBeGreaterThanOrEqual(3)
    for (const p of store.posts) {
      expect(p.isDemo).toBe(1)
      expect(p.organizationId).toBe('org_demo')
      expect(p.accountId).toBe('demo_gbp_dream_dental')
    }
    const types = store.posts.map((p) => p.postType)
    expect(types).toContain('standard')
    expect(types).toContain('offer')
    expect(types).toContain('event')
    // A published Update with an image + Book CTA.
    const update = store.posts.find((p) => p.postType === 'standard')!
    expect(update.status).toBe('published')
    expect(update.imageUrl).toBeTruthy()
    expect(update.ctaType).toBe('BOOK')
    expect(String(update.ctaUrl)).toMatch(/\/book$/)
    // A published Offer with a coupon.
    const offer = store.posts.find((p) => p.postType === 'offer')!
    expect(offer.offerCouponCode).toBeTruthy()
    // A scheduled Event.
    const event = store.posts.find((p) => p.postType === 'event')!
    expect(event.status).toBe('scheduled')
    expect(event.eventTitle).toBeTruthy()
    expect(event.scheduledAt).toBeInstanceOf(Date)
  })

  it('is idempotent — a second run adds no duplicates', async () => {
    await seedDemoGbpPosts('org_demo')
    const first = store.posts.length
    await seedDemoGbpPosts('org_demo')
    expect(store.posts).toHaveLength(first)
  })
})
