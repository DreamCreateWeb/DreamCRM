import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unified social-posts service — validation, multi-target publish (per-target
 * success/failure isolation; failure → target status=failed + error, never
 * throws), demo no-network, list (parent + targets), delete, and the demo seed.
 * The Zernio client + connection resolver are mocked; the DB is an in-memory
 * fake over `social_post` + `social_post_target` (+ patient/organization reads).
 */

// ── Zernio client mocks ─────────────────────────────────────────────────────
const zernio = {
  createGbpPost: vi.fn(),
  createSocialPost: vi.fn(),
  deletePost: vi.fn(),
}
vi.mock('@/lib/zernio', async (orig) => {
  const actual = await orig<typeof import('@/lib/zernio')>()
  return {
    ...actual,
    createGbpPost: (...a: unknown[]) => zernio.createGbpPost(...a),
    createSocialPost: (...a: unknown[]) => zernio.createSocialPost(...a),
    deletePost: (...a: unknown[]) => zernio.deletePost(...a),
  }
})

// ── Connection-resolver mock ────────────────────────────────────────────────
const conn = { getZernioConnection: vi.fn() }
vi.mock('@/lib/services/zernio', () => ({
  getZernioConnection: (...a: unknown[]) => conn.getZernioConnection(...a),
}))

// ── In-memory DB fake (social_post + social_post_target + patient + org) ─────
interface Store {
  posts: Array<Record<string, unknown>>
  targets: Array<Record<string, unknown>>
  patients: Array<Record<string, unknown>>
  orgs: Array<Record<string, unknown>>
}
const store: Store = { posts: [], targets: [], patients: [], orgs: [] }

function tableRows(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'social_post':
      return store.posts
    case 'social_post_target':
      return store.targets
    case 'patient':
      return store.patients
    case 'organization':
      return store.orgs
    default:
      return []
  }
}

vi.mock('@/lib/db', () => {
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
    const run = () => tableRows(table).filter((r) => filters.every((f) => f(r)))
    api.limit = async () => run()
    api.then = (resolve: (v: unknown) => void) => resolve(run())
    return api
  }

  function insert(t: { __name: string }) {
    const rows = tableRows(t.__name)
    return {
      values: (v: Record<string, unknown>) => {
        const push = () => rows.push({ ...v })
        const pushIfNew = () => {
          if (!rows.some((r) => r.id === v.id)) rows.push({ ...v })
        }
        return {
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

  function update(t: { __name: string }) {
    const rows = tableRows(t.__name)
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
      for (const row of rows) if (filters.every((f) => f(row))) Object.assign(row, set)
      resolve(undefined)
    }
    return api
  }

  function del(t: { __name: string }) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      const kept = tableRows(t.__name).filter((row) => !filters.every((f) => f(row)))
      const cur = tableRows(t.__name)
      cur.length = 0
      cur.push(...kept)
      resolve(undefined)
    }
    return api
  }

  return {
    db: { select, insert, update, delete: del },
    schema: {
      socialPost: {
        __name: 'social_post',
        organizationId: { __col: 'organizationId' },
        id: { __col: 'id' },
        createdAt: { __col: 'createdAt' },
      },
      socialPostTarget: {
        __name: 'social_post_target',
        organizationId: { __col: 'organizationId' },
        socialPostId: { __col: 'socialPostId' },
        id: { __col: 'id' },
      },
      patient: { __name: 'patient', organizationId: { __col: 'organizationId' } },
      organization: { __name: 'organization', id: { __col: 'id' }, slug: { __col: 'slug' } },
    },
  }
})

// drizzle helpers → predicate builders the fake understands.
vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds,
  desc: () => 'desc',
  inArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) => vals.includes(r[col.__col]),
}))

import {
  createSocialPost,
  listSocialPosts,
  deleteSocialPost,
  validateSocialPostInput,
  seedDemoSocialPosts,
  getComposerChannels,
} from '@/lib/services/social-posts'

// Connection helpers
function gbpAccount(id = 'acct_gbp') {
  return { id, platform: 'googlebusiness', profileId: 'prof_1', username: 'dream', displayName: 'Dream', profilePicture: null, profileUrl: null }
}
function igAccount(id = 'acct_ig') {
  return { id, platform: 'instagram', profileId: 'prof_1', username: '@dream', displayName: 'Dream', profilePicture: null, profileUrl: null }
}
function connection(over: Record<string, unknown> = {}) {
  const accounts = (over.accounts as unknown[]) ?? [gbpAccount(), igAccount()]
  return {
    status: 'connected',
    zernioProfileId: 'prof_1',
    lastError: null,
    isDemo: false,
    googleBusinessAccounts: (accounts as Array<{ platform: string }>).filter((a) => a.platform === 'googlebusiness'),
    accounts,
    ...over,
  }
}

beforeEach(() => {
  store.posts = []
  store.targets = []
  store.patients = []
  store.orgs = []
  vi.clearAllMocks()
})

describe('validateSocialPostInput', () => {
  it('requires at least one target account', () => {
    const r = validateSocialPostInput({ accountIds: [], postType: 'standard', summary: 'hi' }, [])
    expect(r.ok).toBe(false)
  })
  it('rejects an empty summary', () => {
    const r = validateSocialPostInput({ accountIds: ['a'], postType: 'standard', summary: '  ' }, ['instagram'])
    expect(r.ok).toBe(false)
  })
  it('only validates GBP fields when GBP is targeted (CTA ignored social-only)', () => {
    // A non-CALL CTA without a URL is invalid for GBP…
    expect(validateSocialPostInput({ accountIds: ['a'], postType: 'standard', summary: 'hi', ctaType: 'BOOK' }, ['googlebusiness']).ok).toBe(false)
    // …but ignored entirely for a social-only post.
    expect(validateSocialPostInput({ accountIds: ['a'], postType: 'standard', summary: 'hi', ctaType: 'BOOK' }, ['instagram']).ok).toBe(true)
  })
  it('enforces the GBP 1500 cap when GBP is targeted', () => {
    const r = validateSocialPostInput({ accountIds: ['a'], postType: 'standard', summary: 'x'.repeat(1501) }, ['googlebusiness'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/1500/)
  })
  it('allows a longer body for a social-only post (no GBP 1500 cap)', () => {
    const r = validateSocialPostInput({ accountIds: ['a'], postType: 'standard', summary: 'x'.repeat(1600) }, ['instagram'])
    expect(r.ok).toBe(true)
  })
  it('forces postType=standard for a social-only post', () => {
    const r = validateSocialPostInput({ accountIds: ['a'], postType: 'event', summary: 'hi' }, ['instagram'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.postType).toBe('standard')
  })
  it('rejects a past scheduled time', () => {
    const r = validateSocialPostInput({ accountIds: ['a'], postType: 'standard', summary: 'hi', scheduledAt: '2000-01-01T00:00' }, ['instagram'])
    expect(r.ok).toBe(false)
  })
})

describe('getComposerChannels', () => {
  it('returns GBP first then socials when connected', async () => {
    conn.getZernioConnection.mockResolvedValue(connection())
    const chans = await getComposerChannels('org_1')
    expect(chans.map((c) => c.platform)).toEqual(['googlebusiness', 'instagram'])
    expect(chans[0].label).toBe('Google Business Profile')
  })
  it('hides GBP when the connection is not connected (but keeps socials)', async () => {
    conn.getZernioConnection.mockResolvedValue(connection({ status: 'error' }))
    const chans = await getComposerChannels('org_1')
    expect(chans.map((c) => c.platform)).toEqual(['instagram'])
  })
})

describe('createSocialPost — no connection', () => {
  it('returns skipped:no_connection when no requested account is connected', async () => {
    conn.getZernioConnection.mockResolvedValue(connection({ accounts: [] }))
    const r = await createSocialPost('org_1', { accountIds: ['acct_gbp'], postType: 'standard', summary: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.skipped).toBe('no_connection')
    expect(store.posts).toHaveLength(0)
  })
})

describe('createSocialPost — demo (no network)', () => {
  it('persists a published parent + published targets with synthetic ids, never networks', async () => {
    conn.getZernioConnection.mockResolvedValue(connection({ isDemo: true }))
    const r = await createSocialPost('org_demo', { accountIds: ['acct_gbp', 'acct_ig'], postType: 'standard', summary: 'Same-week cleanings' })
    expect(r.ok).toBe(true)
    expect(r.status).toBe('published')
    expect(zernio.createGbpPost).not.toHaveBeenCalled()
    expect(zernio.createSocialPost).not.toHaveBeenCalled()
    expect(store.posts).toHaveLength(1)
    expect(store.posts[0].isDemo).toBe(1)
    expect(store.targets).toHaveLength(2)
    for (const t of store.targets) {
      expect(t.status).toBe('published')
      expect(String(t.zernioPostId)).toMatch(/^demo_zpost_/)
      expect(t.googleUrl).toBeTruthy()
    }
  })

  it('a demo schedule persists scheduled targets (no publishedAt), no network', async () => {
    conn.getZernioConnection.mockResolvedValue(connection({ isDemo: true }))
    const r = await createSocialPost('org_demo', { accountIds: ['acct_ig'], postType: 'standard', summary: 'hi', scheduledAt: '2099-01-01T00:00' })
    expect(r.status).toBe('scheduled')
    expect(store.targets[0].status).toBe('scheduled')
    expect(store.targets[0].publishedAt).toBeNull()
    expect(zernio.createSocialPost).not.toHaveBeenCalled()
  })
})

describe('createSocialPost — real multi-target publish', () => {
  beforeEach(() => {
    conn.getZernioConnection.mockResolvedValue(connection())
  })

  it('persists the parent + targets first, calls the right wrapper per platform, stores ids on success', async () => {
    zernio.createGbpPost.mockResolvedValue({ zernioPostId: 'zgbp', googleUrl: 'https://g/gbp' })
    zernio.createSocialPost.mockResolvedValue({ zernioPostId: 'zig', googleUrl: 'https://ig/1' })
    const r = await createSocialPost('org_1', { accountIds: ['acct_gbp', 'acct_ig'], postType: 'standard', summary: 'Hello everyone' })
    expect(r.ok).toBe(true)
    expect(r.status).toBe('published')
    // GBP went through the GBP wrapper, IG through the generic one.
    expect(zernio.createGbpPost).toHaveBeenCalledTimes(1)
    expect(zernio.createSocialPost).toHaveBeenCalledTimes(1)
    const gbpArg = zernio.createGbpPost.mock.calls[0][0]
    expect(gbpArg.accountId).toBe('acct_gbp')
    expect(gbpArg.profileId).toBe('prof_1')
    const igArg = zernio.createSocialPost.mock.calls[0][0]
    expect(igArg.accountId).toBe('acct_ig')
    expect(igArg.platform).toBe('instagram')
    // Targets recorded their ids.
    const gbpT = store.targets.find((t) => t.platform === 'googlebusiness')!
    const igT = store.targets.find((t) => t.platform === 'instagram')!
    expect(gbpT.zernioPostId).toBe('zgbp')
    expect(gbpT.googleUrl).toBe('https://g/gbp')
    expect(igT.zernioPostId).toBe('zig')
    expect(igT.status).toBe('published')
    expect(store.posts[0].status).toBe('published')
  })

  it('isolates a per-target failure: one channel fails, the other still publishes', async () => {
    zernio.createGbpPost.mockResolvedValue({ zernioPostId: 'zgbp', googleUrl: null })
    zernio.createSocialPost.mockRejectedValue(new Error('Instagram rejected: image too small'))
    const r = await createSocialPost('org_1', { accountIds: ['acct_gbp', 'acct_ig'], postType: 'standard', summary: 'hi' })
    // ok because at least one succeeded; rollup is 'failed' because one failed.
    expect(r.ok).toBe(true)
    expect(r.status).toBe('failed')
    const gbpT = store.targets.find((t) => t.platform === 'googlebusiness')!
    const igT = store.targets.find((t) => t.platform === 'instagram')!
    expect(gbpT.status).toBe('published')
    expect(igT.status).toBe('failed')
    expect(String(igT.lastError)).toMatch(/image too small/)
  })

  it('all-fail → ok:false, every target failed, NEVER throws', async () => {
    zernio.createGbpPost.mockRejectedValue(new Error('gbp boom'))
    zernio.createSocialPost.mockRejectedValue(new Error('ig boom'))
    const r = await createSocialPost('org_1', { accountIds: ['acct_gbp', 'acct_ig'], postType: 'standard', summary: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('failed')
    expect(store.targets.every((t) => t.status === 'failed')).toBe(true)
  })

  it('schedule passes a future ISO through to each wrapper and marks targets scheduled', async () => {
    zernio.createGbpPost.mockResolvedValue({ zernioPostId: 'z', googleUrl: null })
    zernio.createSocialPost.mockResolvedValue({ zernioPostId: 'z2', googleUrl: null })
    const r = await createSocialPost('org_1', { accountIds: ['acct_gbp', 'acct_ig'], postType: 'standard', summary: 'hi', scheduledAt: '2099-05-01T10:00' })
    expect(r.status).toBe('scheduled')
    expect(zernio.createGbpPost.mock.calls[0][0].scheduledAt).toMatch(/^2099-05-01/)
    expect(zernio.createSocialPost.mock.calls[0][0].scheduledAt).toMatch(/^2099-05-01/)
    expect(store.targets.every((t) => t.status === 'scheduled' && t.publishedAt === null)).toBe(true)
  })

  it('fails cleanly (no network) when no profile is linked', async () => {
    conn.getZernioConnection.mockResolvedValue(connection({ zernioProfileId: null }))
    const r = await createSocialPost('org_1', { accountIds: ['acct_ig'], postType: 'standard', summary: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe('failed')
    expect(zernio.createSocialPost).not.toHaveBeenCalled()
    expect(store.targets[0].status).toBe('failed')
  })

  it('rejects invalid input before any DB/network work', async () => {
    const r = await createSocialPost('org_1', { accountIds: ['acct_ig'], postType: 'standard', summary: '' })
    expect(r.ok).toBe(false)
    expect(store.posts).toHaveLength(0)
    expect(zernio.createSocialPost).not.toHaveBeenCalled()
  })

  it('only targets the requested accounts (ignores unrequested connected ones)', async () => {
    zernio.createSocialPost.mockResolvedValue({ zernioPostId: 'z', googleUrl: null })
    await createSocialPost('org_1', { accountIds: ['acct_ig'], postType: 'standard', summary: 'hi' })
    expect(store.targets).toHaveLength(1)
    expect(store.targets[0].platform).toBe('instagram')
    expect(zernio.createGbpPost).not.toHaveBeenCalled()
  })
})

describe('listSocialPosts', () => {
  it('returns parents with their nested targets', async () => {
    store.posts = [
      {
        id: 'sp_1',
        organizationId: 'org_1',
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
        isDemo: 1,
        createdAt: new Date('2026-06-01T00:00:00Z'),
        updatedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ]
    store.targets = [
      { id: 'sp_1_t_a', socialPostId: 'sp_1', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'a', zernioPostId: 'z', status: 'published', googleUrl: 'https://g', lastError: null, publishedAt: new Date('2026-06-01T00:00:00Z') },
      { id: 'sp_1_t_b', socialPostId: 'sp_1', organizationId: 'org_1', platform: 'instagram', accountId: 'b', zernioPostId: 'z2', status: 'published', googleUrl: null, lastError: null, publishedAt: new Date('2026-06-01T00:00:00Z') },
    ]
    const out = await listSocialPosts('org_1')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'sp_1', postType: 'offer', status: 'published', ctaType: 'BOOK' })
    expect(out[0].targets).toHaveLength(2)
    expect(out[0].targets.map((t) => t.platform).sort()).toEqual(['googlebusiness', 'instagram'])
    expect(out[0].targets[0].label).toBeTruthy()
  })
})

describe('deleteSocialPost', () => {
  function seed(over: Record<string, unknown> = {}, targets: Array<Record<string, unknown>> = []) {
    store.posts.push({ id: 'sp_1', organizationId: 'org_1', isDemo: 0, status: 'published', ...over })
    store.targets.push(...targets)
  }

  it('deletes each target at Zernio (best-effort) then drops local rows', async () => {
    zernio.deletePost.mockResolvedValue(undefined)
    seed({}, [
      { id: 'sp_1_t_a', socialPostId: 'sp_1', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'a', zernioPostId: 'zgbp' },
      { id: 'sp_1_t_b', socialPostId: 'sp_1', organizationId: 'org_1', platform: 'instagram', accountId: 'b', zernioPostId: 'zig' },
    ])
    const r = await deleteSocialPost('org_1', 'sp_1')
    expect(r.ok).toBe(true)
    expect(zernio.deletePost).toHaveBeenCalledTimes(2)
    expect(store.posts).toHaveLength(0)
    expect(store.targets).toHaveLength(0)
  })

  it('still drops local rows when Zernio errors', async () => {
    zernio.deletePost.mockRejectedValue(new Error('not found'))
    seed({}, [{ id: 'sp_1_t_a', socialPostId: 'sp_1', organizationId: 'org_1', platform: 'instagram', accountId: 'b', zernioPostId: 'zig' }])
    const r = await deleteSocialPost('org_1', 'sp_1')
    expect(r.ok).toBe(true)
    expect(store.posts).toHaveLength(0)
    expect(store.targets).toHaveLength(0)
  })

  it('demo posts are local-only (never network)', async () => {
    seed({ isDemo: 1 }, [{ id: 'sp_1_t_a', socialPostId: 'sp_1', organizationId: 'org_1', platform: 'instagram', accountId: 'b', zernioPostId: 'zig' }])
    const r = await deleteSocialPost('org_1', 'sp_1')
    expect(r.ok).toBe(true)
    expect(zernio.deletePost).not.toHaveBeenCalled()
    expect(store.posts).toHaveLength(0)
  })

  it('returns an error for an unknown post', async () => {
    const r = await deleteSocialPost('org_1', 'missing')
    expect(r.ok).toBe(false)
  })
})

describe('seedDemoSocialPosts', () => {
  beforeEach(() => {
    conn.getZernioConnection.mockResolvedValue(
      connection({
        isDemo: true,
        accounts: [
          { id: 'demo_gbp_dream_dental', platform: 'googlebusiness', profileId: 'demo_profile', username: 'd', displayName: 'D', profilePicture: null, profileUrl: null },
          { id: 'demo_ig_dream_dental', platform: 'instagram', profileId: 'demo_profile', username: '@d', displayName: 'D', profilePicture: null, profileUrl: null },
          { id: 'demo_fb_dream_dental', platform: 'facebook', profileId: 'demo_profile', username: 'd', displayName: 'D', profilePicture: null, profileUrl: null },
        ],
      }),
    )
    store.patients = [{ organizationId: 'org_demo' }]
    store.orgs = [{ id: 'org_demo', slug: 'acme-dental-demo' }]
  })

  it('seeds NOTHING when the org has no patients (orphan guard)', async () => {
    store.patients = []
    await seedDemoSocialPosts('org_demo')
    expect(store.posts).toHaveLength(0)
  })

  it('seeds multi-channel demo posts (a cross-post, a GBP offer, a scheduled social cross-post, a GBP event)', async () => {
    await seedDemoSocialPosts('org_demo')
    expect(store.posts.length).toBeGreaterThanOrEqual(4)
    for (const p of store.posts) {
      expect(p.isDemo).toBe(1)
      expect(p.organizationId).toBe('org_demo')
    }
    // A published cross-post to GBP + IG + FB with an image + Book CTA.
    const cross = store.posts.find((p) => p.ctaType === 'BOOK')!
    expect(cross.status).toBe('published')
    expect(cross.imageUrl).toBeTruthy()
    expect(String(cross.ctaUrl)).toMatch(/\/book$/)
    const crossTargets = store.targets.filter((t) => t.socialPostId === cross.id)
    expect(crossTargets.map((t) => t.platform).sort()).toEqual(['facebook', 'googlebusiness', 'instagram'])
    // A scheduled social-only cross-post (no GBP target).
    const scheduledSocial = store.posts.find(
      (p) => p.status === 'scheduled' && store.targets.filter((t) => t.socialPostId === p.id).every((t) => t.platform !== 'googlebusiness'),
    )
    expect(scheduledSocial).toBeTruthy()
    // A GBP offer with a coupon + a scheduled GBP event.
    expect(store.posts.some((p) => p.offerCouponCode)).toBe(true)
    expect(store.posts.some((p) => p.postType === 'event' && p.status === 'scheduled')).toBe(true)
  })

  it('is idempotent — a second run adds no duplicates', async () => {
    await seedDemoSocialPosts('org_demo')
    const posts = store.posts.length
    const targets = store.targets.length
    await seedDemoSocialPosts('org_demo')
    expect(store.posts).toHaveLength(posts)
    expect(store.targets).toHaveLength(targets)
  })
})
