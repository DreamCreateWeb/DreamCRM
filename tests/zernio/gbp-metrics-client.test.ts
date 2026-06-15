import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getGoogleBusinessPerformance,
  getGoogleBusinessSearchKeywords,
  GBP_PERFORMANCE_METRICS,
} from '@/lib/zernio'

/**
 * Zernio GBP analytics client wrappers — the performance + search-keywords
 * fetchers. We mock the fetch boundary so the real client runs (URL/params,
 * defensive parsing, daily-series summing, missing-key→0, auth/error) without a
 * live Zernio. Confirmed REST shapes (docs.zernio.com llms-full.txt, 2026-06-15):
 *   GET /v1/analytics/googlebusiness/performance?accountId=…&startDate=…&endDate=…
 *     → { metrics: { <KEY>: { total, values:[…] } } }
 *   GET /v1/analytics/googlebusiness/search-keywords?accountId=…&startMonth=…&endMonth=…
 *     → { keywords: [{ keyword, impressions }] }
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

describe('getGoogleBusinessPerformance', () => {
  it('GETs the performance path with accountId + date range + metrics CSV and reads each metric total', async () => {
    const f = mockFetch({
      success: true,
      metrics: {
        BUSINESS_IMPRESSIONS_DESKTOP_MAPS: { total: 1000, values: [] },
        BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: { total: 500, values: [] },
        BUSINESS_IMPRESSIONS_MOBILE_MAPS: { total: 2000, values: [] },
        BUSINESS_IMPRESSIONS_MOBILE_SEARCH: { total: 700, values: [] },
        CALL_CLICKS: { total: 42, values: [] },
        WEBSITE_CLICKS: { total: 96, values: [] },
        BUSINESS_DIRECTION_REQUESTS: { total: 53, values: [] },
        BUSINESS_BOOKINGS: { total: 11, values: [] },
        BUSINESS_CONVERSATIONS: { total: 4, values: [] },
      },
    })
    vi.stubGlobal('fetch', f)
    const perf = await getGoogleBusinessPerformance('acct_1', { startDate: '2026-05-01', endDate: '2026-05-31' })
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toContain('/analytics/googlebusiness/performance?accountId=acct_1')
    expect(url).toContain('startDate=2026-05-01')
    expect(url).toContain('endDate=2026-05-31')
    // metrics CSV is sent (encoded commas → %2C)
    expect(decodeURIComponent(url)).toContain(`metrics=${GBP_PERFORMANCE_METRICS.join(',')}`)
    // Impressions fold the four sub-series: 1000+500+2000+700 = 4200.
    expect(perf.impressions).toBe(4200)
    expect(perf.calls).toBe(42)
    expect(perf.websiteClicks).toBe(96)
    expect(perf.directions).toBe(53)
    expect(perf.bookings).toBe(11)
    expect(perf.conversations).toBe(4)
  })

  it('computes the date range from { days } when no explicit dates are given', async () => {
    const f = mockFetch({ metrics: {} })
    vi.stubGlobal('fetch', f)
    await getGoogleBusinessPerformance('a', { days: 30 })
    const url = (f.mock.calls[0] as [string])[0]
    // Both date params present + YYYY-MM-DD shaped.
    expect(url).toMatch(/startDate=\d{4}-\d{2}-\d{2}/)
    expect(url).toMatch(/endDate=\d{4}-\d{2}-\d{2}/)
  })

  it('sums the daily values series when a metric has no pre-summed total', async () => {
    const f = mockFetch({
      metrics: {
        // No `total` → fall back to summing `values` (objects with {date,value}).
        CALL_CLICKS: { values: [{ date: '2026-05-01', value: 3 }, { date: '2026-05-02', value: 4 }, { date: '2026-05-03', value: 5 }] },
        // Bare-number values are also tolerated.
        WEBSITE_CLICKS: { values: [10, 20, 30] },
      },
    })
    vi.stubGlobal('fetch', f)
    const perf = await getGoogleBusinessPerformance('a', { days: 30 })
    expect(perf.calls).toBe(12) // 3+4+5
    expect(perf.websiteClicks).toBe(60) // 10+20+30
  })

  it('tolerates missing metric keys → 0 and reaches through a { data: { metrics } } wrapper', async () => {
    const f = mockFetch({ data: { metrics: { CALL_CLICKS: { total: 7 } } } })
    vi.stubGlobal('fetch', f)
    const perf = await getGoogleBusinessPerformance('a', { days: 30 })
    expect(perf.calls).toBe(7)
    // Every other metric absent → 0 (no throw).
    expect(perf.impressions).toBe(0)
    expect(perf.websiteClicks).toBe(0)
    expect(perf.directions).toBe(0)
    expect(perf.bookings).toBe(0)
  })

  it('coerces numeric-string totals + ignores negative/garbage values', async () => {
    const f = mockFetch({
      metrics: {
        WEBSITE_CLICKS: { total: '15' },
        CALL_CLICKS: { total: -3 }, // negative → unreadable → 0
        BUSINESS_BOOKINGS: { total: 'abc' }, // garbage → 0
      },
    })
    vi.stubGlobal('fetch', f)
    const perf = await getGoogleBusinessPerformance('a', { days: 30 })
    expect(perf.websiteClicks).toBe(15)
    expect(perf.calls).toBe(0)
    expect(perf.bookings).toBe(0)
  })

  it('returns all-zeros when metrics is absent entirely', async () => {
    const f = mockFetch({ success: true })
    vi.stubGlobal('fetch', f)
    const perf = await getGoogleBusinessPerformance('a', { days: 30 })
    expect(perf).toEqual({ impressions: 0, calls: 0, directions: 0, websiteClicks: 0, bookings: 0, conversations: 0 })
  })

  it('throws status + body on a non-2xx (e.g. 402 analytics add-on required)', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Analytics add-on required' }, false, 402, 'Payment Required'))
    await expect(getGoogleBusinessPerformance('a', { days: 30 })).rejects.toThrow(/402 Payment Required/)
  })
})

describe('getGoogleBusinessSearchKeywords', () => {
  it('GETs the search-keywords path with accountId + month range and normalizes { keyword, impressions }', async () => {
    const f = mockFetch({
      success: true,
      keywords: [
        { keyword: 'dentist near me', impressions: 612 },
        { keyword: 'teeth whitening austin', impressions: 274 },
      ],
    })
    vi.stubGlobal('fetch', f)
    const kw = await getGoogleBusinessSearchKeywords('acct_1', { startMonth: '2026-04', endMonth: '2026-05' })
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toContain('/analytics/googlebusiness/search-keywords?accountId=acct_1')
    expect(url).toContain('startMonth=2026-04')
    expect(url).toContain('endMonth=2026-05')
    expect(kw).toEqual([
      { term: 'dentist near me', count: 612 },
      { term: 'teeth whitening austin', count: 274 },
    ])
  })

  it('maps a { days } window to a month span', async () => {
    const f = mockFetch({ keywords: [] })
    vi.stubGlobal('fetch', f)
    await getGoogleBusinessSearchKeywords('a', { days: 90 })
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toMatch(/startMonth=\d{4}-\d{2}/)
    expect(url).toMatch(/endMonth=\d{4}-\d{2}/)
  })

  it('merges a term that appears in multiple monthly buckets (sums impressions) and sorts desc', async () => {
    const f = mockFetch({
      keywords: [
        { keyword: 'dentist near me', impressions: 100 }, // April
        { keyword: 'invisalign', impressions: 30 },
        { keyword: 'dentist near me', impressions: 150 }, // May — same term
      ],
    })
    vi.stubGlobal('fetch', f)
    const kw = await getGoogleBusinessSearchKeywords('a', { days: 60 })
    expect(kw[0]).toEqual({ term: 'dentist near me', count: 250 }) // merged + first (sorted)
    expect(kw[1]).toEqual({ term: 'invisalign', count: 30 })
  })

  it('caps the list at `limit`, tolerates alias fields + a { data: { keywords } } wrapper, drops empty terms', async () => {
    const f = mockFetch({
      data: {
        keywords: [
          { searchKeyword: 'a', impressionsValue: 50 }, // alias names
          { keyword: '', impressions: 999 }, // empty term → dropped
          { keyword: 'b', value: 40 },
          { keyword: 'c', impressions: 30 },
        ],
      },
    })
    vi.stubGlobal('fetch', f)
    const kw = await getGoogleBusinessSearchKeywords('a', { days: 30 }, 2)
    expect(kw).toHaveLength(2) // capped
    expect(kw.map((k) => k.term)).toEqual(['a', 'b']) // empty dropped, sorted by count
  })

  it('throws on a non-2xx', async () => {
    vi.stubGlobal('fetch', mockFetch('nope', false, 401, 'Unauthorized'))
    await expect(getGoogleBusinessSearchKeywords('a', { days: 30 })).rejects.toThrow(/401 Unauthorized/)
  })
})
