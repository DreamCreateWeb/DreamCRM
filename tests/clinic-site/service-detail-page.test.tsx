/**
 * Smoke tests for the service detail page
 * (`app/site/[slug]/services/[serviceSlug]/page.tsx`).
 *
 * Confirms: the Tend skeleton renders for a library-linked service (H1
 * "{Service} at {Clinic}", process steps, FAQ heading); the minimal render for
 * a free-text service (hero only, no process/FAQ); the notFound path when the
 * routing slug doesn't match a clinic service.
 *
 * `resolveClinicServices` is NOT mocked — it falls back to the in-code
 * SERVICE_LIBRARY_SEED when the DB is unavailable (as in tests), so the page
 * gets real library content for slugs like 'teeth-whitening'.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { ClinicService } from '@/lib/types/clinic-content'

function makeData(services: ClinicService[]): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Acme Dental',
    slug: 'acme-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      legalName: null,
      displayName: 'Acme Dental',
      tagline: null,
      about: null,
      npi: null,
      brandColor: '#9CAF9F',
      template: 'modern',
      phone: '(555) 555-0100',
      email: null,
      websiteDomain: null,
      addressLine1: null,
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: null,
      country: 'US',
      hours: null,
      planTier: 'pro',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      heroImageUrl2: null,
      imagePositions: null,
      differenceVideoUrl: null,
      services: services as never,
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
      cancellationPolicy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ClinicSiteData['profile'],
  }
}

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw notFoundError
  }),
}))

vi.mock('@/lib/services/clinic-site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/clinic-site')>(
    '@/lib/services/clinic-site',
  )
  return {
    ...actual,
    getClinicSiteBySlug: vi.fn(),
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
    appBaseUrl: vi.fn(() => 'https://app.example.com'),
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
  }
})

vi.mock('@/lib/services/blog', () => ({
  listPublishedPosts: vi.fn(async () => []),
}))

vi.mock('@/lib/services/membership', () => ({
  listActivePlans: vi.fn(async () => []),
}))

vi.mock('@/lib/services/careers', () => ({
  getOpenJobs: vi.fn(async () => []),
}))

import ServiceDetailPage from '@/app/site/[slug]/services/[serviceSlug]/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(data: ClinicSiteData, serviceSlug: string) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  const ui = await ServiceDetailPage({
    params: Promise.resolve({ slug: 'acme-dental', serviceSlug }),
  })
  return render(ui as React.ReactElement)
}

describe('ServiceDetailPage — library-linked service', () => {
  const data = makeData([
    { id: 'a', name: 'Teeth Whitening', librarySlug: 'teeth-whitening' },
    { id: 'b', name: 'Hygiene & Cleaning', librarySlug: 'dental-hygiene' },
  ])

  it('renders the H1 "{Service} at {Clinic}"', async () => {
    await renderPage(data, 'teeth-whitening')
    expect(
      screen.getByRole('heading', { level: 1, name: /Teeth Whitening at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('renders the numbered "What to expect" process steps', async () => {
    await renderPage(data, 'teeth-whitening')
    expect(screen.getByRole('heading', { name: /What to expect/i })).toBeInTheDocument()
    // The seed gives teeth-whitening 4 steps → numerals 01..04 render.
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('04')).toBeInTheDocument()
  })

  it('renders the FAQ section titled "Have questions about {Service}?"', async () => {
    await renderPage(data, 'teeth-whitening')
    expect(
      screen.getByRole('heading', { name: /Have questions about Teeth Whitening\?/i }),
    ).toBeInTheDocument()
    // At least one question from the seed surfaces.
    expect(screen.getByText(/Is professional whitening safe/i)).toBeInTheDocument()
  })

  it('emits MedicalProcedure JSON-LD naming the service + provider', async () => {
    const { container } = await renderPage(data, 'teeth-whitening')
    const ld = container.querySelector('script[type="application/ld+json"]')
    expect(ld).not.toBeNull()
    const json = JSON.parse(ld!.textContent ?? '{}')
    expect(json['@type']).toBe('MedicalProcedure')
    expect(json.name).toBe('Teeth Whitening')
    expect(json.provider?.name).toBe('Acme Dental')
  })

  it('shows a related-services card for an adjacency the clinic also offers', async () => {
    // teeth-whitening relatedSlugs include 'dental-hygiene', which this clinic
    // offers, so it should appear in the related section.
    await renderPage(data, 'teeth-whitening')
    expect(
      screen.getByRole('heading', { name: /You might also be interested in/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Hygiene & Cleaning').length).toBeGreaterThan(0)
  })

  it('renders a promo ribbon when the service carries an offer', async () => {
    const withOffer = makeData([
      {
        id: 'a',
        name: 'Teeth Whitening',
        librarySlug: 'teeth-whitening',
        offer: 'New patient special',
      },
    ])
    await renderPage(withOffer, 'teeth-whitening')
    expect(screen.getByText('New patient special')).toBeInTheDocument()
  })
})

describe('ServiceDetailPage — free-text service', () => {
  const data = makeData([{ id: 'x', name: 'Custom Smile Spa', description: 'Signature package' }])

  it('renders the hero H1 but no process/FAQ for a minimal service', async () => {
    await renderPage(data, 'custom-smile-spa')
    expect(
      screen.getByRole('heading', { level: 1, name: /Custom Smile Spa at Acme Dental/i }),
    ).toBeInTheDocument()
    // The library-only sections must NOT render.
    expect(screen.queryByRole('heading', { name: /What to expect/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Have questions about/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the free-text description in the hero', async () => {
    await renderPage(data, 'custom-smile-spa')
    expect(screen.getByText('Signature package')).toBeInTheDocument()
  })
})

describe('ServiceDetailPage — notFound', () => {
  it('calls notFound when no service matches the routing slug', async () => {
    const data = makeData([{ id: 'a', name: 'Teeth Whitening', librarySlug: 'teeth-whitening' }])
    await expect(renderPage(data, 'this-service-does-not-exist')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })

  it('calls notFound when the clinic site is missing', async () => {
    ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(
      ServiceDetailPage({
        params: Promise.resolve({ slug: 'nope', serviceSlug: 'teeth-whitening' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
