import { describe, it, expect } from 'vitest'
import { publicSiteUrl, clinicJsonLd } from '@/lib/services/clinic-site'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

function makeData(overrides: Partial<ClinicSiteData['profile']> = {}): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Test Dental',
    slug: 'test-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      legalName: null,
      displayName: 'Test Dental',
      tagline: 'Caring for smiles',
      about: null,
      npi: null,
      brandColor: '#9CAF9F',
      template: 'modern',
      phone: '(555) 123-4567',
      email: 'hello@test.com',
      websiteDomain: null,
      addressLine1: '100 Main St',
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
      hours: {
        mon: { open: '08:00', close: '17:00' },
        tue: { open: '08:00', close: '17:00' },
        sun: { closed: true },
      } as never,
      planTier: 'premium',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      services: null,
      staff: null,
      stats: null,
      testimonials: null,
      officePhotos: null,
      createdAt: new Date('2026-05-01'),
      updatedAt: new Date('2026-05-15'),
      ...overrides,
    } as ClinicSiteData['profile'],
  }
}

describe('publicSiteUrl', () => {
  it('returns subdomain URL when no custom domain is set', () => {
    expect(publicSiteUrl(makeData())).toBe('https://test-dental.dreamcreatestudio.com')
  })

  it('prefers a custom domain when configured', () => {
    expect(publicSiteUrl(makeData({ websiteDomain: 'acmedental.com' }))).toBe(
      'https://acmedental.com',
    )
  })

  it('does not return a trailing slash', () => {
    expect(publicSiteUrl(makeData())).not.toMatch(/\/$/)
  })
})

describe('clinicJsonLd', () => {
  it('builds a Dentist schema with the basics', () => {
    const ld = clinicJsonLd(makeData())
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('Dentist')
    expect(ld.name).toBe('Test Dental')
    expect(ld.url).toBe('https://test-dental.dreamcreatestudio.com')
    expect(ld['@id']).toBe('https://test-dental.dreamcreatestudio.com/#dentist')
    expect(ld.telephone).toBe('(555) 123-4567')
    expect(ld.email).toBe('hello@test.com')
  })

  it('emits a PostalAddress block when address data is present', () => {
    const ld = clinicJsonLd(makeData())
    const address = ld.address as Record<string, unknown>
    expect(address['@type']).toBe('PostalAddress')
    expect(address.streetAddress).toBe('100 Main St')
    expect(address.addressLocality).toBe('Austin')
    expect(address.addressRegion).toBe('TX')
    expect(address.postalCode).toBe('78701')
    expect(address.addressCountry).toBe('US')
  })

  it('omits the address block when no address data is available', () => {
    const ld = clinicJsonLd(
      makeData({
        addressLine1: null,
        city: null,
        state: null,
        postalCode: null,
      }),
    )
    expect(ld.address).toBeUndefined()
  })

  it('emits OpeningHoursSpecification for open days, skips closed/empty days', () => {
    const ld = clinicJsonLd(makeData())
    const spec = ld.openingHoursSpecification as Array<Record<string, unknown>>
    expect(spec).toHaveLength(2)
    expect(spec[0].dayOfWeek).toBe('Monday')
    expect(spec[0].opens).toBe('08:00')
    expect(spec[0].closes).toBe('17:00')
    expect(spec.some((s) => s.dayOfWeek === 'Sunday')).toBe(false)
  })

  it('omits openingHoursSpecification entirely when no hours are set', () => {
    const ld = clinicJsonLd(makeData({ hours: null as never }))
    expect(ld.openingHoursSpecification).toBeUndefined()
  })

  it('derives aggregateRating reviewCount when a stat row mentions reviews', () => {
    const ld = clinicJsonLd(
      makeData({
        stats: [
          { id: 's1', value: '8,000+', label: 'five-star reviews' },
        ] as never,
      }),
    )
    const rating = ld.aggregateRating as Record<string, unknown>
    expect(rating['@type']).toBe('AggregateRating')
    expect(rating.reviewCount).toBe('8000')
    expect(rating.ratingValue).toBeDefined()
  })

  it('does not invent an aggregateRating when no stat row mentions reviews', () => {
    const ld = clinicJsonLd(
      makeData({
        stats: [
          { id: 's1', value: 'Same-week', label: 'appointments' },
        ] as never,
      }),
    )
    expect(ld.aggregateRating).toBeUndefined()
  })

  it('prefers primary-location address over profile-level address', () => {
    const data = makeData()
    data.primaryLocation = {
      id: 'loc_1',
      organizationId: 'org_1',
      name: 'Downtown',
      addressLine1: '200 Congress Ave',
      addressLine2: null,
      city: 'Round Rock',
      state: 'TX',
      postalCode: '78664',
      phone: '(555) 999-1111',
      isPrimary: 1,
      createdAt: new Date(),
    }
    const ld = clinicJsonLd(data)
    const address = ld.address as Record<string, unknown>
    expect(address.streetAddress).toBe('200 Congress Ave')
    expect(address.addressLocality).toBe('Round Rock')
    expect(ld.telephone).toBe('(555) 999-1111')
  })

  it('uses logo URL for both logo and image fields when present', () => {
    const ld = clinicJsonLd(makeData({ logoUrl: 'https://blob/logo.png' }))
    expect(ld.logo).toBe('https://blob/logo.png')
    expect(ld.image).toBe('https://blob/logo.png')
  })

  it('uses tagline as description, falls back to about excerpt', () => {
    const ld1 = clinicJsonLd(makeData())
    expect(ld1.description).toBe('Caring for smiles')

    const longAbout = 'A'.repeat(300)
    const ld2 = clinicJsonLd(makeData({ tagline: null, about: longAbout }))
    expect((ld2.description as string).length).toBe(200)
  })
})
