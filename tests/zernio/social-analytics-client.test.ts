import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getSocialPlatformAnalytics,
  socialAnalyticsSupported,
  listFacebookReviews,
  normalizeRecommendation,
} from '@/lib/zernio'

/**
 * Phase 3 PR 4 client wrappers — per-platform social analytics
 * (`getSocialPlatformAnalytics`) + Facebook reviews (`listFacebookReviews`) +
 * the FB recommendation normalizer. The fetch boundary is mocked so the real
 * client (URL building, defensive parsing) is exercised without a live Zernio.
 */

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

describe('socialAnalyticsSupported', () => {
  it('is true for the shortlisted social platforms, false otherwise', () => {
    for (const p of ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']) {
      expect(socialAnalyticsSupported(p)).toBe(true)
    }
    expect(socialAnalyticsSupported('googlebusiness')).toBe(false)
    expect(socialAnalyticsSupported('threads')).toBe(false)
  })
})

describe('getSocialPlatformAnalytics', () => {
  it('GETs the per-platform endpoint with accountId + since/until and reads totals', async () => {
    const f = mockFetch({
      success: true,
      platform: 'instagram',
      metrics: {
        followers: { total: 1840 },
        reach: { total: 6200 },
        impressions: { total: 9800 },
        engagement: { total: 540 },
        profile_views: { total: 410 },
        posts: { total: 12 },
      },
    })
    vi.stubGlobal('fetch', f)
    const m = await getSocialPlatformAnalytics('instagram', 'acct_ig', { days: 30 })
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toContain('/analytics/instagram/account-insights?')
    expect(url).toContain('accountId=acct_ig')
    expect(url).toContain('since=')
    expect(url).toContain('until=')
    expect(m).toEqual({
      followers: 1840,
      reach: 6200,
      impressions: 9800,
      engagement: 540,
      profileViews: 410,
      posts: 12,
    })
  })

  it('uses the right path per platform (facebook → page-insights, youtube → channel-insights)', async () => {
    const f = mockFetch({ metrics: {} })
    vi.stubGlobal('fetch', f)
    await getSocialPlatformAnalytics('facebook', 'fb', { days: 30 })
    await getSocialPlatformAnalytics('youtube', 'yt', { days: 30 })
    await getSocialPlatformAnalytics('linkedin', 'li', { days: 30 })
    expect((f.mock.calls[0] as [string])[0]).toContain('/analytics/facebook/page-insights')
    expect((f.mock.calls[1] as [string])[0]).toContain('/analytics/youtube/channel-insights')
    expect((f.mock.calls[2] as [string])[0]).toContain('/analytics/linkedin/aggregate-analytics')
  })

  it('sums the daily values series when a metric has no pre-summed total', async () => {
    const f = mockFetch({
      metrics: {
        reach: { values: [{ date: '2026-06-01', value: 100 }, { date: '2026-06-02', value: 250 }, 50] },
        impressions: { values: ['10', '20'] },
      },
    })
    vi.stubGlobal('fetch', f)
    const m = await getSocialPlatformAnalytics('tiktok', 'tt', { days: 30 })
    expect(m.reach).toBe(400) // 100 + 250 + 50
    expect(m.impressions).toBe(30) // numeric strings tolerated
  })

  it('takes the LATEST daily point for followers (cumulative, not summed)', async () => {
    const f = mockFetch({
      metrics: { followers: { values: [{ date: '2026-06-01', value: 1000 }, { date: '2026-06-02', value: 1050 }] } },
    })
    vi.stubGlobal('fetch', f)
    const m = await getSocialPlatformAnalytics('instagram', 'ig', { days: 30 })
    expect(m.followers).toBe(1050) // last point, not 2050
  })

  it('tolerates alias metric keys (fans/page_impressions/total_interactions) and a {data} wrapper', async () => {
    const f = mockFetch({
      data: {
        metrics: {
          page_fans: { total: 2310 },
          page_impressions: { total: 7400 },
          total_interactions: { total: 380 },
        },
      },
    })
    vi.stubGlobal('fetch', f)
    const m = await getSocialPlatformAnalytics('facebook', 'fb', { days: 30 })
    expect(m.followers).toBe(2310)
    expect(m.impressions).toBe(7400)
    expect(m.engagement).toBe(380)
  })

  it('reads 0 for missing metric keys (degrades a single figure, never throws)', async () => {
    const f = mockFetch({ metrics: { followers: { total: 100 } } })
    vi.stubGlobal('fetch', f)
    const m = await getSocialPlatformAnalytics('instagram', 'ig', { days: 30 })
    expect(m).toEqual({ followers: 100, reach: 0, impressions: 0, engagement: 0, profileViews: 0, posts: 0 })
  })

  it('throws synchronously for an unsupported platform', async () => {
    await expect(getSocialPlatformAnalytics('threads', 'x', { days: 30 })).rejects.toThrow(/No analytics endpoint/)
  })

  it('throws status+body on a non-2xx (e.g. 402 Analytics add-on) so the service can catch', async () => {
    vi.stubGlobal('fetch', mockFetch('Analytics add-on required', false, 402, 'Payment Required'))
    await expect(getSocialPlatformAnalytics('instagram', 'ig', { days: 30 })).rejects.toThrow(/402/)
  })
})

describe('normalizeRecommendation', () => {
  it('maps FB Graph positive/negative + recommended/not_recommended + booleans', () => {
    expect(normalizeRecommendation('positive')).toBe('recommended')
    expect(normalizeRecommendation('recommended')).toBe('recommended')
    expect(normalizeRecommendation(true)).toBe('recommended')
    expect(normalizeRecommendation('negative')).toBe('not_recommended')
    expect(normalizeRecommendation('not_recommended')).toBe('not_recommended')
    expect(normalizeRecommendation(false)).toBe('not_recommended')
  })
  it('returns null for unreadable/nullish', () => {
    expect(normalizeRecommendation('maybe')).toBeNull()
    expect(normalizeRecommendation('')).toBeNull()
    expect(normalizeRecommendation(null)).toBeNull()
    expect(normalizeRecommendation(undefined)).toBeNull()
  })
})

describe('listFacebookReviews', () => {
  it('GETs the unified reviews surface with platform=facebook + accountId and normalizes a recommendation', async () => {
    const f = mockFetch({
      reviews: [
        {
          id: 'fb_1',
          recommendationType: 'positive',
          comment: 'Lovely team',
          createTime: '2026-06-01T00:00:00Z',
          reviewer: { name: 'Pat L.', picture: 'https://p/pat.png' },
          permalink: 'https://facebook.com/r/fb_1',
        },
      ],
      nextPageToken: 'tok_2',
    })
    vi.stubGlobal('fetch', f)
    const { reviews, nextPageToken } = await listFacebookReviews({ accountId: 'fb_acct' })
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toContain('/comments/reviews?')
    expect(url).toContain('platform=facebook')
    expect(url).toContain('accountId=fb_acct')
    expect(nextPageToken).toBe('tok_2')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      id: 'fb_1',
      recommendationType: 'recommended',
      starRating: null, // FB recommendations have NO star value
      comment: 'Lovely team',
      reviewerName: 'Pat L.',
      reviewerPhotoUrl: 'https://p/pat.png',
      permalink: 'https://facebook.com/r/fb_1',
    })
  })

  it('does not let a legacy FB star coexist with a recommendation (keeps starRating null)', async () => {
    const f = mockFetch({
      reviews: [{ id: 'fb_2', rating: 5, recommendation: 'positive', text: 'Great' }],
    })
    vi.stubGlobal('fetch', f)
    const { reviews } = await listFacebookReviews({ accountId: 'a' })
    expect(reviews[0].recommendationType).toBe('recommended')
    expect(reviews[0].starRating).toBeNull()
  })

  it('keeps a legacy FB star rating when there is NO recommendation flag', async () => {
    const f = mockFetch({ reviews: [{ id: 'fb_3', rating: 4, text: 'Older page rating' }] })
    vi.stubGlobal('fetch', f)
    const { reviews } = await listFacebookReviews({ accountId: 'a' })
    expect(reviews[0].recommendationType).toBeNull()
    expect(reviews[0].starRating).toBe(4)
  })

  it('tolerates alternate list keys (recommendations / data / bare array) + paging.cursors.after', async () => {
    vi.stubGlobal('fetch', mockFetch({ recommendations: [{ id: 'fb_a', recommendationType: 'negative' }], paging: { cursors: { after: 'cur_2' } } }))
    let res = await listFacebookReviews({ accountId: 'a' })
    expect(res.reviews[0].recommendationType).toBe('not_recommended')
    expect(res.nextPageToken).toBe('cur_2')

    vi.stubGlobal('fetch', mockFetch([{ id: 'fb_b', recommendation: true }]))
    res = await listFacebookReviews({ accountId: 'a' })
    expect(res.reviews[0].recommendationType).toBe('recommended')
    expect(res.nextPageToken).toBeNull()
  })

  it('drops reviews with no id (cannot be upserted idempotently)', async () => {
    vi.stubGlobal('fetch', mockFetch({ reviews: [{ recommendationType: 'positive' }, { id: 'ok', recommendationType: 'positive' }] }))
    const { reviews } = await listFacebookReviews({ accountId: 'a' })
    expect(reviews).toHaveLength(1)
    expect(reviews[0].id).toBe('ok')
  })
})
