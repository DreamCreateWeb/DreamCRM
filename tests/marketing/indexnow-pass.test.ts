import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE INDEXNOW PASS (lib/services/indexnow.ts) — the hourly reconcile.
 *
 * The engines' rule is "do not resubmit unchanged URLs", and the honest way
 * to keep it is to make re-sending structurally impossible rather than to
 * remember not to. So most of this file asserts what is NOT sent: nothing on
 * an idle hour, nothing on a second pass, nothing when either read fails,
 * nothing when our own key file is not being served.
 */

const world = vi.hoisted(() => ({
  posts: [] as Array<{ slug: string; title: string; excerpt: string | null; publishedAt: Date | null; updatedAt: Date | null }>,
  postsFail: false,
  config: {} as Record<string, unknown>,
  configReadFails: false,
  writes: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/services/marketing-blog', () => ({
  getMarketingPosts: vi.fn(async () => {
    if (world.postsFail) throw new Error('posts unreachable')
    return world.posts
  }),
}))

vi.mock('@/lib/services/platform-config', () => ({
  readPlatformConfigStrict: vi.fn(async () => {
    if (world.configReadFails) throw new Error('config unreachable')
    return world.config
  }),
  // The floored read — what a careless implementation would reach for.
  readPlatformConfig: vi.fn(async () => (world.configReadFails ? {} : world.config)),
  writePlatformConfig: vi.fn(async (patch: Record<string, unknown>) => {
    world.writes.push(patch)
    Object.assign(world.config, patch)
  }),
}))

import { INDEXNOW_ENDPOINT, INDEXNOW_KEY, INDEXNOW_KEY_PATH, type IndexNowState } from '@/lib/indexnow'
import { publicPages } from '@/lib/marketing/public-pages'
import {
  FIRST_NOTICE_MIN_UPTIME_SECONDS,
  INDEXNOW_CONFIG_KEY,
  desiredIndexNowMap,
  getIndexNowState,
  reconcileIndexNow,
} from '@/lib/services/indexnow'

const ORIGIN = 'https://www.dreamcreatestudio.com'
const KEY_URL = `${ORIGIN}${INDEXNOW_KEY_PATH}`
const WARM = FIRST_NOTICE_MIN_UPTIME_SECONDS + 1

const post = (slug: string, updated: string | null = null, title = `Title of ${slug}`) => ({
  slug,
  title,
  excerpt: `About ${slug}`,
  publishedAt: new Date('2026-10-01T12:00:00Z'),
  updatedAt: updated ? new Date(updated) : null,
})

interface Call {
  url: string
  method: string
  body: { host: string; key: string; keyLocation: string; urlList: string[] } | null
  headers: Record<string, string>
}

/** A fetch that serves the key file and answers the endpoint with `status`. */
function fakeFetch(opts: { status?: number; keyBody?: string; keyStatus?: number; postThrows?: boolean } = {}) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    })
    if (url === KEY_URL) {
      return new Response(opts.keyBody ?? INDEXNOW_KEY, { status: opts.keyStatus ?? 200 })
    }
    if (opts.postThrows) throw new Error('network down')
    return new Response(null, { status: opts.status ?? 200 })
  }) as typeof fetch
  return { impl, calls, posts: () => calls.filter((c) => c.method === 'POST') }
}

const state = () => world.config[INDEXNOW_CONFIG_KEY] as IndexNowState | undefined
const pass = (f: ReturnType<typeof fakeFetch>, extra: Partial<Parameters<typeof reconcileIndexNow>[0]> = {}) =>
  reconcileIndexNow({ appUrl: ORIGIN, fetchImpl: f.impl, uptimeSeconds: WARM, now: new Date('2026-11-24T15:00:00Z'), ...extra })

beforeEach(() => {
  // The pass says, on stderr, every time it stops short. Those lines are the
  // behaviour under test here, not noise worth printing forty times.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  world.posts = [post('first-post'), post('second-post')]
  world.postsFail = false
  world.config = {}
  world.configReadFails = false
  world.writes = []
})

describe('anywhere that is not the public site, it does nothing at all', () => {
  it('no address, a laptop, the browser harness: no read, no request, no write', async () => {
    for (const appUrl of [null, '', 'http://localhost:3000', 'http://127.0.0.1:3111']) {
      const f = fakeFetch()
      const result = await reconcileIndexNow({ appUrl, fetchImpl: f.impl, uptimeSeconds: WARM })
      expect(result, String(appUrl)).toEqual({ status: 'inert', changed: 0, removed: 0 })
      expect(f.calls, String(appUrl)).toEqual([])
    }
    expect(world.writes).toEqual([])
  })
})

describe('the first pass introduces the whole site, once', () => {
  it('checks its own key file, then names every public page in ONE request', async () => {
    const f = fakeFetch({ status: 202 })
    const result = await pass(f)
    const everyPage = publicPages(world.posts).map((p) => p.path)

    expect(f.calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${KEY_URL}`, `POST ${INDEXNOW_ENDPOINT}`])
    const sent = f.posts()[0]
    expect(sent.headers['content-type']).toMatch(/^application\/json/)
    expect(sent.body).toMatchObject({ host: 'www.dreamcreatestudio.com', key: INDEXNOW_KEY, keyLocation: KEY_URL })
    expect([...sent.body!.urlList].sort()).toEqual(everyPage.map((p) => `${ORIGIN}${p}`).sort())
    expect(sent.body!.urlList).toContain(`${ORIGIN}/`)
    expect(sent.body!.urlList).toContain(`${ORIGIN}/blog/first-post`)

    expect(result).toMatchObject({ status: 'delivered', outcome: 'accepted', httpStatus: 202, changed: everyPage.length, removed: 0 })
    // And it remembers exactly that.
    expect(state()!.submitted).toEqual(await desiredIndexNowMap())
    expect(state()!.lastDelivered).toEqual({ at: '2026-11-24T15:00:00.000Z', outcome: 'accepted', status: 202, urls: everyPage.length })
  })

  it('is HELD while this version may still be rolling out — nothing is sent, nothing is marked', async () => {
    const f = fakeFetch()
    const result = await pass(f, { uptimeSeconds: 30 })
    expect(result.status).toBe('held')
    expect(result.outcome).toBe('waiting_for_rollout')
    expect(f.calls).toEqual([])
    expect(state()!.submitted).toEqual({})
    expect(state()!.lastDelivered).toBeNull()
    // …and goes out once the process has been up long enough.
    const later = await pass(f, { uptimeSeconds: WARM })
    expect(later.status).toBe('delivered')
  })

  it('only the FIRST notice waits: once one has landed, a young process sends straight away', async () => {
    await pass(fakeFetch())
    world.posts = [...world.posts, post('third-post')]
    const f = fakeFetch()
    const result = await pass(f, { uptimeSeconds: 5 })
    expect(result.status).toBe('delivered')
    expect(f.posts()).toHaveLength(1)
  })
})

describe('"do not resubmit unchanged URLs"', () => {
  it('a second pass with nothing changed makes NO request — not even the key check', async () => {
    await pass(fakeFetch())
    const before = structuredClone(state()!)
    const f = fakeFetch()
    const result = await pass(f, { now: new Date('2026-11-24T16:00:00Z') })
    expect(result).toMatchObject({ status: 'nothing_to_send', changed: 0, removed: 0 })
    expect(f.calls).toEqual([])
    // What was announced, and the last delivery, are untouched; only the
    // heartbeat moved.
    expect(state()!.submitted).toEqual(before.submitted)
    expect(state()!.lastDelivered).toEqual(before.lastDelivered)
    expect(state()!.lastRun).toEqual({ at: '2026-11-24T16:00:00.000Z', outcome: 'nothing_to_send', status: null, urls: 0 })
  })

  it('ten idle hours are ten passes and zero requests', async () => {
    await pass(fakeFetch())
    const f = fakeFetch()
    for (let i = 0; i < 10; i++) await pass(f)
    expect(f.calls).toEqual([])
  })

  it('an edited article announces THAT article and nothing else', async () => {
    await pass(fakeFetch())
    world.posts = [post('first-post', '2026-11-24T14:30:00Z'), post('second-post')]
    const f = fakeFetch()
    const result = await pass(f)
    expect(f.posts()[0].body!.urlList).toEqual([`${ORIGIN}/blog/first-post`])
    expect(result).toMatchObject({ status: 'delivered', changed: 1, removed: 0 })
  })

  it('a new article announces itself and the index that now lists it', async () => {
    await pass(fakeFetch())
    world.posts = [post('brand-new'), ...world.posts]
    const f = fakeFetch()
    await pass(f)
    expect([...f.posts()[0].body!.urlList].sort()).toEqual([`${ORIGIN}/blog`, `${ORIGIN}/blog/brand-new`])
  })

  it('an unpublished article is announced one last time, then forgotten', async () => {
    await pass(fakeFetch())
    world.posts = [post('first-post')]
    const f = fakeFetch()
    const result = await pass(f)
    expect([...f.posts()[0].body!.urlList].sort()).toEqual([`${ORIGIN}/blog`, `${ORIGIN}/blog/second-post`])
    expect(result).toMatchObject({ changed: 1, removed: 1 })
    expect(state()!.submitted).not.toHaveProperty('/blog/second-post')
    // The pass after that has nothing to say about it.
    const again = fakeFetch()
    await pass(again)
    expect(again.calls).toEqual([])
  })
})

describe('it refuses to guess', () => {
  it('posts unreadable → nothing sent and nothing written (never "they were all deleted")', async () => {
    await pass(fakeFetch())
    const before = structuredClone(world.config)
    world.writes = []
    world.postsFail = true
    const f = fakeFetch()
    const result = await pass(f)
    expect(result).toMatchObject({ status: 'aborted', reason: 'posts unreachable' })
    expect(f.calls).toEqual([])
    expect(world.writes).toEqual([])
    expect(world.config).toEqual(before)
  })

  it('what-was-announced unreadable → nothing sent (never "nothing was announced, send it all")', async () => {
    await pass(fakeFetch())
    world.writes = []
    world.configReadFails = true
    const f = fakeFetch()
    const result = await pass(f)
    expect(result).toMatchObject({ status: 'aborted', reason: 'config unreachable' })
    expect(f.calls).toEqual([])
    expect(world.writes).toEqual([])
  })

  it('our own key file is not being served → no notice goes out, and no page is marked announced', async () => {
    for (const broken of [{ keyStatus: 404 }, { keyBody: 'something-else' }, { keyStatus: 308 }]) {
      world.config = {}
      const f = fakeFetch(broken)
      const result = await pass(f)
      expect(result, JSON.stringify(broken)).toMatchObject({ status: 'refused', outcome: 'key_not_served' })
      expect(f.posts(), JSON.stringify(broken)).toEqual([])
      expect(state()!.submitted, JSON.stringify(broken)).toEqual({})
      expect(state()!.lastDelivered).toBeNull()
    }
  })

  it('a key file with a trailing newline is still the key', async () => {
    const f = fakeFetch({ keyBody: `${INDEXNOW_KEY}\n` })
    expect((await pass(f)).status).toBe('delivered')
  })
})

describe('a refusal marks nothing as announced, and the next pass tries the same difference', () => {
  it.each([
    [400, 'bad_request'],
    [403, 'key_refused'],
    [422, 'urls_refused'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ])('HTTP %i → %s', async (status, outcome) => {
    const f = fakeFetch({ status })
    const result = await pass(f)
    expect(result).toMatchObject({ status: 'refused', outcome, httpStatus: status })
    expect(state()!.submitted).toEqual({})
    expect(state()!.lastDelivered).toBeNull()
    expect(state()!.lastRun).toMatchObject({ outcome, status })

    // Next hour: the same pages, sent again, and this time taken.
    const retry = fakeFetch({ status: 200 })
    const second = await pass(retry)
    expect(second.status).toBe('delivered')
    expect(retry.posts()[0].body!.urlList.length).toBe(f.posts()[0].body!.urlList.length)
  })

  it('a network failure is a refusal too (status 0), not a crash', async () => {
    const f = fakeFetch({ postThrows: true })
    const result = await pass(f)
    expect(result).toMatchObject({ status: 'refused', outcome: 'failed', httpStatus: 0 })
    expect(state()!.submitted).toEqual({})
  })

  it('a refusal after a delivery keeps the earlier record intact', async () => {
    await pass(fakeFetch())
    const delivered = structuredClone(state()!)
    world.posts = [post('first-post', '2026-11-24T14:30:00Z'), post('second-post')]
    await pass(fakeFetch({ status: 429 }), { now: new Date('2026-11-24T16:00:00Z') })
    expect(state()!.submitted).toEqual(delivered.submitted)
    expect(state()!.lastDelivered).toEqual(delivered.lastDelivered)
    expect(state()!.lastRun).toMatchObject({ outcome: 'rate_limited', urls: 1 })
  })
})

describe('the state', () => {
  it('is written under its own top-level key, WHOLE, and never touches another subsystem’s', async () => {
    world.config = { guardianAudience: 'platform', sharedBrain: { hour: 10 } }
    await pass(fakeFetch())
    expect(world.writes).toHaveLength(1)
    expect(Object.keys(world.writes[0])).toEqual([INDEXNOW_CONFIG_KEY])
    expect(Object.keys(world.writes[0][INDEXNOW_CONFIG_KEY] as object).sort()).toEqual(['lastDelivered', 'lastRun', 'submitted'])
    expect(world.config.guardianAudience).toBe('platform')
    expect(world.config.sharedBrain).toEqual({ hour: 10 })
  })

  it('the display read floors to "nothing recorded" when the config cannot be read', async () => {
    await pass(fakeFetch())
    expect(Object.keys((await getIndexNowState()).submitted).length).toBeGreaterThan(0)
    world.configReadFails = true
    expect(await getIndexNowState()).toEqual({ submitted: {}, lastRun: null, lastDelivered: null })
  })
})
