import { describe, it, expect } from 'vitest'
import {
  acceptableSiteUrls,
  buildListingWebsiteUrl,
  comparableUrl,
  isGbpTaggedAttribution,
  listingPointsAtUs,
  listingWebsiteState,
  parseGbpListingSnapshot,
  type GbpListingSnapshot,
} from '@/lib/gbp-listing'

/**
 * LISTING TRUTH's pure core (the onboarding overhaul, Phase A slice 1).
 * The law under test: comparison is forgiving (scheme/www/slash/query are
 * noise), unknown never fabricates a verdict, and the UTM tag the writer
 * stamps is exactly what the lead-channel reader recognizes.
 */

const ACCEPTABLE = acceptableSiteUrls({
  slug: 'mammoth-spring',
  siteDomain: 'dreamcreatestudio.com',
  customDomain: null,
})

describe('comparableUrl', () => {
  it('drops scheme, www, trailing slash, query, and hash', () => {
    expect(comparableUrl('https://www.foo.com/')).toBe('foo.com')
    expect(comparableUrl('http://foo.com')).toBe('foo.com')
    expect(comparableUrl('https://foo.com/bar/?utm_source=google#top')).toBe('foo.com/bar')
  })
  it('tolerates a bare domain with no scheme (Google stores these)', () => {
    expect(comparableUrl('foo.com/bar')).toBe('foo.com/bar')
  })
  it('lowercases the host but preserves path case', () => {
    expect(comparableUrl('https://FOO.com/Bar')).toBe('foo.com/Bar')
  })
  it('returns null for junk — unreadable must become unknown, not mismatch', () => {
    expect(comparableUrl('')).toBeNull()
    expect(comparableUrl('   ')).toBeNull()
    expect(comparableUrl(null)).toBeNull()
    expect(comparableUrl(undefined)).toBeNull()
    expect(comparableUrl('mailto:x@y.com')).toBeNull()
    expect(comparableUrl('http://')).toBeNull()
  })
})

describe('acceptableSiteUrls + listingPointsAtUs', () => {
  it('accepts the subdomain, the path form, and the custom domain', () => {
    const withCustom = acceptableSiteUrls({
      slug: 'mammoth-spring',
      siteDomain: 'dreamcreatestudio.com',
      customDomain: 'mammothspringdental.com',
    })
    expect(withCustom[0]).toBe('https://mammothspringdental.com') // canonical first
    expect(listingPointsAtUs('https://www.mammothspringdental.com/', withCustom)).toBe(true)
    expect(listingPointsAtUs('https://mammoth-spring.dreamcreatestudio.com', withCustom)).toBe(true)
    expect(listingPointsAtUs('https://dreamcreatestudio.com/site/mammoth-spring/', withCustom)).toBe(true)
  })
  it('our own UTM-tagged URL still points at us (Google may keep the params)', () => {
    expect(listingPointsAtUs(buildListingWebsiteUrl(ACCEPTABLE[0]), ACCEPTABLE)).toBe(true)
  })
  it('a legacy site does not', () => {
    expect(listingPointsAtUs('https://mammoth-spring-dental.wixsite.com/home', ACCEPTABLE)).toBe(false)
    expect(listingPointsAtUs(null, ACCEPTABLE)).toBe(false)
  })
  it('a different clinic on OUR domain is NOT a match (path identity counts)', () => {
    expect(listingPointsAtUs('https://dreamcreatestudio.com/site/other-clinic', ACCEPTABLE)).toBe(false)
    expect(listingPointsAtUs('https://other-clinic.dreamcreatestudio.com', ACCEPTABLE)).toBe(false)
  })
})

describe('buildListingWebsiteUrl', () => {
  it('appends the canonical tag set', () => {
    expect(buildListingWebsiteUrl('https://mammoth-spring.dreamcreatestudio.com')).toBe(
      'https://mammoth-spring.dreamcreatestudio.com?utm_source=google&utm_medium=organic&utm_campaign=gbp-listing&utm_content=website-button',
    )
  })
  it('uses & when a query already exists, and never double-tags', () => {
    const once = buildListingWebsiteUrl('https://foo.com?ref=1')
    expect(once).toContain('?ref=1&utm_source=google')
    expect(buildListingWebsiteUrl(once)).toBe(once)
  })
})

describe('isGbpTaggedAttribution', () => {
  it('recognizes the campaign marker alone (Google strips params one at a time)', () => {
    expect(isGbpTaggedAttribution({ utmCampaign: 'gbp-listing' })).toBe(true)
    expect(isGbpTaggedAttribution({ utmCampaign: 'GBP-Listing' })).toBe(true)
    expect(isGbpTaggedAttribution({ utmCampaign: 'gbp' })).toBe(true)
  })
  it('ignores everything else', () => {
    expect(isGbpTaggedAttribution({ utmCampaign: 'spring-recall' })).toBe(false)
    expect(isGbpTaggedAttribution({ utmCampaign: null })).toBe(false)
    expect(isGbpTaggedAttribution({})).toBe(false)
  })
})

describe('parseGbpListingSnapshot', () => {
  it('round-trips a full snapshot', () => {
    const snap = {
      websiteUri: 'https://old.com',
      placeId: 'ChIJx',
      reviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJx',
      mapsUri: 'https://maps.google.com/?cid=1',
      isVerified: true,
      title: 'Mammoth Spring Dental',
      fetchedAt: '2026-08-05T12:00:00.000Z',
    }
    expect(parseGbpListingSnapshot(snap)).toEqual(snap)
  })
  it('degrades junk to nulls / null — never throws', () => {
    expect(parseGbpListingSnapshot(null)).toBeNull()
    expect(parseGbpListingSnapshot('nope')).toBeNull()
    expect(parseGbpListingSnapshot([1, 2])).toBeNull()
    expect(parseGbpListingSnapshot({ websiteUri: 42, isVerified: 'yes' })).toEqual({
      websiteUri: null,
      placeId: null,
      reviewUrl: null,
      mapsUri: null,
      isVerified: null,
      title: null,
      fetchedAt: null,
    })
  })
})

describe('listingWebsiteState', () => {
  const base: GbpListingSnapshot = {
    websiteUri: null,
    placeId: null,
    reviewUrl: null,
    mapsUri: null,
    isVerified: true,
    title: null,
    fetchedAt: '2026-08-05T12:00:00.000Z',
  }
  it('no snapshot / never fetched → unknown (say nothing)', () => {
    expect(listingWebsiteState(null, ACCEPTABLE)).toBe('unknown')
    expect(listingWebsiteState({ ...base, fetchedAt: null }, ACCEPTABLE)).toBe('unknown')
  })
  it('fetched with no website → missing', () => {
    expect(listingWebsiteState(base, ACCEPTABLE)).toBe('missing')
  })
  it('unreadable stored value → unknown, never a false mismatch', () => {
    expect(listingWebsiteState({ ...base, websiteUri: ':::' }, ACCEPTABLE)).toBe('unknown')
  })
  it('points elsewhere → mismatch; points at us (any form) → ok', () => {
    expect(listingWebsiteState({ ...base, websiteUri: 'https://old-wix.com' }, ACCEPTABLE)).toBe('mismatch')
    expect(
      listingWebsiteState(
        { ...base, websiteUri: 'https://www.mammoth-spring.dreamcreatestudio.com/' },
        ACCEPTABLE,
      ),
    ).toBe('ok')
  })
})
