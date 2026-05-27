import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { selectQueue: unknown[][] } = { selectQueue: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return { db: { select: () => chain() } }
})

import { isOrganicReferrer, getSiteHealth, getOrganicAttribution } from '@/lib/services/seo'

beforeEach(() => {
  state.selectQueue.length = 0
})

describe('isOrganicReferrer', () => {
  it('treats utm_medium organic/seo as organic', () => {
    expect(isOrganicReferrer(null, 'organic')).toBe(true)
    expect(isOrganicReferrer(null, 'seo')).toBe(true)
  })

  it('treats an explicit non-organic utm_medium as not organic — even from a search referrer', () => {
    expect(isOrganicReferrer('https://www.google.com/', 'cpc')).toBe(false)
    expect(isOrganicReferrer(null, 'social')).toBe(false)
    expect(isOrganicReferrer(null, 'email')).toBe(false)
  })

  it('falls back to a search-engine referrer host when no utm', () => {
    expect(isOrganicReferrer('https://www.google.com/', null)).toBe(true)
    expect(isOrganicReferrer('https://www.bing.com/search?q=x', '')).toBe(true)
    expect(isOrganicReferrer('google.com/search', null)).toBe(true) // no protocol
  })

  it('is not organic for non-search referrers or empty', () => {
    expect(isOrganicReferrer('https://www.instagram.com/', null)).toBe(false)
    expect(isOrganicReferrer('', null)).toBe(false)
    expect(isOrganicReferrer(null, null)).toBe(false)
  })
})

describe('getSiteHealth', () => {
  it('scores high + passes NAP/schema for a complete clinic', async () => {
    state.selectQueue.push([
      {
        displayName: 'Acme Dental',
        tagline: 'Gentle care',
        about: 'About us',
        addressLine1: '500 Main St',
        city: 'Austin',
        state: 'TX',
        phone: '(512) 555-0100',
        services: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        staff: [{ id: 'p1', name: 'Dr R' }, { id: 'p2', name: 'Maria' }],
      },
    ])
    state.selectQueue.push([
      { coverImageUrl: 'u', coverImageAlt: 'alt', faq: [{ q: 'a', a: 'b' }] },
      { coverImageUrl: null, coverImageAlt: null, faq: null },
    ])
    const h = await getSiteHealth('org_1')
    expect(h.score).toBeGreaterThanOrEqual(80)
    expect(h.checks.find((c) => c.id === 'nap')?.status).toBe('pass')
    expect(h.checks.find((c) => c.id === 'schema')?.status).toBe('pass')
  })

  it('fails NAP + scores lower when the profile is thin', async () => {
    state.selectQueue.push([
      { displayName: 'Acme', tagline: null, about: null, addressLine1: null, city: null, state: null, phone: null, services: [], staff: [] },
    ])
    state.selectQueue.push([]) // no posts
    const h = await getSiteHealth('org_1')
    expect(h.checks.find((c) => c.id === 'nap')?.status).toBe('fail')
    expect(h.score).toBeLessThan(80)
  })

  it('warns when a post has a cover image but no alt text', async () => {
    state.selectQueue.push([{ displayName: 'A', addressLine1: '1', city: 'x', state: 'y', phone: '5', services: [], staff: [] }])
    state.selectQueue.push([{ coverImageUrl: 'u', coverImageAlt: null, faq: null }])
    const h = await getSiteHealth('org_1')
    expect(h.checks.find((c) => c.id === 'alt')?.status).toBe('warn')
  })
})

describe('getOrganicAttribution', () => {
  it('counts organic-sourced leads + bookings against totals', async () => {
    state.selectQueue.push([
      { referrer: 'https://www.google.com/', utmMedium: 'organic' },
      { referrer: null, utmMedium: 'cpc' },
      { referrer: 'https://instagram.com', utmMedium: 'social' },
      { referrer: 'https://www.google.com/', utmMedium: null },
    ]) // leads
    state.selectQueue.push([
      { referrer: 'https://www.google.com/', utmMedium: 'organic' },
      { referrer: null, utmMedium: null },
    ]) // bookings
    const a = await getOrganicAttribution('org_1', 30)
    expect(a.totalLeads).toBe(4)
    expect(a.organicLeads).toBe(2)
    expect(a.totalBookings).toBe(2)
    expect(a.organicBookings).toBe(1)
    expect(a.windowDays).toBe(30)
  })
})
