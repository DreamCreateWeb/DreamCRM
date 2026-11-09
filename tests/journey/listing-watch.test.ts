import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseGbpListingSnapshot } from '@/lib/gbp-listing'
import { diffListing } from '@/lib/gbp-listing-diff'

vi.mock('server-only', () => ({}))

const store: { ledger: Array<{ detail: unknown }>; recorded: Array<Record<string, any>>; throwRead: boolean } = {
  ledger: [],
  recorded: [],
  throwRead: false,
}
vi.mock('@/lib/db', () => {
  const api: any = {}
  api.select = () => api
  api.from = () => api
  api.where = () => api
  api.orderBy = () => api
  api.limit = async () => {
    if (store.throwRead) throw new Error('down')
    return store.ledger
  }
  const col = (n: string) => n
  return {
    db: api,
    schema: { actionLedger: { detail: col('detail'), organizationId: col('o'), capability: col('c'), occurredAt: col('t') } },
  }
})
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: vi.fn(async (r: Record<string, any>) => {
    store.recorded.push(r)
    return true
  }),
}))

import { generateListingWatch, listingWatchSummary, listingWatchDoor } from '@/lib/services/proposal-generators/listing-watch'

const base = {
  websiteUri: 'https://x.com',
  placeId: 'p',
  reviewUrl: null,
  mapsUri: null,
  isVerified: true,
  title: 'Acme Dental',
  fetchedAt: '2026-11-09T00:00:00Z',
  hours: [
    { day: 'mon', open: '08:00', close: '17:00' },
    { day: 'tue', open: '08:00', close: '17:00' },
  ],
  phone: '(512) 555-0100',
  primaryCategory: 'Dentist',
  additionalCategories: ['Cosmetic dentist', 'Orthodontist'],
  storefrontAddress: '500 Main St, Austin, TX 78701',
}
const snap = (over: Record<string, unknown> = {}) => parseGbpListingSnapshot({ ...base, ...over })!

beforeEach(() => {
  store.ledger = []
  store.recorded = []
  store.throwRead = false
})

describe('diffListing', () => {
  it('no change → nothing; fetchedAt, category order and phone punctuation are noise', () => {
    expect(diffListing(snap(), snap())).toEqual([])
    expect(
      diffListing(
        snap(),
        snap({
          fetchedAt: '2026-11-10T00:00:00Z',
          additionalCategories: ['Orthodontist', 'Cosmetic dentist'],
          phone: '512-555-0100',
          hours: [...base.hours].reverse(),
        }),
      ),
    ).toEqual([])
  })
  it('hours: names the days that moved, was → now', () => {
    const d = diffListing(snap(), snap({ hours: [{ day: 'mon', open: '09:00', close: '17:00' }, base.hours[1]] }))
    expect(d).toEqual([{ field: 'hours', was: 'Mon 8–5', now: 'Mon 9–5' }])
    expect(listingWatchSummary(d)).toBe("Google changed your listing's hours: Mon 8–5 → Mon 9–5")
  })
  it('phone, categories, name, address, website each report', () => {
    const d = diffListing(
      snap(),
      snap({
        phone: '(512) 555-0199',
        primaryCategory: 'Oral surgeon',
        title: 'Acme Dental Group',
        storefrontAddress: '12 Elm St, Austin, TX 78701',
        websiteUri: 'https://other.com',
      }),
    )
    expect(d.map((c) => c.field).sort()).toEqual(['address', 'categories', 'name', 'phone', 'website'])
  })
  it('unknown is not gone: an empty/null NOW never reports a removal', () => {
    const d = diffListing(
      snap(),
      snap({ hours: [], phone: null, primaryCategory: null, additionalCategories: [], title: null, storefrontAddress: null, websiteUri: null }),
    )
    expect(d).toEqual([])
  })
  it('no prior, or a pre-widening prior → no diff (a baseline is not an announcement)', () => {
    expect(diffListing(null, snap())).toEqual([])
    const old = parseGbpListingSnapshot({ websiteUri: 'https://x.com', title: 'Acme Dental' })!
    expect(diffListing(old, snap({ phone: '(999) 000-0000' }))).toEqual([])
  })
})

describe('generateListingWatch', () => {
  const NOW = new Date('2026-11-09T15:00:00Z')
  const changes = [{ field: 'hours' as const, was: 'Mon 8–5', now: 'Mon 9–5' }]

  it('no change → nothing written, nothing read', async () => {
    expect(await generateListingWatch('org1', [], NOW)).toBe(0)
    expect(store.recorded).toHaveLength(0)
  })
  it('one entry under listing_watch with the was→now artifact rows and a quiet door', async () => {
    expect(await generateListingWatch('org1', changes, NOW)).toBe(1)
    expect(store.recorded).toHaveLength(1)
    const r = store.recorded[0]
    expect(r.organizationId).toBe('org1')
    expect(r.capability).toBe('listing_watch')
    expect(r.summary).toBe("Google changed your listing's hours: Mon 8–5 → Mon 9–5")
    expect(r.detail.artifact).toBe('listing')
    expect(r.detail.changes).toEqual([{ field: 'hours', before: 'Mon 8–5', after: 'Mon 9–5' }])
    expect(r.detail.openHref).toEqual({ href: '/settings/clinic', label: 'Check your business profile' })
  })
  it('narrate once: a (field, now) already told in the window is dropped; a new one still goes', async () => {
    store.ledger = [{ detail: { keys: ['hours|Mon 9–5'] } }]
    expect(await generateListingWatch('org1', changes, NOW)).toBe(0)
    expect(store.recorded).toHaveLength(0)
    const both = [...changes, { field: 'phone' as const, was: '1', now: '(512) 555-0199' }]
    expect(await generateListingWatch('org1', both, NOW)).toBe(1)
    expect(store.recorded[0].detail.changes.map((c: any) => c.field)).toEqual(['phone'])
  })
  it('a failed dedupe read narrates nothing (never risks a double) and tells the driver', async () => {
    store.throwRead = true
    const soft = vi.fn()
    expect(await generateListingWatch('org1', changes, NOW, soft)).toBe(0)
    expect(soft).toHaveBeenCalledOnce()
    expect(store.recorded).toHaveLength(0)
  })
  it('doors: website → the Google workspace; categories/name/address → none', () => {
    expect(listingWatchDoor(['website'])?.href).toBe('/growth/reviews')
    expect(listingWatchDoor(['categories', 'name', 'address'])).toBeNull()
  })
})

describe('report-only (pinned)', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
  it('the watch never imports or calls Zernio, and no write verb appears', () => {
    const src = read('lib/services/proposal-generators/listing-watch.ts')
    // Strip comments: the doc block names Zernio to say it is NOT used.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/zernio/i)
    expect(code).not.toMatch(/updateGoogleBusiness|setGoogleBusiness|patchGoogleBusiness/)
    expect(read('lib/gbp-listing-diff.ts')).not.toMatch(/zernio/i)
  })
  it('syncGoogleBusinessProfile runs the watch after the snapshot write', () => {
    const src = read('lib/services/gbp-sync.ts')
    const write = src.indexOf('.set(patch)')
    const watch = src.indexOf('generateListingWatch(')
    expect(write).toBeGreaterThan(-1)
    expect(watch).toBeGreaterThan(write)
  })
})
