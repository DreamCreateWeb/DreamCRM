import type { ClinicSiteData } from '@/lib/services/clinic-site'

/**
 * Shared clinic fixtures for the template conformance harness (and any test
 * that needs a full ClinicSiteData). Three deliberate shapes:
 *
 *  - emptyClinic: a day-0 sign-up — no staff, photos, services, testimonials,
 *    stats, or brand color. Every template must render this WITHOUT crashing
 *    or showing broken affordances (empty-state discipline).
 *  - richClinic: everything populated the way a mature clinic looks —
 *    exercises every content-driven section.
 *  - edgeClinic: degenerate content — 1-char name, screaming-yellow brand
 *    (contrast-raising edge), a huge service list, no primary location.
 */

function baseProfile(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org_fixture',
    legalName: null,
    displayName: 'Fixture Dental',
    tagline: 'Dentistry that feels human',
    about: 'We are a friendly local dentist office. Come as you are.',
    npi: null,
    brandColor: '#6d28d9',
    template: 'modern',
    phone: '(555) 123-4567',
    email: 'hello@fixture.test',
    websiteDomain: null,
    addressLine1: '12 Main St',
    addressLine2: null,
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
    hours: { mon: { open: '09:00', close: '17:00' }, tue: { open: '09:00', close: '17:00' } },
    planTier: 'pro',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    logoUrl: null,
    heroImageUrl: null,
    differenceVideoUrl: null,
    services: null,
    staff: null,
    stats: null,
    testimonials: null,
    officePhotos: null,
    faq: null,
    copyOverrides: null,
    differenceChips: null,
    acceptedInsuranceCarriers: null,
    paymentMethods: null,
    financingPartners: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  }
}

function makeSite(
  profileOverrides: Record<string, unknown>,
  siteOverrides: Partial<Omit<ClinicSiteData, 'profile'>> = {},
): ClinicSiteData {
  return {
    orgId: 'org_fixture',
    orgName: 'Fixture Dental',
    slug: 'fixture-dental',
    primaryLocation: null,
    locations: [],
    ...siteOverrides,
    profile: baseProfile(profileOverrides) as ClinicSiteData['profile'],
  }
}

/** Day-0 clinic: nothing authored yet, no brand color, basic tier. */
export function emptyClinic(): ClinicSiteData {
  return makeSite({
    displayName: 'New Smile Dental',
    tagline: null,
    about: null,
    brandColor: null,
    planTier: 'basic',
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    hours: null,
    phone: null,
    email: null,
  })
}

/** Mature clinic: every content-driven surface populated. */
export function richClinic(): ClinicSiteData {
  return makeSite({
    planTier: 'premium',
    logoUrl: 'https://cdn.test/logo.png',
    heroImageUrl: 'https://cdn.test/hero.jpg',
    services: [
      { id: 's1', name: 'Checkups & Cleanings', librarySlug: 'checkups-cleanings', category: 'core' },
      { id: 's2', name: 'Veneers', librarySlug: 'veneers', category: 'special' },
      { id: 's3', name: 'Invisalign', librarySlug: 'invisalign', category: 'special' },
      { id: 's4', name: 'Whitening', librarySlug: 'whitening', category: 'core' },
      { id: 's5', name: 'Implants', librarySlug: 'implants', category: 'special' },
      { id: 's6', name: 'Emergency care', librarySlug: 'emergency', category: 'core' },
      { id: 's7', name: 'Crowns', librarySlug: 'crowns', category: 'core' },
    ],
    staff: [
      {
        id: 'st1',
        name: 'Dr. Maya Patel',
        title: 'DDS — Lead Dentist',
        bio: 'Gentle, judgment-free dentistry for 15 years. Maya believes every smile has a story.',
        photoUrl: 'https://cdn.test/maya.jpg',
      },
      { id: 'st2', name: 'Jordan Reyes', title: 'Office Manager', bio: 'Keeps the day humming.' },
    ],
    stats: [
      { id: 'x1', value: '15+', label: 'years of care' },
      { id: 'x2', value: '0', label: 'happy patients', dynamic: 'review_count' },
    ],
    testimonials: [
      { id: 't1', quote: 'The kindest dental visit of my life.', author: 'Sam W.' },
      { id: 't2', quote: 'I stopped dreading the dentist.', author: 'Priya K.' },
    ],
    officePhotos: [
      { id: 'p1', url: 'https://cdn.test/office-1.jpg' },
      { id: 'p2', url: 'https://cdn.test/office-2.jpg' },
      { id: 'p3', url: 'https://cdn.test/office-3.jpg' },
    ],
    faq: [
      { id: 'f1', category: 'visits', question: 'Do you see kids?', answer: 'Absolutely — all ages.' },
    ],
    differenceChips: ['No judgment, ever', 'Same-week visits', 'Transparent pricing'],
    acceptedInsuranceCarriers: ['Delta Dental', 'Cigna', 'Aetna'],
    paymentMethods: ['Cash', 'Card', 'HSA/FSA'],
  })
}

/** Degenerate content: 1-char name, screaming-yellow brand, 40 services,
 *  no primary location row. */
export function edgeClinic(): ClinicSiteData {
  return makeSite({
    displayName: 'Q',
    tagline: 'Q',
    brandColor: '#FFE900',
    planTier: 'pro',
    services: Array.from({ length: 40 }, (_, i) => ({
      id: `svc${i}`,
      name: `Service ${i}`,
      category: i % 3 === 0 ? 'special' : 'core',
    })),
    staff: [{ id: 'st1', name: 'X' }],
  })
}

export const FIXTURES = {
  empty: emptyClinic,
  rich: richClinic,
  edge: edgeClinic,
} as const
