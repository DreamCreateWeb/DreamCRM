import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listGoogleReviews,
  replyToGoogleReview,
  deleteGoogleReviewReply,
  normalizeStarRating,
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

beforeEach(() => {
  process.env.ZERNIO_API_KEY = 'sk_test_zernio'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ZERNIO_API_KEY
})

describe('normalizeStarRating', () => {
  it('maps Google enum strings to integers 1–5', () => {
    expect(normalizeStarRating('ONE')).toBe(1)
    expect(normalizeStarRating('two')).toBe(2)
    expect(normalizeStarRating('FIVE')).toBe(5)
  })
  it('passes numbers through (rounding), clamping out-of-range to null', () => {
    expect(normalizeStarRating(4)).toBe(4)
    expect(normalizeStarRating(4.6)).toBe(5)
    expect(normalizeStarRating(0)).toBeNull()
    expect(normalizeStarRating(6)).toBeNull()
  })
  it('parses numeric strings', () => {
    expect(normalizeStarRating('3')).toBe(3)
  })
  it('returns null for unspecified / unreadable / nullish', () => {
    expect(normalizeStarRating('STAR_RATING_UNSPECIFIED')).toBeNull()
    expect(normalizeStarRating('')).toBeNull()
    expect(normalizeStarRating(null)).toBeNull()
    expect(normalizeStarRating(undefined)).toBeNull()
    expect(normalizeStarRating(NaN)).toBeNull()
  })
})

describe('listGoogleReviews', () => {
  it('GETs the gmb-reviews path with accountId + normalizes the canonical shape', async () => {
    const f = mockFetch({
      reviews: [
        {
          id: 'rev_1',
          starRating: 'FIVE',
          comment: 'Great visit',
          createTime: '2026-06-01T00:00:00Z',
          updateTime: '2026-06-02T00:00:00Z',
          reviewer: { displayName: 'Jane D.', profilePhotoUrl: 'https://p/jane.png' },
          reviewReply: { comment: 'Thank you!', updateTime: '2026-06-03T00:00:00Z' },
        },
      ],
      nextPageToken: 'tok_2',
    })
    vi.stubGlobal('fetch', f)
    const { reviews, nextPageToken } = await listGoogleReviews({ accountId: 'acct_1' })
    expect((f.mock.calls[0] as [string])[0]).toContain('/google-business/gmb-reviews?accountId=acct_1')
    expect(nextPageToken).toBe('tok_2')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      id: 'rev_1',
      starRating: 5,
      comment: 'Great visit',
      reviewerName: 'Jane D.',
      reviewerPhotoUrl: 'https://p/jane.png',
      replyComment: 'Thank you!',
    })
  })

  it('tolerates the webhook-style alternate field names (rating/text/reviewer.name/reply.text)', async () => {
    const f = mockFetch({
      reviews: [
        {
          reviewId: 'rev_alt',
          rating: 4,
          text: 'Solid',
          reviewer: { name: 'Bob', profileImage: 'https://p/bob.png' },
          reply: { text: 'Cheers', createdAt: '2026-06-04T00:00:00Z' },
        },
      ],
    })
    vi.stubGlobal('fetch', f)
    const { reviews, nextPageToken } = await listGoogleReviews({ accountId: 'a' })
    expect(nextPageToken).toBeNull()
    expect(reviews[0]).toMatchObject({
      id: 'rev_alt',
      starRating: 4,
      comment: 'Solid',
      reviewerName: 'Bob',
      reviewerPhotoUrl: 'https://p/bob.png',
      replyComment: 'Cheers',
    })
  })

  it('drops reviews with no id (cannot be upserted idempotently) and tolerates missing fields', async () => {
    const f = mockFetch({
      reviews: [
        { starRating: 5, comment: 'no id here' },
        { id: 'ok', starRating: null },
      ],
    })
    vi.stubGlobal('fetch', f)
    const { reviews } = await listGoogleReviews({ accountId: 'a' })
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ id: 'ok', starRating: null, comment: null, replyComment: null })
  })

  it('reads a bare array response with no nextPageToken', async () => {
    const f = mockFetch([{ id: 'x', rating: 'THREE' }])
    vi.stubGlobal('fetch', f)
    const { reviews, nextPageToken } = await listGoogleReviews({ accountId: 'a' })
    expect(nextPageToken).toBeNull()
    expect(reviews[0]).toMatchObject({ id: 'x', starRating: 3 })
  })

  it('passes pageToken + locationId through the query', async () => {
    const f = mockFetch({ reviews: [] })
    vi.stubGlobal('fetch', f)
    await listGoogleReviews({ accountId: 'a', locationId: 'loc_9', pageToken: 'p2' })
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toContain('locationId=loc_9')
    expect(url).toContain('pageToken=p2')
  })

  it('throws status + body on a non-2xx', async () => {
    vi.stubGlobal('fetch', mockFetch('boom', false, 500, 'Server Error'))
    await expect(listGoogleReviews({ accountId: 'a' })).rejects.toThrow(/500 Server Error/)
  })
})

describe('replyToGoogleReview', () => {
  it('POSTs the reply path with accountId + a { comment } body', async () => {
    const f = mockFetch({ ok: true })
    vi.stubGlobal('fetch', f)
    await replyToGoogleReview({ accountId: 'acct_1', reviewId: 'rev_1', comment: 'Thanks!' })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/google-business/gmb-reviews/rev_1/reply?accountId=acct_1')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ comment: 'Thanks!' })
  })

  it('URL-encodes a review id with slashes (Google ids can be path-like)', async () => {
    const f = mockFetch({ ok: true })
    vi.stubGlobal('fetch', f)
    await replyToGoogleReview({ accountId: 'a', reviewId: 'accounts/1/locations/2/reviews/3', comment: 'x' })
    expect((f.mock.calls[0] as [string])[0]).toContain('reviews%2F3/reply')
  })

  it('throws on a non-2xx', async () => {
    vi.stubGlobal('fetch', mockFetch('nope', false, 403, 'Forbidden'))
    await expect(
      replyToGoogleReview({ accountId: 'a', reviewId: 'r', comment: 'x' }),
    ).rejects.toThrow(/403 Forbidden/)
  })
})

describe('deleteGoogleReviewReply', () => {
  it('DELETEs the reply path with accountId', async () => {
    const f = vi.fn(async (..._args: unknown[]) => ({ ok: true, status: 204, statusText: 'No Content', json: async () => ({}), text: async () => '' }))
    vi.stubGlobal('fetch', f)
    await deleteGoogleReviewReply({ accountId: 'acct_1', reviewId: 'rev_1' })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/google-business/gmb-reviews/rev_1/reply?accountId=acct_1')
    expect(init.method).toBe('DELETE')
  })
})
