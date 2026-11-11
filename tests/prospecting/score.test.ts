import { describe, it, expect } from 'vitest'

/**
 * Deterministic opportunity scoring — the ranking contract: no website is
 * always hot, bad websites are warm+, dialed-in practices are low, and the
 * heuristic fallback verdict keeps ranking honest when AI is unavailable.
 */

import { computeOpportunityScore, bandForScore, heuristicVerdict, rescoreOpportunity, OPPORTUNITY_WEIGHTS } from '@/lib/prospect-scoring'
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

// ── P-04: "needs us" gets what we already fetch ─────────────────────────────

describe('the P-04 weights — the stack, the builder, a new practice, a group', () => {
  const base = { reviewCount: 40, ratingTenths: 45 }
  const plain = computeOpportunityScore({ verdict: GOOD_SITE, ...base })

  it('documents the weights', () => {
    expect(OPPORTUNITY_WEIGHTS).toEqual({
      newPractice: 8,
      newPracticeNoSite: 4,
      noStack: 6,
      stackTool: -5,
      stackFloor: -15,
      diyBuilder: 5,
      templateVendor: 4,
      groupPractice: -10,
      websiteCap: 89,
    })
  })

  it('a modern stack LOWERS opportunity, −5 a tool, floor −15, and the reason names it', () => {
    const two = computeOpportunityScore({ verdict: GOOD_SITE, ...base, stack: ['NexHealth', 'Birdeye'] })
    expect(two.score).toBe(plain.score - 10)
    expect(two.reasons).toContain('Already on NexHealth + Birdeye')
    const five = computeOpportunityScore({ verdict: GOOD_SITE, ...base, stack: ['NexHealth', 'Birdeye', 'Weave', 'Podium', 'Yapi'] })
    expect(five.score).toBe(plain.score - 15)
    expect(five.reasons).toContain('Already on NexHealth + Birdeye + Weave + 2 more')
  })

  it('no booking, no review engine — a phone number is their only door — RAISES it (only when the crawl looked)', () => {
    const noDoor = computeOpportunityScore({ verdict: { ...GOOD_SITE, onlineBooking: false }, ...base, stack: [] })
    const unknown = computeOpportunityScore({ verdict: { ...GOOD_SITE, onlineBooking: false }, ...base })
    expect(noDoor.score).toBe(unknown.score + 6)
    expect(noDoor.reasons).toContain('No booking widget, no review engine — a phone number is their only door')
    // A verdict that still sees booking on the page gets no "only door" bonus.
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, stack: [] }).score).toBe(plain.score)
    // An older crawl (no stack key) moves nothing — the P-01 ladder as it was.
    expect(unknown.score).toBe(44)
    // A page nobody read (robots.txt refused it: stack null) is not "looked, none" — no credit either (I.1).
    expect(computeOpportunityScore({ verdict: { ...GOOD_SITE, onlineBooking: false }, ...base, stack: null }).score).toBe(unknown.score)
  })

  it('rescoreOpportunity (H.3) recomputes from what the row stores — a group practice found later drops it by 10 and the band follows; no verdict, no score', () => {
    const verdict = { ...GOOD_SITE, websiteQuality: 50, onlineBooking: false, socialPresence: 10 }
    const row = { aiVerdict: verdict, reviewCount: 22, ratingTenths: 45, enrichment: { stack: [], builder: null } }
    const at = '2026-11-10T00:00:00.000Z'
    const solo = rescoreOpportunity({ ...row, verification: { fit: { size: { status: 'solo', detail: null, checkedAt: at, source: 'nppes', dentists: 1 } } } })
    const group = rescoreOpportunity({ ...row, verification: { fit: { size: { status: 'group', detail: null, checkedAt: at, source: 'nppes', dentists: 6 } } } })
    // 30 + 4 + 14 + 10 + 6 (22 reviews) + 6 (no stack, no booking) = 70 warm; a group −10 → 60 warm; with 40 reviews 64 → 54 cool.
    expect(solo).toMatchObject({ score: 70, band: 'warm' })
    expect(group).toMatchObject({ score: 60, band: 'warm' })
    expect(group!.reasons).toContain('A group practice — lower priority, not a chain')
    const fewer = { ...row, reviewCount: 40, enrichment: { stack: null, builder: null } }
    expect(rescoreOpportunity({ ...fewer, verification: { fit: { size: { status: 'solo', detail: null, checkedAt: at, source: 'nppes' } } } })).toMatchObject({ score: 58, band: 'cool' })
    expect(rescoreOpportunity({ ...fewer, verification: { fit: { size: { status: 'group', detail: null, checkedAt: at, source: 'nppes' } } } })).toMatchObject({ score: 48, band: 'cool' })
    expect(rescoreOpportunity({ ...row, aiVerdict: null, verification: {} })).toBeNull()
    expect(rescoreOpportunity({ ...row, aiVerdict: { junk: true }, verification: {} })).toBeNull()
  })

  it('DIY builders +5, dental template vendors +4, WordPress nothing — in words', () => {
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, builder: 'wix' })).toMatchObject({ score: plain.score + 5 })
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, builder: 'wix' }).reasons).toContain('Built on Wix — a DIY site')
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, builder: 'godaddy' }).reasons).toContain('Built on GoDaddy Website Builder — a DIY site')
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, builder: 'prosites' })).toMatchObject({ score: plain.score + 4 })
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, builder: 'prosites' }).reasons).toContain('A ProSites template site')
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, builder: 'wordpress' }).score).toBe(plain.score)
  })

  it('a new practice: +8 with a website, +4 without — "no website yet is normal; now is the moment"', () => {
    const withSite = computeOpportunityScore({ verdict: GOOD_SITE, ...base, openedAt: '2025-06-15' })
    expect(withSite.score).toBe(plain.score + 8)
    expect(withSite.reasons).toContain('Opened Jun 2025 — a new practice still setting up')
    const noSite = computeOpportunityScore({ verdict: { ...GOOD_SITE, hasWebsite: false, websiteQuality: 0 }, ...base, openedAt: '2025-06-15' })
    expect(noSite.score).toBe(96)
    expect(noSite.reasons).toContain('Opened Jun 2025 — no website yet is normal; now is the moment')
  })

  it('a group practice is deprioritised −10, never excluded', () => {
    const g = computeOpportunityScore({ verdict: GOOD_SITE, ...base, practiceSize: 'group' })
    expect(g.score).toBe(plain.score - 10)
    expect(g.reasons).toContain('A group practice — lower priority, not a chain')
    expect(computeOpportunityScore({ verdict: GOOD_SITE, ...base, practiceSize: 'small' }).score).toBe(plain.score)
  })

  it('a practice with a website never beats one without, whatever stacks up', () => {
    const stacked = computeOpportunityScore({
      verdict: { ...GOOD_SITE, websiteQuality: 0, websiteReasons: [], onlineBooking: false, socialPresence: 0 },
      reviewCount: 3,
      ratingTenths: 30,
      stack: [],
      builder: 'wix',
      openedAt: '2025-06-15',
    })
    expect(stacked.score).toBe(89)
    expect(stacked.band).toBe('hot')
    const none = computeOpportunityScore({ verdict: { ...GOOD_SITE, hasWebsite: false, websiteQuality: 0 }, reviewCount: 3, ratingTenths: 30 })
    expect(none.score).toBeGreaterThan(stacked.score)
  })

  it('the heuristic verdict marks a template vendor down a little', () => {
    const signals: ProspectCrawlSignals = { ssl: true, mobileViewport: true, copyrightYear: 2026, titleTag: 't', metaDescription: 'd', bookingWidget: false, socialLinks: {}, builder: 'prosites', pageWeightKb: 100, emails: [], fetchedAt: '2026-07-03T00:00:00Z' }
    expect(heuristicVerdict(signals, true).websiteQuality).toBe(45)
    expect(heuristicVerdict({ ...signals, builder: null }, true).websiteQuality).toBe(50)
  })
})
