import { describe, expect, it } from 'vitest'
import {
  availableSites,
  isReviewConfigComplete,
  PLATFORM_LABEL,
  reviewPlatformUrl,
  type ReviewConfig,
} from '@/lib/services/reviews'

/**
 * Pure-helper tests for the Reviews service. URL builders, platform
 * availability, config-complete checks. Full integration (send + funnel
 * state transitions) is exercised via the demo seeder + manual demo
 * verification.
 */

function makeConfig(overrides: Partial<ReviewConfig>): ReviewConfig {
  return {
    organizationId: 'org_test',
    googlePlaceId: null,
    healthgradesUrl: null,
    facebookPageId: null,
    yelpBusinessSlug: null,
    minDaysBetweenRequests: 365,
    npsEnabled: false,
    autoSendEnabled: false,
    autoSendDelayHours: 24,
    privateFeedbackEmail: null,
    ...overrides,
  }
}

describe('reviewPlatformUrl', () => {
  it('builds a Google writereview URL from the place id', () => {
    const url = reviewPlatformUrl('google', makeConfig({ googlePlaceId: 'ChIJ_abc123' }))
    expect(url).toBe('https://search.google.com/local/writereview?placeid=ChIJ_abc123')
  })

  it('passes through the Healthgrades URL verbatim (no public deep-link spec)', () => {
    const url = reviewPlatformUrl(
      'healthgrades',
      makeConfig({ healthgradesUrl: 'https://www.healthgrades.com/dental-practice/acme' }),
    )
    expect(url).toBe('https://www.healthgrades.com/dental-practice/acme')
  })

  it('builds a Facebook reviews URL from the page id', () => {
    const url = reviewPlatformUrl('facebook', makeConfig({ facebookPageId: 'acme-dental' }))
    expect(url).toBe('https://www.facebook.com/acme-dental/reviews')
  })

  it('builds a Yelp writereview URL from the business slug', () => {
    const url = reviewPlatformUrl('yelp', makeConfig({ yelpBusinessSlug: 'acme-dental-austin' }))
    expect(url).toBe('https://www.yelp.com/writeareview/biz/acme-dental-austin')
  })

  it('returns null when the platform has no identifier configured', () => {
    expect(reviewPlatformUrl('google', makeConfig({}))).toBeNull()
    expect(reviewPlatformUrl('healthgrades', makeConfig({}))).toBeNull()
    expect(reviewPlatformUrl('facebook', makeConfig({}))).toBeNull()
    expect(reviewPlatformUrl('yelp', makeConfig({}))).toBeNull()
  })
})

describe('availableSites', () => {
  it('returns empty when no platforms are configured', () => {
    expect(availableSites(makeConfig({}))).toEqual([])
  })

  it('orders platforms: Google > Healthgrades > Facebook > Yelp', () => {
    const sites = availableSites(
      makeConfig({
        yelpBusinessSlug: 'y',
        facebookPageId: 'f',
        healthgradesUrl: 'h',
        googlePlaceId: 'g',
      }),
    )
    expect(sites).toEqual(['google', 'healthgrades', 'facebook', 'yelp'])
  })

  it('omits Yelp by default (opt-in only — Yelp filters solicited reviews)', () => {
    const sites = availableSites(
      makeConfig({ googlePlaceId: 'g', healthgradesUrl: 'h', facebookPageId: 'f' }),
    )
    expect(sites).not.toContain('yelp')
    expect(sites).toEqual(['google', 'healthgrades', 'facebook'])
  })

  it('includes Yelp when the org explicitly fills the slug', () => {
    const sites = availableSites(
      makeConfig({ googlePlaceId: 'g', yelpBusinessSlug: 'y' }),
    )
    expect(sites).toContain('yelp')
  })
})

describe('isReviewConfigComplete', () => {
  it('false when all platform identifiers are null', () => {
    expect(isReviewConfigComplete(makeConfig({}))).toBe(false)
  })

  it('true with only Google configured', () => {
    expect(isReviewConfigComplete(makeConfig({ googlePlaceId: 'g' }))).toBe(true)
  })

  it('true with only Healthgrades configured', () => {
    expect(isReviewConfigComplete(makeConfig({ healthgradesUrl: 'h' }))).toBe(true)
  })

  it('true with any single platform configured', () => {
    expect(isReviewConfigComplete(makeConfig({ facebookPageId: 'f' }))).toBe(true)
    expect(isReviewConfigComplete(makeConfig({ yelpBusinessSlug: 'y' }))).toBe(true)
  })
})

describe('PLATFORM_LABEL', () => {
  it('maps every site value to a user-friendly label', () => {
    expect(PLATFORM_LABEL.google).toBe('Google')
    expect(PLATFORM_LABEL.healthgrades).toBe('Healthgrades')
    expect(PLATFORM_LABEL.facebook).toBe('Facebook')
    expect(PLATFORM_LABEL.yelp).toBe('Yelp')
  })
})
