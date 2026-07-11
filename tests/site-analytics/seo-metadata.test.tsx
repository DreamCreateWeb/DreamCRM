import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

// Build a full clinic profile, with optional seoMeta overrides, for the
// generateMetadata blocks under test.
function makeData(seoMeta: unknown = null): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Acme Dental',
    slug: 'acme-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      displayName: 'Acme Dental',
      tagline: 'Care that feels like care',
      about: 'We started Acme to make dentistry calm. Plain-English care, no judgment.',
      heroImageUrl: null,
      logoUrl: null,
      websiteDomain: null,
      seoMeta,
    } as unknown as ClinicSiteData['profile'],
  }
}

vi.mock('@/lib/services/clinic-site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/clinic-site')>(
    '@/lib/services/clinic-site',
  )
  return {
    ...actual,
    // The template-dispatching chrome resolves the active template per
    // request; a null orgId short-circuits it to the modern default with no
    // cookie/auth reads.
    getClinicThemeBySlug: vi.fn(async () => ({ orgId: null, brand: null, template: null })),
    getClinicSiteBySlug: vi.fn(),
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
    appBaseUrl: vi.fn(() => 'https://app.example.com'),
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
    clinicJsonLd: vi.fn(() => ({})),
  }
})
vi.mock('@/lib/services/blog', () => ({
  listPublishedPosts: vi.fn(async () => []),
  listPublishedCategories: vi.fn(async () => []),
  getPostAuthor: vi.fn(async () => null),
}))
vi.mock('@/lib/services/membership', () => ({ listActivePlans: vi.fn(async () => []) }))
vi.mock('@/lib/services/careers', () => ({ getOpenJobs: vi.fn(async () => []) }))
vi.mock('@/lib/services/reviews', () => ({ getCompletedReviewCount: vi.fn(async () => 0) }))

import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
import { generateMetadata as homeMeta } from '@/app/site/[slug]/page'
import { generateMetadata as bookMeta } from '@/app/site/[slug]/book/page'
import { generateMetadata as payMeta } from '@/app/site/[slug]/payment-financing/page'

const setData = (d: ClinicSiteData | null) =>
  (getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(d)

const params = Promise.resolve({ slug: 'acme-dental' })

beforeEach(() => {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockReset()
})

describe('generateMetadata fallback (no overrides)', () => {
  it('home derives title from tagline', async () => {
    setData(makeData(null))
    const m = (await homeMeta({ params })) as { title: string; description: string }
    expect(m.title).toBe('Acme Dental — Care that feels like care')
  })

  it('book derives the standard title/description', async () => {
    setData(makeData(null))
    const m = (await bookMeta({ params })) as { title: string; description: string }
    expect(m.title).toBe('Book a Visit — Acme Dental')
    expect(m.description).toContain('Book your appointment online with Acme Dental')
  })

  it('payment-financing derives its title', async () => {
    setData(makeData(null))
    const m = (await payMeta({ params })) as { title: string }
    expect(m.title).toBe('Payment & Financing — Acme Dental')
  })
})

describe('generateMetadata override wins', () => {
  it('home uses the clinic override title + description', async () => {
    setData(makeData({ home: { title: 'Austin Family Dentist', description: 'Same-week visits.' } }))
    const m = (await homeMeta({ params })) as { title: string; description: string; openGraph: any; twitter: any }
    expect(m.title).toBe('Austin Family Dentist')
    expect(m.description).toBe('Same-week visits.')
    // OG + Twitter inherit the resolved values too.
    expect(m.openGraph.title).toBe('Austin Family Dentist')
    expect(m.twitter.description).toBe('Same-week visits.')
  })

  it('book uses the override and is keyed by "book"', async () => {
    setData(makeData({ book: { title: 'Reserve your spot' } }))
    const m = (await bookMeta({ params })) as { title: string; description: string }
    expect(m.title).toBe('Reserve your spot')
    // description left blank → falls back to derived
    expect(m.description).toContain('Book your appointment online')
  })

  it('payment-financing reads the bracketed "payment-financing" key', async () => {
    setData(makeData({ 'payment-financing': { title: 'Ways to pay' } }))
    const m = (await payMeta({ params })) as { title: string }
    expect(m.title).toBe('Ways to pay')
  })

  it('a junk seoMeta blob falls back cleanly to derived', async () => {
    setData(makeData('garbage'))
    const m = (await homeMeta({ params })) as { title: string }
    expect(m.title).toBe('Acme Dental — Care that feels like care')
  })

  it('returns {} when the clinic does not exist', async () => {
    setData(null)
    expect(await homeMeta({ params })).toEqual({})
  })
})
