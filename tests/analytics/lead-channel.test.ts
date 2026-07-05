import { describe, it, expect } from 'vitest'
import { classifyLeadChannel, countLeadChannels, LEAD_CHANNEL_LABELS } from '@/lib/lead-channel'

describe('classifyLeadChannel', () => {
  it('classic organic Google (referrer + utm) → search', () => {
    expect(
      classifyLeadChannel({ utmSource: 'google', utmMedium: 'organic', referrer: 'https://www.google.com/' }),
    ).toBe('search')
  })

  it('referrer-only search engines → search (google.co.uk, bing)', () => {
    expect(classifyLeadChannel({ referrer: 'https://www.google.co.uk/search?q=dentist' })).toBe('search')
    expect(classifyLeadChannel({ referrer: 'https://www.bing.com/' })).toBe('search')
  })

  it('paid beats everything — a Facebook ad is paid, not social', () => {
    expect(classifyLeadChannel({ utmSource: 'facebook', utmMedium: 'cpc' })).toBe('paid')
    expect(classifyLeadChannel({ utmSource: 'google', utmMedium: 'ppc' })).toBe('paid')
    expect(classifyLeadChannel({ utmSource: 'google_ads', utmMedium: null })).toBe('paid')
  })

  it('email medium or newsletter source → email', () => {
    expect(classifyLeadChannel({ utmSource: 'recall', utmMedium: 'email' })).toBe('email')
    expect(classifyLeadChannel({ utmSource: 'newsletter' })).toBe('email')
  })

  it('social sources + hosts → social (utm and referrer forms)', () => {
    expect(classifyLeadChannel({ utmSource: 'instagram', utmMedium: 'social' })).toBe('social')
    expect(classifyLeadChannel({ referrer: 'https://www.facebook.com/some-page' })).toBe('social')
    expect(classifyLeadChannel({ referrer: 'https://t.co/abc' })).toBe('social')
  })

  it('unknown referring site → referral; nothing at all → direct', () => {
    expect(classifyLeadChannel({ referrer: 'https://www.localnewspaper.com/best-dentists' })).toBe('referral')
    expect(classifyLeadChannel({})).toBe('direct')
    expect(classifyLeadChannel({ utmSource: null, utmMedium: null, referrer: null })).toBe('direct')
  })

  it('is junk-tolerant — malformed referrer never throws', () => {
    expect(classifyLeadChannel({ referrer: 'not a url' })).toBe('direct')
    expect(classifyLeadChannel({ referrer: 'not a url', utmSource: 'mystery' })).toBe('referral')
  })
})

describe('countLeadChannels', () => {
  it('ranks channels by count and omits zero rows', () => {
    const rows = countLeadChannels([
      { referrer: 'https://www.google.com/' },
      { referrer: 'https://www.google.com/' },
      { utmSource: 'instagram' },
      {},
    ])
    expect(rows[0]).toEqual({ channel: 'search', count: 2 })
    expect(rows.map((r) => r.channel)).toEqual(['search', 'social', 'direct'])
  })

  it('every channel has an owner-facing label', () => {
    for (const rows of [countLeadChannels([{}, { utmSource: 'newsletter' }])]) {
      for (const r of rows) expect(LEAD_CHANNEL_LABELS[r.channel]).toBeTruthy()
    }
  })
})
