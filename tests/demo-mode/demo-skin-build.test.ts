import { describe, it, expect } from 'vitest'

/**
 * Demo-skin composition — brand usability judgment (white/black rejected),
 * first-name extraction, the cookie-size drop order, and the same-origin
 * compare URL.
 */

import {
  buildDemoSkin,
  usableBrandColor,
  officialFirstName,
  buildDemoCompareUrl,
} from '@/lib/demo-skin-build'
import { DEMO_SKIN_MAX_BYTES } from '@/lib/types/demo-skin'
import type { ProspectCrawlSignals } from '@/lib/types/prospecting'

const SIGNALS: ProspectCrawlSignals = {
  ssl: true,
  mobileViewport: false,
  copyrightYear: 2019,
  titleTag: 'Lone Star Dental',
  metaDescription: null,
  bookingWidget: false,
  socialLinks: {},
  builder: null,
  pageWeightKb: 500,
  emails: [],
  fetchedAt: '2026-07-03T00:00:00Z',
  themeColor: '#1d4ed8',
  iconUrl: 'https://lonestardental.com/apple-touch-icon.png',
  siteName: 'Lone Star Dental',
}

const PROSPECT = {
  id: 'pros_1',
  name: 'Lone Star Dental',
  city: 'Dallas',
  websiteUrl: 'https://lonestardental.com',
  authorizedOfficialName: 'DR. MARIA GARZA',
  googleRatingTenths: 38,
  reviewCount: 12,
}

describe('usableBrandColor', () => {
  it('accepts real brand colors, lowercased', () => {
    expect(usableBrandColor('#1D4ED8')).toBe('#1d4ed8')
    expect(usableBrandColor('#9CAF9F')).toBe('#9caf9f')
  })
  it('rejects the ubiquitous near-white/near-black theme-colors and junk', () => {
    expect(usableBrandColor('#ffffff')).toBeNull()
    expect(usableBrandColor('#fafafa')).toBeNull()
    expect(usableBrandColor('#000000')).toBeNull()
    expect(usableBrandColor('#0a0a0a')).toBeNull()
    expect(usableBrandColor('blue')).toBeNull()
    expect(usableBrandColor(null)).toBeNull()
  })
})

describe('officialFirstName', () => {
  it('strips the honorific and normalizes case', () => {
    expect(officialFirstName('DR. MARIA GARZA')).toBe('Maria')
    expect(officialFirstName('Dr John Smith')).toBe('John')
    expect(officialFirstName('JANE DOE')).toBe('Jane')
    expect(officialFirstName(null)).toBeNull()
    expect(officialFirstName('Dr.')).toBeNull()
  })
})

describe('buildDemoSkin', () => {
  it('composes the full skin from enrichment', () => {
    const skin = buildDemoSkin({ prospect: PROSPECT, signals: SIGNALS, verdict: null })
    expect(skin).toMatchObject({
      prospectId: 'pros_1',
      clinicName: 'Lone Star Dental',
      city: 'Dallas',
      brandColor: '#1d4ed8',
      logoUrl: 'https://lonestardental.com/apple-touch-icon.png',
      websiteUrl: 'https://lonestardental.com',
      officialFirstName: 'Maria',
    })
    // Gaps became cookie ammunition (≤4).
    expect(skin.weaknesses!.length).toBeLessThanOrEqual(4)
    expect(skin.weaknesses).toContain('No online booking today')
  })

  it('white theme-color yields no brandColor (amber fallback downstream)', () => {
    const skin = buildDemoSkin({
      prospect: PROSPECT,
      signals: { ...SIGNALS, themeColor: '#ffffff' },
      verdict: null,
    })
    expect(skin.brandColor).toBeUndefined()
  })

  it('enforces the cookie budget by dropping weaknesses → logoUrl → websiteUrl', () => {
    const skin = buildDemoSkin({
      prospect: { ...PROSPECT, name: 'X'.repeat(80) },
      signals: {
        ...SIGNALS,
        iconUrl: `https://lonestardental.com/${'a'.repeat(280)}.png`,
      },
      verdict: {
        hasWebsite: true,
        websiteQuality: 10,
        websiteReasons: [],
        socialPresence: 0,
        onlineBooking: false,
        weaknesses: Array.from({ length: 4 }, (_, i) => `${'w'.repeat(76)}${i}`),
        summary: '',
      },
    })
    expect(JSON.stringify(skin).length).toBeLessThanOrEqual(DEMO_SKIN_MAX_BYTES)
    // Identity always survives.
    expect(skin.prospectId).toBe('pros_1')
    expect(skin.clinicName).toBeTruthy()
  })

  it('never keeps non-https logo/website', () => {
    const skin = buildDemoSkin({
      prospect: { ...PROSPECT, websiteUrl: 'http://insecure.example' },
      signals: { ...SIGNALS, iconUrl: null },
      verdict: null,
    })
    expect(skin.websiteUrl).toBeUndefined()
    expect(skin.logoUrl).toBeUndefined()
  })
})

describe('buildDemoCompareUrl', () => {
  it('is same-origin path-based with a #-less brand param', () => {
    expect(buildDemoCompareUrl('#1D4ED8')).toBe('/site/acme-dental-demo/demo-brand?brand=1d4ed8')
    expect(buildDemoCompareUrl(null)).toBe('/site/acme-dental-demo/demo-brand')
    expect(buildDemoCompareUrl('javascript:x')).toBe('/site/acme-dental-demo/demo-brand')
  })
})
