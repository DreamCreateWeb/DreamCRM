import { describe, it, expect } from 'vitest'
import {
  INTEGRATIONS_CATALOG,
  CATEGORY_META,
  CATEGORY_ORDER,
  catalogCategories,
  integrationById,
  searchableText,
  type IntegrationDef,
} from '@/lib/integrations/catalog'
import { BrandLogo, type BrandLogoId } from '@/components/integrations/brand-logos'

/**
 * The catalog is the single source of truth for what integrations exist, so
 * these tests guard its INVARIANTS — every def well-formed, logos resolve,
 * categories valid, no fake bulk, the real integrations are present.
 */

const AVAILABILITIES = new Set(['live', 'beta', 'request_access', 'coming_soon'])
const CONNECT_KINDS = new Set(['zernio', 'pms', 'oauth', 'external_link', 'none'])

describe('catalog — every def is well-formed', () => {
  it('has unique ids', () => {
    const ids = INTEGRATIONS_CATALOG.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every def has the required fields with valid enum values', () => {
    for (const def of INTEGRATIONS_CATALOG) {
      expect(def.id, 'id').toBeTruthy()
      expect(def.name, `${def.id} name`).toBeTruthy()
      expect(def.tagline, `${def.id} tagline`).toBeTruthy()
      expect(def.description.length, `${def.id} description`).toBeGreaterThan(10)
      expect(def.keywords.length, `${def.id} keywords`).toBeGreaterThan(0)
      expect(CATEGORY_META[def.category], `${def.id} category`).toBeTruthy()
      expect(AVAILABILITIES.has(def.availability), `${def.id} availability`).toBe(true)
      expect(CONNECT_KINDS.has(def.connectKind), `${def.id} connectKind`).toBe(true)
    }
  })

  it("a coming_soon / request_access def is NOT connectable (connectKind 'none')", () => {
    for (const def of INTEGRATIONS_CATALOG) {
      if (def.availability === 'coming_soon' || def.availability === 'request_access') {
        expect(def.connectKind, `${def.id} should not be connectable`).toBe('none')
      }
    }
  })

  it('a live/beta def IS connectable (a real connect kind)', () => {
    for (const def of INTEGRATIONS_CATALOG) {
      if (def.availability === 'live' || def.availability === 'beta') {
        expect(def.connectKind, `${def.id} should be connectable`).not.toBe('none')
      }
    }
  })

  it('valueLinks (when present) all have href + label', () => {
    for (const def of INTEGRATIONS_CATALOG) {
      for (const link of def.valueLinks ?? []) {
        expect(link.href.startsWith('/'), `${def.id} value href`).toBe(true)
        expect(link.label, `${def.id} value label`).toBeTruthy()
      }
    }
  })
})

describe('catalog — logos resolve', () => {
  it('every def.logo renders a brand logo (the dispatcher returns an element)', () => {
    for (const def of INTEGRATIONS_CATALOG) {
      const el = BrandLogo({ id: def.logo as BrandLogoId, size: 24 })
      // The dispatcher returns null for an unknown id; every catalog logo must resolve.
      expect(el, `${def.id} logo "${def.logo}" must resolve`).not.toBeNull()
    }
  })
})

describe('catalog — category taxonomy', () => {
  it('CATEGORY_ORDER covers every CATEGORY_META key, sorted by order', () => {
    const keys = Object.keys(CATEGORY_META)
    expect(new Set(CATEGORY_ORDER)).toEqual(new Set(keys))
    const orders = CATEGORY_ORDER.map((c) => CATEGORY_META[c].order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('every def category exists in CATEGORY_META', () => {
    for (const def of INTEGRATIONS_CATALOG) {
      expect(CATEGORY_META[def.category]).toBeTruthy()
    }
  })

  it('catalogCategories returns only categories that actually appear, in order', () => {
    const present = catalogCategories()
    const expected = CATEGORY_ORDER.filter((c) => INTEGRATIONS_CATALOG.some((d) => d.category === c))
    expect(present).toEqual(expected)
    // Order is preserved.
    const orders = present.map((c) => CATEGORY_META[c].order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })
})

describe('catalog — the REAL integrations are present (honest, no fake bulk)', () => {
  const expectIds = [
    'open_dental',
    'dentrix_ascend',
    'dentrix_desktop',
    'eaglesoft',
    'curve',
    'googlebusiness',
    'instagram',
    'facebook',
    'tiktok',
    'youtube',
    'linkedin',
    'gmail',
    'sms',
    'stripe_connect',
  ]

  it.each(expectIds)('contains %s', (id) => {
    expect(integrationById(id), id).toBeTruthy()
  })

  it('Open Dental is live + Premium + PMS-kind with a detail page', () => {
    const od = integrationById('open_dental')!
    expect(od.availability).toBe('live')
    expect(od.connectKind).toBe('pms')
    expect(od.minPlan).toBe('premium')
    expect(od.detailHref).toBe('/integrations/open-dental')
  })

  it('Google Business is live + free (no minPlan) + zernio-kind, never counts toward the cap', () => {
    const gbp = integrationById('googlebusiness')!
    expect(gbp.availability).toBe('live')
    expect(gbp.connectKind).toBe('zernio')
    expect(gbp.minPlan).toBeUndefined()
    expect(gbp.countsTowardSocialCap).toBeFalsy()
    expect(gbp.detailHref).toBe('/integrations/google-business')
  })

  it('the 5 social channels are live, zernio-kind, and count toward the social cap', () => {
    for (const id of ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']) {
      const def = integrationById(id)!
      expect(def.availability, id).toBe('live')
      expect(def.connectKind, id).toBe('zernio')
      expect(def.countsTowardSocialCap, id).toBe(true)
    }
  })

  it('Gmail + Stripe are live first-party OAuth integrations', () => {
    expect(integrationById('gmail')!.connectKind).toBe('oauth')
    expect(integrationById('gmail')!.availability).toBe('live')
    expect(integrationById('stripe_connect')!.connectKind).toBe('oauth')
    expect(integrationById('stripe_connect')!.availability).toBe('live')
  })

  it('SMS + the non-Open-Dental PMSs are honest roadmap/request-access (not faked live)', () => {
    expect(integrationById('sms')!.availability).toBe('coming_soon')
    expect(integrationById('dentrix_ascend')!.availability).toBe('request_access')
    for (const id of ['dentrix_desktop', 'eaglesoft', 'curve']) {
      expect(integrationById(id)!.availability, id).toBe('coming_soon')
    }
  })

  it('does NOT pad the catalog with fabricated integrations — only the off-shortlist ' +
    'Zernio social slugs are absent, and nothing invented is present', () => {
    for (const slug of ['x', 'reddit', 'whatsapp', 'pinterest', 'threads', 'snapchat', 'discord', 'telegram', 'bluesky']) {
      expect(integrationById(slug), slug).toBeUndefined()
    }
  })
})

describe('catalog — searchableText', () => {
  it('includes the name, tagline, category label, and keywords (lowercased)', () => {
    const gbp = integrationById('googlebusiness')!
    const text = searchableText(gbp)
    expect(text).toContain('google business profile')
    expect(text).toContain('google') // category label
    expect(text).toContain('maps') // a keyword
    expect(text).toBe(text.toLowerCase())
  })

  it('lets "practice management" match Open Dental via its category label', () => {
    const od = integrationById('open_dental')!
    expect(searchableText(od)).toContain('practice management')
  })
})
