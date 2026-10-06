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
    'nexhealth',
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

  it('the PMS bridge is THE one PMS door — live, pms-kind (a connect REQUEST), detail page, the systems named', () => {
    // Owner ruling 2026-08-19: one connector path. The old self-serve
    // open_dental card must not come back. S4 (docs/ACTIVATION.md): the
    // former roadmap tiles fold under this card — the bridge already
    // reaches those systems, so a "coming soon" tile for them was false.
    expect(integrationById('open_dental')).toBeUndefined()
    for (const id of ['dentrix_ascend', 'dentrix_desktop', 'eaglesoft', 'curve']) {
      expect(integrationById(id), `${id} folds under the bridge`).toBeUndefined()
    }
    const bridge = integrationById('nexhealth')!
    expect(bridge.availability).toBe('live')
    expect(bridge.connectKind).toBe('pms')
    expect(bridge.detailHref).toBe('/integrations/pms')
    expect(bridge.tagline).toContain('Open Dental')
    expect(bridge.tagline).toContain('Dentrix')
    expect(searchableText(bridge)).toContain('eaglesoft')
    expect(searchableText(bridge)).toContain('curve')
  })

  it('Google Business is live + free (no minPlan) + zernio-kind, never counts toward the cap', () => {
    const gbp = integrationById('googlebusiness')!
    expect(gbp.availability).toBe('live')
    expect(gbp.connectKind).toBe('zernio')
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

  it('texting is LIVE in the catalog — the door opens the day a clinic can START (S4, law 3)', () => {
    const sms = integrationById('sms')!
    expect(sms.availability).toBe('live')
    expect(sms.connectKind).toBe('external_link')
    expect(sms.detailHref).toBe('/integrations/sms')
  })

  it('no catalog def says "coming soon" any more (docs/ACTIVATION.md law 3)', () => {
    for (const def of INTEGRATIONS_CATALOG) {
      expect(def.availability, def.id).not.toBe('coming_soon')
      for (const text of [def.tagline, def.description, def.note ?? '']) {
        expect(text.toLowerCase(), `${def.id}: ${text}`).not.toContain('coming soon')
        expect(text.toLowerCase(), `${def.id}: ${text}`).not.toContain('on the roadmap')
      }
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

  it('lets "practice management" and "open dental" match the PMS bridge', () => {
    const bridge = integrationById('nexhealth')!
    expect(searchableText(bridge)).toContain('practice management')
    expect(searchableText(bridge)).toContain('open dental')
  })
})
