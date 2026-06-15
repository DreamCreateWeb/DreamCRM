import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Per-platform social analytics service (`getSocialMetrics`):
 *  - reads the connected social accounts off getZernioConnection().accounts;
 *  - NO connected socials → { connected:false, platforms:[] } (no network);
 *  - DEMO connection → seeded synthetic per-platform numbers, NEVER the network;
 *  - REAL connection → live pull per platform, totals pass through, window threaded;
 *  - BEST-EFFORT → a platform's API failure → that platform reads zeros + an
 *    error string, the OTHERS still render (never throws);
 *  - 30/90 window threaded + scales the demo numbers (reach etc., NOT followers).
 * The Zernio client + the connection reader are mocked; no DB is touched.
 */

const client = {
  getSocialPlatformAnalytics: vi.fn(),
}
vi.mock('@/lib/zernio', async () => {
  // Keep the real `socialAnalyticsSupported` (a pure helper the service uses to
  // filter) while mocking the network call.
  const actual = await vi.importActual<typeof import('@/lib/zernio')>('@/lib/zernio')
  return {
    socialAnalyticsSupported: actual.socialAnalyticsSupported,
    getSocialPlatformAnalytics: (...a: unknown[]) => client.getSocialPlatformAnalytics(...a),
  }
})

const conn = {
  value: {
    isDemo: false,
    accounts: [] as Array<{ id: string; platform: string; username: string | null; displayName: string | null }>,
  },
}
vi.mock('@/lib/services/zernio', () => ({
  getZernioConnection: vi.fn(async () => conn.value),
}))

import { getSocialMetrics, seedDemoSocialMetrics } from '@/lib/services/social-metrics'

function acct(platform: string, id: string, username: string | null = `@${platform}`) {
  return { id, platform, username, displayName: 'Dream Dental' }
}

beforeEach(() => {
  client.getSocialPlatformAnalytics.mockReset()
  conn.value = { isDemo: false, accounts: [] }
})

describe('getSocialMetrics — no connected socials', () => {
  it('returns connected:false + empty platforms (no network) when nothing social is connected', async () => {
    conn.value = { isDemo: false, accounts: [acct('googlebusiness', 'gbp_1')] } // GBP doesn't count
    const m = await getSocialMetrics('org_1', { days: 30 })
    expect(m.connected).toBe(false)
    expect(m.platforms).toEqual([])
    expect(m.windowDays).toBe(30)
    expect(client.getSocialPlatformAnalytics).not.toHaveBeenCalled()
  })
})

describe('getSocialMetrics — demo connection', () => {
  it('returns seeded synthetic per-platform numbers + NEVER touches the network', async () => {
    conn.value = { isDemo: true, accounts: [acct('instagram', 'ig'), acct('facebook', 'fb')] }
    const m = await getSocialMetrics('org_demo', { days: 30 })
    expect(m.connected).toBe(true)
    expect(m.isDemo).toBe(true)
    expect(m.platforms).toHaveLength(2)
    const ig = m.platforms.find((p) => p.platform === 'instagram')!
    expect(ig.label).toBe('Instagram')
    expect(ig.followers).toBeGreaterThan(0)
    expect(ig.reach).toBeGreaterThan(0)
    expect(ig.engagement).toBeGreaterThan(0)
    expect(ig.handle).toBe('@instagram')
    expect(client.getSocialPlatformAnalytics).not.toHaveBeenCalled()
  })

  it('scales the window-based demo numbers (90d ≈ 3× 30d) but NOT followers', async () => {
    conn.value = { isDemo: true, accounts: [acct('instagram', 'ig')] }
    const m30 = await getSocialMetrics('o', { days: 30 })
    const m90 = await getSocialMetrics('o', { days: 90 })
    const ig30 = m30.platforms[0]
    const ig90 = m90.platforms[0]
    expect(ig90.reach).toBe(ig30.reach * 3)
    expect(ig90.impressions).toBe(ig30.impressions * 3)
    // Followers is a point-in-time count — unchanged by the window.
    expect(ig90.followers).toBe(ig30.followers)
  })
})

describe('getSocialMetrics — real connection', () => {
  it('pulls each connected social platform, passing the live totals + window through', async () => {
    conn.value = { isDemo: false, accounts: [acct('instagram', 'ig_acct'), acct('facebook', 'fb_acct')] }
    client.getSocialPlatformAnalytics.mockImplementation(async (platform: string) => ({
      followers: platform === 'instagram' ? 1840 : 2310,
      reach: 6200,
      impressions: 9800,
      engagement: 540,
      profileViews: 410,
      posts: 12,
    }))
    const m = await getSocialMetrics('org_1', { days: 90 })
    expect(m.connected).toBe(true)
    expect(m.isDemo).toBe(false)
    expect(m.windowDays).toBe(90)
    expect(m.platforms).toHaveLength(2)
    expect(m.platforms.find((p) => p.platform === 'instagram')!.followers).toBe(1840)
    expect(m.platforms.find((p) => p.platform === 'facebook')!.followers).toBe(2310)
    // The window threads into every client call as { days: 90 }.
    expect(client.getSocialPlatformAnalytics).toHaveBeenCalledWith('instagram', 'ig_acct', { days: 90 })
    expect(client.getSocialPlatformAnalytics).toHaveBeenCalledWith('facebook', 'fb_acct', { days: 90 })
  })

  it('best-effort: one platform failing records its error + zeros; the others still render', async () => {
    conn.value = { isDemo: false, accounts: [acct('instagram', 'ig'), acct('facebook', 'fb')] }
    client.getSocialPlatformAnalytics.mockImplementation(async (platform: string) => {
      if (platform === 'facebook') throw new Error('Zernio API 402 Payment Required')
      return { followers: 100, reach: 200, impressions: 300, engagement: 40, profileViews: 50, posts: 5 }
    })
    const m = await getSocialMetrics('org_1', { days: 30 })
    const ig = m.platforms.find((p) => p.platform === 'instagram')!
    const fb = m.platforms.find((p) => p.platform === 'facebook')!
    expect(ig.followers).toBe(100) // survived
    expect(ig.error).toBeUndefined()
    expect(fb.followers).toBe(0) // zeroed
    expect(fb.reach).toBe(0)
    expect(fb.error).toMatch(/402/)
  })

  it('ignores non-shortlisted platforms (e.g. threads) — no endpoint, never pulled', async () => {
    conn.value = { isDemo: false, accounts: [acct('instagram', 'ig'), acct('threads', 'th')] }
    client.getSocialPlatformAnalytics.mockResolvedValue({ followers: 1, reach: 1, impressions: 1, engagement: 1, profileViews: 1, posts: 1 })
    const m = await getSocialMetrics('org_1', { days: 30 })
    expect(m.platforms.map((p) => p.platform)).toEqual(['instagram'])
    expect(client.getSocialPlatformAnalytics).toHaveBeenCalledTimes(1)
  })

  it('defaults the window to 30 when unspecified', async () => {
    conn.value = { isDemo: false, accounts: [acct('instagram', 'ig')] }
    client.getSocialPlatformAnalytics.mockResolvedValue({ followers: 0, reach: 0, impressions: 0, engagement: 0, profileViews: 0, posts: 0 })
    const m = await getSocialMetrics('org_1', {})
    expect(m.windowDays).toBe(30)
    expect(client.getSocialPlatformAnalytics).toHaveBeenCalledWith('instagram', 'ig', { days: 30 })
  })
})

describe('seedDemoSocialMetrics', () => {
  it('is a no-op (no DB / network) — the metrics are a live compute off the isDemo connection', async () => {
    await expect(seedDemoSocialMetrics('org_demo')).resolves.toBeUndefined()
    expect(client.getSocialPlatformAnalytics).not.toHaveBeenCalled()
  })
})
