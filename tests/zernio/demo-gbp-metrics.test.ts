import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Demo GBP local metrics — the no-fake-content guarantee for the metrics
 * surface. There is NO metrics table: the SEO GBP card + the Analytics
 * "Google Business — local actions" tile read a live compute (`demoMetrics`)
 * whenever the org's Zernio connection is `isDemo`. This proves the demo path
 * populates EVERY KPI the UI renders + the dental top-keyword requirement, is
 * idempotent, and never networks.
 *
 * The connection prerequisite (the isDemo Zernio row) is seeded by
 * `seedDemoZernio`, which carries its own real-patient guard (tested in
 * tests/zernio/service + the demo seeder suite); here we mock the resolver to a
 * demo account and assert the metrics shape the seeder's call site documents.
 */

const client = {
  getGoogleBusinessPerformance: vi.fn(),
  getGoogleBusinessSearchKeywords: vi.fn(),
}
vi.mock('@/lib/zernio', () => ({
  getGoogleBusinessPerformance: (...a: unknown[]) => client.getGoogleBusinessPerformance(...a),
  getGoogleBusinessSearchKeywords: (...a: unknown[]) => client.getGoogleBusinessSearchKeywords(...a),
}))

const account = { value: null as null | { accountId: string; isDemo: boolean } }
vi.mock('@/lib/services/zernio', () => ({
  resolveGbpAccount: vi.fn(async () => account.value),
}))

import { getGbpLocalMetrics, seedDemoGbpMetrics } from '@/lib/services/gbp-metrics'

beforeEach(() => {
  client.getGoogleBusinessPerformance.mockReset()
  client.getGoogleBusinessSearchKeywords.mockReset()
  account.value = { accountId: 'demo_gbp_dream_dental', isDemo: true }
})

describe('demo GBP metrics — field coverage', () => {
  it('populates every KPI the SEO card + Analytics tile render (no zeros, no network)', async () => {
    const m = await getGbpLocalMetrics('org_demo', { days: 30 })
    expect(m.connected).toBe(true)
    // Every KPI surfaced anywhere in the UI is a realistic non-zero number.
    expect(m.impressions).toBeGreaterThan(0)
    expect(m.calls).toBeGreaterThan(0)
    expect(m.directions).toBeGreaterThan(0)
    expect(m.websiteClicks).toBeGreaterThan(0)
    expect(m.bookings).toBeGreaterThan(0)
    // Realistic single-practice magnitudes (per the brief: a few thousand
    // impressions / 30d, dozens of calls+directions, a handful of bookings).
    expect(m.impressions).toBeGreaterThan(1000)
    expect(m.impressions).toBeLessThan(20000)
    expect(m.calls).toBeLessThan(500)
    expect(m.directions).toBeLessThan(500)
    expect(m.bookings).toBeLessThan(100)
    // 5–8 dental top keywords, impression-sorted, with the canonical "near me".
    expect(m.topKeywords.length).toBeGreaterThanOrEqual(5)
    expect(m.topKeywords.length).toBeLessThanOrEqual(8)
    expect(m.topKeywords.some((k) => k.term.toLowerCase().includes('dentist'))).toBe(true)
    expect(m.topKeywords.some((k) => /whitening/i.test(k.term))).toBe(true)
    for (let i = 1; i < m.topKeywords.length; i++) {
      expect(m.topKeywords[i - 1].count).toBeGreaterThanOrEqual(m.topKeywords[i].count)
    }
    // No network at all for the demo.
    expect(client.getGoogleBusinessPerformance).not.toHaveBeenCalled()
    expect(client.getGoogleBusinessSearchKeywords).not.toHaveBeenCalled()
  })

  it('is idempotent across the 30/90 toggle — same call, same shape, scaled', async () => {
    const a = await getGbpLocalMetrics('org_demo', { days: 30 })
    const b = await getGbpLocalMetrics('org_demo', { days: 30 })
    expect(b).toEqual(a) // deterministic, repeatable
    const c = await getGbpLocalMetrics('org_demo', { days: 90 })
    expect(c.windowDays).toBe(90)
    expect(c.bookings).toBe(a.bookings * 3)
  })
})

describe('seedDemoGbpMetrics — documented no-op hook', () => {
  it('resolves without DB / network (the metrics are computed from the isDemo connection)', async () => {
    await expect(seedDemoGbpMetrics('org_demo')).resolves.toBeUndefined()
    expect(client.getGoogleBusinessPerformance).not.toHaveBeenCalled()
  })
})
