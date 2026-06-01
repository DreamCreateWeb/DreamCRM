/**
 * Smoke tests for the /services index page. Confirms the H1 carries the
 * clinic name, every configured service renders, and the tier-aware Book CTA
 * points to /book for pro+ clinics and #contact on the homepage for basic.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

function makeData(overrides: Partial<ClinicSiteData['profile']> = {}): ClinicSiteData {
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
      city: null,
      state: null,
      postalCode: null,
      country: 'US',
      hours: null,
      planTier: 'pro',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      services: [
        { id: 's1', name: 'Routine Cleanings', description: 'Twice-yearly visits' },
        { id: 's2', name: 'Cosmetic Whitening', description: 'Brighter in one visit' },
        { id: 's3', name: 'Invisalign', description: null },
        { id: 's4', name: 'Implants', description: 'Permanent solutions' },
        { id: 's5', name: 'Root Canals', description: null },
        { id: 's6', name: 'Crowns', description: null },
        { id: 's7', name: 'Veneers', description: null },
      ] as never,
      staff: null,
      stats: null,
      testimonials: null,
      officePhotos: null,
      faq: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as ClinicSiteData['profile'],
  }
}

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

import ServicesPage from '@/app/site/[slug]/services/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(data: ClinicSiteData | null = makeData()) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  const ui = await ServicesPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('ServicesPage', () => {
  it('renders the H1 with the clinic name', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Dental services at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('lists ALL configured services (no 6-cap on the index page)', async () => {
    await renderPage()
    // Services now also surface in the footer's Services column (up to 8),
    // so the first 7 here appear in both places. Accept ≥1 match.
    expect(screen.getAllByText('Routine Cleanings').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cosmetic Whitening').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Invisalign').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Implants').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Root Canals').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Crowns').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Veneers').length).toBeGreaterThanOrEqual(1)
  })

  it('renders numbered pillars (01, 02, …07)', async () => {
    await renderPage()
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('07')).toBeInTheDocument()
  })

  it('shows service descriptions when set', async () => {
    await renderPage()
    expect(screen.getByText('Twice-yearly visits')).toBeInTheDocument()
  })

  it('tier-gated Book CTA points to /book for pro tier', async () => {
    await renderPage(makeData({ planTier: 'pro' }))
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental/book')
    expect(bookLinks.length).toBeGreaterThan(0)
  })

  it('tier-gated Book CTA points to homepage #contact for basic tier', async () => {
    await renderPage(makeData({ planTier: 'basic' }))
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental#contact')
    expect(bookLinks.length).toBeGreaterThan(0)
    // …and there's no /book link anywhere on a basic-tier services page.
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/site/acme-dental/book'),
    ).toHaveLength(0)
  })

  it('falls back to DEFAULT_SERVICES when none are configured', async () => {
    await renderPage(makeData({ services: null as never }))
    expect(screen.getByText('Cleanings & Exams')).toBeInTheDocument()
    expect(screen.getByText('Cosmetic Dentistry')).toBeInTheDocument()
  })
})
