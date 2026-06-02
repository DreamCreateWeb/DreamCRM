/**
 * Smoke tests for the /dental-plans page — Tend-style copy of the
 * membership flow. Renders the same plan cards as /membership when
 * active plans exist; 404s when none / when membership not enabled.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { PlanRow } from '@/lib/types/membership'

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
      city: 'Austin',
      state: 'TX',
      postalCode: null,
      country: 'US',
      hours: null,
      planTier: 'premium',
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
      acceptedInsuranceCarriers: null,
      paymentMethods: null,
      financingPartners: null,
      cancellationPolicy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
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

const getShopConfigMock = vi.fn()
vi.mock('@/lib/services/shop', () => ({
  getShopConfig: (...args: unknown[]) => getShopConfigMock(...(args as [])),
}))

const listActivePlansMock = vi.fn(async () => [] as PlanRow[])
vi.mock('@/lib/services/membership', () => ({
  listActivePlans: (...args: unknown[]) => listActivePlansMock(...(args as [])),
}))

import DentalPlansPage from '@/app/site/[slug]/dental-plans/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

function planRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'plan-1',
    name: 'Smile Club',
    slug: 'smile-club',
    description: 'Preventive care covered, savings on every other treatment.',
    billingInterval: 'annual',
    priceCents: 39900,
    benefits: [
      { label: '2 cleanings', qty: 2 },
      { label: '2 exams', qty: 2 },
      { label: '10% off all treatment' },
    ],
    discountPercent: 10,
    status: 'active',
    featured: false,
    position: 0,
    memberCount: 12,
    ...overrides,
  }
}

async function renderPage(
  data: ClinicSiteData | null = makeData(),
  plans: PlanRow[] = [planRow()],
  shopConfig: { membershipEnabled: boolean } = { membershipEnabled: true },
) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  getShopConfigMock.mockResolvedValueOnce(shopConfig as never)
  listActivePlansMock.mockResolvedValueOnce(plans as never)
  const ui = await DentalPlansPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('DentalPlansPage', () => {
  it('renders the H1 with "Dental plans at {clinic}" Tend voice', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Dental plans at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('renders the membership plan card from listActivePlans', async () => {
    await renderPage()
    expect(screen.getAllByText(/Smile Club/i).length).toBeGreaterThan(0)
  })

  it('404s when no active plans exist (notFound is thrown)', async () => {
    await expect(renderPage(makeData(), [])).rejects.toThrow(notFoundError)
  })

  it('404s when membership is not enabled on the shop config', async () => {
    await expect(
      renderPage(makeData(), [planRow()], { membershipEnabled: false }),
    ).rejects.toThrow(notFoundError)
  })

  it('renders the "Why patients choose this" reassurance band', async () => {
    await renderPage()
    // Some of these phrases may appear in nested children (e.g. ", no
    // claim forms" inside the hero paragraph), so we use getAllByText
    // and just check we found at least one.
    expect(screen.getAllByText(/No deductibles/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No annual maximums/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No claim forms/i).length).toBeGreaterThan(0)
  })
})
