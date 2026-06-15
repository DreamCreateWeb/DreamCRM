import { describe, it, expect } from 'vitest'
import { clinicJsonLd } from '@/lib/services/clinic-site'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

/**
 * AggregateRating in clinicJsonLd — emitted ONLY from real synced Google
 * reviews passed by the caller; omitted (never fabricated) at zero. Complements
 * tests/clinic-site/seo.test.ts (which guards the no-args path stays
 * rating-free).
 */

function makeData(): ClinicSiteData {
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
      hours: null,
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
    } as ClinicSiteData['profile'],
  }
}

describe('clinicJsonLd aggregateRating', () => {
  it('emits a legit AggregateRating from real synced Google reviews', () => {
    const ld = clinicJsonLd(makeData(), { averageRating: 4.8, count: 23 })
    const ar = ld.aggregateRating as Record<string, unknown>
    expect(ar).toBeTruthy()
    expect(ar['@type']).toBe('AggregateRating')
    expect(ar.ratingValue).toBe(4.8)
    expect(ar.reviewCount).toBe(23)
    expect(ar.bestRating).toBe(5)
    expect(ar.worstRating).toBe(1)
  })

  it('omits AggregateRating when no rating is passed (back-compat with the 1-arg call)', () => {
    expect(clinicJsonLd(makeData()).aggregateRating).toBeUndefined()
    expect(clinicJsonLd(makeData(), null).aggregateRating).toBeUndefined()
  })

  it('omits AggregateRating at zero reviews — never fabricated', () => {
    expect(clinicJsonLd(makeData(), { averageRating: null, count: 0 }).aggregateRating).toBeUndefined()
  })

  it('omits AggregateRating when the average is null even if count is set (defensive)', () => {
    expect(clinicJsonLd(makeData(), { averageRating: null, count: 5 }).aggregateRating).toBeUndefined()
  })

  it('keeps the rest of the Dentist schema intact alongside the rating', () => {
    const ld = clinicJsonLd(makeData(), { averageRating: 5, count: 1 })
    expect(ld['@type']).toBe('Dentist')
    expect(ld.name).toBe('Test Dental')
    expect((ld.address as Record<string, unknown>).streetAddress).toBe('100 Main St')
    expect(ld.aggregateRating).toBeTruthy()
  })
})
