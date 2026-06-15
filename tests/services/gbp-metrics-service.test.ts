import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Google Business local-metrics service (`getGbpLocalMetrics`):
 *  - resolves the org's GBP account via the shared resolver;
 *  - REAL connection → live pull, totals pass through, window threaded;
 *  - DEMO connection → seeded synthetic metrics, NEVER the network;
 *  - NO connection → { connected:false, …zeros };
 *  - BEST-EFFORT → an API failure returns zeros + an error string (never throws);
 *  - keyword pull failure doesn't zero the performance KPIs.
 * The Zernio client + the connection resolver are mocked; no DB is touched.
 */

// ── Zernio analytics client mock ──────────────────────────────────────────────
const client = {
  getGoogleBusinessPerformance: vi.fn(),
  getGoogleBusinessSearchKeywords: vi.fn(),
}
vi.mock('@/lib/zernio', () => ({
  getGoogleBusinessPerformance: (...a: unknown[]) => client.getGoogleBusinessPerformance(...a),
  getGoogleBusinessSearchKeywords: (...a: unknown[]) => client.getGoogleBusinessSearchKeywords(...a),
}))

// ── Connection resolver mock ──────────────────────────────────────────────────
const account = { value: null as null | { accountId: string; isDemo: boolean } }
vi.mock('@/lib/services/zernio', () => ({
  resolveGbpAccount: vi.fn(async () => account.value),
}))

import { getGbpLocalMetrics, seedDemoGbpMetrics } from '@/lib/services/gbp-metrics'

beforeEach(() => {
  client.getGoogleBusinessPerformance.mockReset()
  client.getGoogleBusinessSearchKeywords.mockReset()
  account.value = null
})

describe('getGbpLocalMetrics — no connection', () => {
  it('returns connected:false + all zeros when no GBP is linked (no network)', async () => {
    account.value = null
    const m = await getGbpLocalMetrics('org_1', { days: 30 })
    expect(m).toEqual({
      connected: false,
      impressions: 0,
      calls: 0,
      directions: 0,
      websiteClicks: 0,
      bookings: 0,
      topKeywords: [],
      windowDays: 30,
    })
    expect(client.getGoogleBusinessPerformance).not.toHaveBeenCalled()
    expect(client.getGoogleBusinessSearchKeywords).not.toHaveBeenCalled()
  })
})

describe('getGbpLocalMetrics — demo connection', () => {
  it('returns seeded synthetic metrics + NEVER touches the network', async () => {
    account.value = { accountId: 'demo_gbp_dream_dental', isDemo: true }
    const m = await getGbpLocalMetrics('org_demo', { days: 30 })
    expect(m.connected).toBe(true)
    expect(m.windowDays).toBe(30)
    // Synthetic — realistic for a single practice: a few thousand impressions,
    // dozens of calls/directions, a handful of bookings, dental top keywords.
    expect(m.impressions).toBeGreaterThan(1000)
    expect(m.calls).toBeGreaterThan(0)
    expect(m.directions).toBeGreaterThan(0)
    expect(m.bookings).toBeGreaterThan(0)
    expect(m.topKeywords.length).toBeGreaterThanOrEqual(5)
    expect(m.topKeywords[0].term.toLowerCase()).toContain('dentist')
    // No client call at all for the demo.
    expect(client.getGoogleBusinessPerformance).not.toHaveBeenCalled()
    expect(client.getGoogleBusinessSearchKeywords).not.toHaveBeenCalled()
  })

  it('scales the demo numbers with the window (90d ≈ 3× 30d)', async () => {
    account.value = { accountId: 'demo', isDemo: true }
    const m30 = await getGbpLocalMetrics('o', { days: 30 })
    const m90 = await getGbpLocalMetrics('o', { days: 90 })
    expect(m90.windowDays).toBe(90)
    expect(m90.impressions).toBe(m30.impressions * 3)
    expect(m90.calls).toBe(m30.calls * 3)
  })
})

describe('getGbpLocalMetrics — real connection', () => {
  it('passes through the live performance totals + capped top keywords, honoring the window', async () => {
    account.value = { accountId: 'acct_real', isDemo: false }
    client.getGoogleBusinessPerformance.mockResolvedValue({
      impressions: 4200, calls: 42, directions: 53, websiteClicks: 96, bookings: 11, conversations: 4,
    })
    client.getGoogleBusinessSearchKeywords.mockResolvedValue([
      { term: 'dentist near me', count: 612 },
      { term: 'dream dental', count: 388 },
    ])
    const m = await getGbpLocalMetrics('org_1', { days: 90 })
    expect(m).toEqual({
      connected: true,
      impressions: 4200,
      calls: 42,
      directions: 53,
      websiteClicks: 96,
      bookings: 11,
      topKeywords: [
        { term: 'dentist near me', count: 612 },
        { term: 'dream dental', count: 388 },
      ],
      windowDays: 90,
    })
    // The window is threaded into BOTH client calls as { days: 90 }.
    expect(client.getGoogleBusinessPerformance).toHaveBeenCalledWith('acct_real', { days: 90 })
    expect(client.getGoogleBusinessSearchKeywords).toHaveBeenCalledWith('acct_real', { days: 90 }, expect.any(Number))
  })

  it('best-effort: a performance pull failure returns zeros + an error (never throws)', async () => {
    account.value = { accountId: 'acct_real', isDemo: false }
    client.getGoogleBusinessPerformance.mockRejectedValue(new Error('Zernio API 402 Payment Required'))
    client.getGoogleBusinessSearchKeywords.mockResolvedValue([])
    const m = await getGbpLocalMetrics('org_1', { days: 30 })
    expect(m.connected).toBe(true) // the GBP IS connected
    expect(m.impressions).toBe(0)
    expect(m.calls).toBe(0)
    expect(m.bookings).toBe(0)
    expect(m.topKeywords).toEqual([])
    expect(m.error).toMatch(/402/)
  })

  it('a keyword pull failure does NOT zero out the performance KPIs', async () => {
    account.value = { accountId: 'acct_real', isDemo: false }
    client.getGoogleBusinessPerformance.mockResolvedValue({
      impressions: 1000, calls: 10, directions: 12, websiteClicks: 20, bookings: 3, conversations: 1,
    })
    client.getGoogleBusinessSearchKeywords.mockRejectedValue(new Error('keywords boom'))
    const m = await getGbpLocalMetrics('org_1', { days: 30 })
    expect(m.connected).toBe(true)
    expect(m.impressions).toBe(1000) // performance survived
    expect(m.calls).toBe(10)
    expect(m.topKeywords).toEqual([]) // keywords degraded gracefully
    expect(m.error).toBeUndefined() // performance succeeded → no error
  })

  it('defaults the window to 30 days when unspecified or invalid', async () => {
    account.value = { accountId: 'a', isDemo: false }
    client.getGoogleBusinessPerformance.mockResolvedValue({ impressions: 0, calls: 0, directions: 0, websiteClicks: 0, bookings: 0, conversations: 0 })
    client.getGoogleBusinessSearchKeywords.mockResolvedValue([])
    const m = await getGbpLocalMetrics('org_1', {})
    expect(m.windowDays).toBe(30)
    expect(client.getGoogleBusinessPerformance).toHaveBeenCalledWith('a', { days: 30 })
  })
})

describe('seedDemoGbpMetrics', () => {
  it('is a no-op (no DB / network) — the metrics are a live compute off the isDemo connection', async () => {
    // Should resolve without touching the mocked client or throwing.
    await expect(seedDemoGbpMetrics('org_demo')).resolves.toBeUndefined()
    expect(client.getGoogleBusinessPerformance).not.toHaveBeenCalled()
  })
})
