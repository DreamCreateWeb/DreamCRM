import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createGbpPost,
  createSocialPost,
  listPosts,
  deletePost,
  buildGbpPostOptions,
  GBP_POST_TYPES,
  GBP_CTA_TYPES,
  type CreateGbpPostInput,
} from '@/lib/zernio'

// Mock the fetch boundary so we exercise the real client without a live Zernio.
function mockFetch(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return vi.fn(async (..._args: unknown[]) => ({
    ok,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }))
}

const base: CreateGbpPostInput = {
  profileId: 'prof_1',
  accountId: 'acct_1',
  summary: 'Same-week cleanings available',
  postType: 'standard',
}

beforeEach(() => {
  process.env.ZERNIO_API_KEY = 'sk_test_zernio'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ZERNIO_API_KEY
})

describe('GBP post type + CTA constants', () => {
  it('exposes the three post types', () => {
    expect([...GBP_POST_TYPES]).toEqual(['standard', 'event', 'offer'])
  })
  it('exposes the six CTA action types', () => {
    expect([...GBP_CTA_TYPES]).toEqual(['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'])
  })
})

describe('buildGbpPostOptions', () => {
  it('maps standard → topicType STANDARD with no event/offer', () => {
    const o = buildGbpPostOptions(base)
    expect(o.topicType).toBe('STANDARD')
    expect(o.event).toBeUndefined()
    expect(o.offer).toBeUndefined()
  })

  it('serializes a BOOK CTA with the URL', () => {
    const o = buildGbpPostOptions({ ...base, cta: { actionType: 'BOOK', url: 'https://x/book' } })
    expect(o.callToAction).toEqual({ actionType: 'BOOK', url: 'https://x/book' })
  })

  it('omits the URL for a CALL CTA (uses listing phone)', () => {
    const o = buildGbpPostOptions({ ...base, cta: { actionType: 'CALL' } })
    expect(o.callToAction).toEqual({ actionType: 'CALL' })
  })

  it('serializes event topicType + schedule with start/end', () => {
    const o = buildGbpPostOptions({
      ...base,
      postType: 'event',
      event: { title: 'Kids Day', startAt: '2026-07-01T15:00:00.000Z', endAt: '2026-07-01T18:00:00.000Z' },
    })
    expect(o.topicType).toBe('EVENT')
    expect(o.event).toEqual({
      title: 'Kids Day',
      schedule: { startDate: '2026-07-01T15:00:00.000Z', endDate: '2026-07-01T18:00:00.000Z' },
    })
  })

  it('serializes offer topicType + coupon/redeem/terms, dropping blanks', () => {
    const o = buildGbpPostOptions({
      ...base,
      postType: 'offer',
      offer: { couponCode: 'SMILE99', redeemUrl: null, terms: 'New patients only' },
    })
    expect(o.topicType).toBe('OFFER')
    expect(o.offer).toEqual({ couponCode: 'SMILE99', termsConditions: 'New patients only' })
  })
})

describe('createGbpPost', () => {
  it('POSTs to /posts with profileId, content/text, targeting, GBP options + publishNow', async () => {
    const f = mockFetch({ post: { _id: 'zpost_1', permalink: 'https://maps.google/p/1' } })
    vi.stubGlobal('fetch', f)
    const out = await createGbpPost({ ...base, imageUrl: 'https://img/x.jpg', cta: { actionType: 'BOOK', url: 'https://x/book' } })
    expect(out.zernioPostId).toBe('zpost_1')
    expect(out.googleUrl).toBe('https://maps.google/p/1')

    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://zernio.com/api/v1/posts')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.profileId).toBe('prof_1')
    expect(body.content).toBe(base.summary)
    expect(body.text).toBe(base.summary)
    expect(body.socialAccountIds).toEqual(['acct_1'])
    expect(body.platforms).toEqual([{ platform: 'googlebusiness', accountId: 'acct_1' }])
    expect(body.mediaUrls).toBe('https://img/x.jpg')
    expect(body.publishNow).toBe(true)
    expect(body.scheduledAt).toBeUndefined()
    // GBP options ride several tolerant keys.
    expect((body.options as Record<string, unknown>).topicType).toBe('STANDARD')
    expect((body.options as Record<string, unknown>).callToAction).toEqual({ actionType: 'BOOK', url: 'https://x/book' })
    expect(body.googleBusiness).toBeTruthy()
    expect(body.platformOptions.googlebusiness).toBeTruthy()
  })

  it('sends scheduledAt/scheduledFor (and NO publishNow) when scheduling', async () => {
    const f = mockFetch({ _id: 'zpost_2' })
    vi.stubGlobal('fetch', f)
    const out = await createGbpPost({ ...base, scheduledAt: '2099-01-01T00:00:00.000Z' })
    expect(out.zernioPostId).toBe('zpost_2')
    const body = JSON.parse((f.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.scheduledAt).toBe('2099-01-01T00:00:00.000Z')
    expect(body.scheduledFor).toBe('2099-01-01T00:00:00.000Z')
    expect(body.publishNow).toBeUndefined()
  })

  it('extracts a permalink from a per-account results array', async () => {
    const f = mockFetch({ _id: 'zp', results: [{ url: 'https://maps.google/p/9' }] })
    vi.stubGlobal('fetch', f)
    const out = await createGbpPost(base)
    expect(out.googleUrl).toBe('https://maps.google/p/9')
  })

  it('returns null ids gracefully when the response is shapeless', async () => {
    vi.stubGlobal('fetch', mockFetch({ message: 'queued' }))
    const out = await createGbpPost(base)
    expect(out.zernioPostId).toBeNull()
    expect(out.googleUrl).toBeNull()
  })

  it('throws status + body on a non-2xx (auth/error)', async () => {
    vi.stubGlobal('fetch', mockFetch('account not authorized', false, 403, 'Forbidden'))
    await expect(createGbpPost(base)).rejects.toThrow(/403 Forbidden/)
    vi.stubGlobal('fetch', mockFetch('account not authorized', false, 403, 'Forbidden'))
    await expect(createGbpPost(base)).rejects.toThrow(/account not authorized/)
  })

  it('throws without the API key (lazy)', async () => {
    delete process.env.ZERNIO_API_KEY
    await expect(createGbpPost(base)).rejects.toThrow(/ZERNIO_API_KEY is not set/)
  })
})

describe('createSocialPost (generic, single account)', () => {
  it('POSTs to /posts with content/text, targeting, mediaUrls + publishNow (NO GBP options)', async () => {
    const f = mockFetch({ post: { _id: 'zig', permalink: 'https://ig/1' } })
    vi.stubGlobal('fetch', f)
    const out = await createSocialPost({
      profileId: 'prof_1',
      accountId: 'acct_ig',
      platform: 'instagram',
      summary: 'Behind the smiles',
      imageUrl: 'https://img/x.jpg',
    })
    expect(out.zernioPostId).toBe('zig')
    expect(out.googleUrl).toBe('https://ig/1')
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://zernio.com/api/v1/posts')
    const body = JSON.parse(init.body as string)
    expect(body.profileId).toBe('prof_1')
    expect(body.content).toBe('Behind the smiles')
    expect(body.socialAccountIds).toEqual(['acct_ig'])
    expect(body.platforms).toEqual([{ platform: 'instagram', accountId: 'acct_ig' }])
    expect(body.mediaUrls).toBe('https://img/x.jpg')
    expect(body.publishNow).toBe(true)
    // No GBP-specific options on a social post.
    expect(body.options).toBeUndefined()
    expect(body.googleBusiness).toBeUndefined()
  })

  it('sends scheduledAt/scheduledFor (and NO publishNow) when scheduling', async () => {
    const f = mockFetch({ _id: 'z' })
    vi.stubGlobal('fetch', f)
    await createSocialPost({ profileId: 'p', accountId: 'a', platform: 'facebook', summary: 'hi', scheduledAt: '2099-01-01T00:00:00.000Z' })
    const body = JSON.parse((f.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.scheduledAt).toBe('2099-01-01T00:00:00.000Z')
    expect(body.publishNow).toBeUndefined()
  })
})

describe('listPosts', () => {
  it('GETs /posts with paging + status and normalizes the list', async () => {
    const f = mockFetch({
      posts: [
        { _id: 'p1', status: 'published', content: 'hi', permalink: 'https://g/1', publishedAt: '2026-06-01T00:00:00Z' },
        { id: 'p2', status: 'scheduled', text: 'soon', scheduledFor: '2026-07-01T00:00:00Z' },
      ],
    })
    vi.stubGlobal('fetch', f)
    const out = await listPosts({ page: 2, limit: 10, status: 'published' })
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toContain('/posts?')
    expect(url).toContain('page=2')
    expect(url).toContain('status=published')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'p1', status: 'published', content: 'hi', googleUrl: 'https://g/1' })
    expect(out[1]).toMatchObject({ id: 'p2', status: 'scheduled', content: 'soon', scheduledAt: '2026-07-01T00:00:00Z' })
  })

  it('tolerates a bare array + drops idless rows', async () => {
    vi.stubGlobal('fetch', mockFetch([{ _id: 'p1' }, { status: 'failed' }]))
    const out = await listPosts()
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('p1')
  })
})

describe('deletePost', () => {
  it('DELETEs the encoded post path', async () => {
    const f = vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 204, statusText: 'No Content', json: async () => ({}), text: async () => '' }))
    vi.stubGlobal('fetch', f)
    await deletePost('post id/1')
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/posts/post%20id%2F1')
    expect(init.method).toBe('DELETE')
  })
})
