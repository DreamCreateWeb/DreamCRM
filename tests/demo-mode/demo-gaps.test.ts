import { describe, it, expect } from 'vitest'

/**
 * Beat ↔ gap mapping — the demo-ammunition router: deterministic signal
 * triggers, the AI-weakness keyword table (first match wins), the website
 * fallback, dedupe, and the panel's grouping helper.
 */

import { deriveDemoGaps, mapWeaknessToBeat, groupGapsByBeat } from '@/lib/demo-gaps'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'

const SIGNALS: ProspectCrawlSignals = {
  ssl: false,
  mobileViewport: false,
  copyrightYear: 2019,
  titleTag: 'Dr Smith',
  metaDescription: null,
  bookingWidget: false,
  socialLinks: {},
  builder: 'godaddy',
  pageWeightKb: 900,
  emails: [],
  fetchedAt: '2026-07-03T00:00:00Z',
}

const VERDICT: ProspectAiVerdict = {
  hasWebsite: true,
  websiteQuality: 25,
  websiteReasons: [],
  socialPresence: 0,
  onlineBooking: false,
  weaknesses: ['no online booking', 'site looks dated', 'thin seo visibility', 'slow to respond to patient emails'],
  summary: '',
}

describe('mapWeaknessToBeat', () => {
  it('routes by the keyword table, first match wins', () => {
    expect(mapWeaknessToBeat('no online booking')).toBe('appointments')
    expect(mapWeaknessToBeat('site not mobile-friendly')).toBe('website')
    expect(mapWeaknessToBeat('only 12 google reviews')).toBe('reviews')
    expect(mapWeaknessToBeat('no instagram presence')).toBe('reviews')
    expect(mapWeaknessToBeat('missing meta description')).toBe('analytics')
    expect(mapWeaknessToBeat('slow to reply to patient messages')).toBe('messages')
  })

  it('anything unmatched falls back to website (what we sell first)', () => {
    expect(mapWeaknessToBeat('mysterious vibes')).toBe('website')
  })
})

describe('deriveDemoGaps', () => {
  it('deterministic signal gaps come first with exact labels', () => {
    const gaps = deriveDemoGaps(SIGNALS, null, { ratingTenths: 38, reviewCount: 12 }, 2026)
    const labels = gaps.map((g) => g.label)
    expect(labels).toContain('No online booking today')
    expect(labels).toContain("Site isn't mobile-friendly")
    expect(labels).toContain('Footer says 2019')
    expect(labels).toContain('No HTTPS')
    expect(labels).toContain('DIY godaddy site')
    expect(labels).toContain('No social presence linked')
    expect(labels).toContain('Google rating 3.8★')
    expect(labels).toContain('Only 12 Google reviews')
    expect(gaps.every((g) => g.source === 'signal')).toBe(true)
  })

  it('AI weaknesses append via the keyword table without duplicating signals', () => {
    const gaps = deriveDemoGaps(SIGNALS, VERDICT, undefined, 2026)
    const ai = gaps.filter((g) => g.source === 'ai')
    // 'no online booking' (AI) maps to appointments but the deterministic
    // 'No online booking today' already covers it — different label text, so
    // it stays (dedupe is beat+label); the router still assigns beats right.
    expect(ai.find((g) => g.label === 'thin seo visibility')?.beatId).toBe('analytics')
    expect(ai.find((g) => g.label === 'slow to respond to patient emails')?.beatId).toBe('messages')
  })

  it('no-website prospects lead with the headline gap', () => {
    const gaps = deriveDemoGaps(null, { ...VERDICT, hasWebsite: false, weaknesses: [] }, undefined, 2026)
    expect(gaps[0]).toMatchObject({ beatId: 'website', label: 'No website at all' })
  })

  it('a healthy practice yields few or no gaps', () => {
    const healthy: ProspectCrawlSignals = {
      ...SIGNALS,
      ssl: true,
      mobileViewport: true,
      copyrightYear: 2026,
      bookingWidget: true,
      builder: null,
      socialLinks: { facebook: 'https://facebook.com/x', instagram: 'https://instagram.com/x' },
    }
    const gaps = deriveDemoGaps(healthy, null, { ratingTenths: 49, reviewCount: 320 }, 2026)
    expect(gaps).toHaveLength(0)
  })
})

describe('groupGapsByBeat', () => {
  it('groups the flat cookie strings for the panel callouts', () => {
    const grouped = groupGapsByBeat([
      'No online booking today',
      'Footer says 2019',
      'Only 12 Google reviews',
      'mystery issue',
    ])
    expect(grouped.appointments).toEqual(['No online booking today'])
    expect(grouped.website).toEqual(expect.arrayContaining(['Footer says 2019', 'mystery issue']))
    expect(grouped.reviews).toEqual(['Only 12 Google reviews'])
  })
})
