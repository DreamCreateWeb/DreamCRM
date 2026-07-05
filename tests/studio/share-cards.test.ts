import { describe, it, expect } from 'vitest'
import { buildShareCards } from '@/lib/share-cards'

/**
 * The printable QR card list — pins the availability gating (a card whose
 * link would dead-end isn't offered) and the URL shapes each card encodes.
 */
describe('buildShareCards', () => {
  const base = {
    clinicName: 'Acme Dental',
    siteUrl: 'https://acme.dreamcreatestudio.com',
    isPro: true,
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=abc123',
    portalUrl: 'https://www.dreamcreatestudio.com/signin/patient?clinic=acme',
  }

  it('offers all four cards when everything exists', () => {
    const cards = buildShareCards(base)
    expect(cards.map((c) => c.key)).toEqual(['book', 'site', 'review', 'portal'])
  })

  it('encodes the right URL per card', () => {
    const byKey = Object.fromEntries(buildShareCards(base).map((c) => [c.key, c.url]))
    expect(byKey.book).toBe('https://acme.dreamcreatestudio.com/book')
    expect(byKey.site).toBe('https://acme.dreamcreatestudio.com')
    expect(byKey.review).toBe('https://search.google.com/local/writereview?placeid=abc123')
    expect(byKey.portal).toBe(base.portalUrl)
  })

  it('drops the booking card on basic tier (no /book page there)', () => {
    const keys = buildShareCards({ ...base, isPro: false }).map((c) => c.key)
    expect(keys).not.toContain('book')
    expect(keys).toContain('site')
  })

  it('drops the review card without a Google review link', () => {
    const keys = buildShareCards({ ...base, googleReviewUrl: null }).map((c) => c.key)
    expect(keys).not.toContain('review')
  })

  it('site + portal cards always render (they always exist)', () => {
    const keys = buildShareCards({ ...base, isPro: false, googleReviewUrl: null }).map((c) => c.key)
    expect(keys).toEqual(['site', 'portal'])
  })

  it('every card carries a placement hint (screen-only guidance)', () => {
    for (const c of buildShareCards(base)) {
      expect(c.placement.length).toBeGreaterThan(0)
    }
  })
})
