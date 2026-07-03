import { describe, it, expect } from 'vitest'

/**
 * Deterministic opportunity scoring — the ranking contract: no website is
 * always hot, bad websites are warm+, dialed-in practices are low, and the
 * heuristic fallback verdict keeps ranking honest when AI is unavailable.
 */

import { computeOpportunityScore, bandForScore, heuristicVerdict } from '@/lib/prospect-scoring'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'

const GOOD_SITE: ProspectAiVerdict = {
  hasWebsite: true,
  websiteQuality: 85,
  websiteReasons: [],
  socialPresence: 70,
  onlineBooking: true,
  weaknesses: [],
  summary: 'Modern, well-maintained site.',
}

describe('computeOpportunityScore', () => {
  it('no website = hot, always ≥ 90', () => {
    const r = computeOpportunityScore({
      verdict: { ...GOOD_SITE, hasWebsite: false, websiteQuality: 0 },
      reviewCount: 8,
      ratingTenths: null,
    })
    expect(r.score).toBeGreaterThanOrEqual(90)
    expect(r.band).toBe('hot')
    expect(r.reasons[0]).toContain('No website')
  })

  it('bad website lands warm-to-hot (65–89), never beats no-website', () => {
    const bad = computeOpportunityScore({
      verdict: {
        ...GOOD_SITE,
        websiteQuality: 20,
        websiteReasons: ['Not mobile-friendly', 'Footer says 2019'],
        onlineBooking: false,
        socialPresence: 0,
      },
      reviewCount: 40,
      ratingTenths: 45,
    })
    expect(bad.score).toBeGreaterThanOrEqual(65)
    expect(bad.score).toBeLessThanOrEqual(89)
    const none = computeOpportunityScore({
      verdict: { ...GOOD_SITE, hasWebsite: false, websiteQuality: 0 },
      reviewCount: 40,
      ratingTenths: 45,
    })
    expect(none.score).toBeGreaterThan(bad.score)
  })

  it('decent site with gaps stacks booking/social/review bonuses into cool-warm', () => {
    const r = computeOpportunityScore({
      verdict: { ...GOOD_SITE, websiteQuality: 55, onlineBooking: false, socialPresence: 10 },
      reviewCount: 12,
      ratingTenths: 48,
    })
    expect(r.band === 'warm' || r.band === 'cool').toBe(true)
    expect(r.reasons).toContain('No online booking')
    expect(r.reasons).toContain('Social media unmanaged')
  })

  it('a dialed-in practice scores low', () => {
    const r = computeOpportunityScore({ verdict: GOOD_SITE, reviewCount: 320, ratingTenths: 49 })
    expect(r.band).toBe('low')
    expect(r.score).toBeLessThan(40)
  })

  it('bands split at 80/60/40', () => {
    expect(bandForScore(80)).toBe('hot')
    expect(bandForScore(79)).toBe('warm')
    expect(bandForScore(60)).toBe('warm')
    expect(bandForScore(59)).toBe('cool')
    expect(bandForScore(40)).toBe('cool')
    expect(bandForScore(39)).toBe('low')
  })
})

describe('heuristicVerdict (AI-unavailable fallback)', () => {
  const SIGNALS: ProspectCrawlSignals = {
    ssl: false,
    mobileViewport: false,
    copyrightYear: 2019,
    titleTag: 'Dr Smith',
    metaDescription: null,
    bookingWidget: false,
    socialLinks: { facebook: 'https://facebook.com/drsmith' },
    builder: 'godaddy',
    pageWeightKb: 900,
    emails: [],
    fetchedAt: '2026-07-03T00:00:00Z',
  }

  it('derives a low quality from the classic tells', () => {
    const v = heuristicVerdict(SIGNALS, true)
    expect(v.hasWebsite).toBe(true)
    expect(v.websiteQuality).toBeLessThan(40)
    expect(v.websiteReasons).toContain('No HTTPS')
    expect(v.websiteReasons).toContain('Not mobile-friendly')
    expect(v.socialPresence).toBe(30) // one profile
    expect(v.onlineBooking).toBe(false)
  })

  it('no website → the zero verdict', () => {
    const v = heuristicVerdict(null, false)
    expect(v).toMatchObject({ hasWebsite: false, websiteQuality: 0, weaknesses: ['no website'] })
  })
})
