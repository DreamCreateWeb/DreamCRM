/**
 * Guards for the /membership page. It already 404s when membership is disabled;
 * wave 2 adds the zero-active-plans guard /dental-plans already has, so the page
 * never renders an empty join form.
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
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
  }
})

const getShopConfigMock = vi.fn()
vi.mock('@/lib/services/shop', () => ({
  getShopConfig: (...args: unknown[]) => getShopConfigMock(...(args as [])),
}))

const listActivePlansMock = vi.fn(async () => [] as PlanRow[])
vi.mock('@/lib/services/membership', () => ({
  listActivePlans: (...args: unknown[]) => listActivePlansMock(...(args as [])),
}))

// BlogChrome is an async server component (loads nav) + MembershipJoin is a
// client component; both are irrelevant to the guard logic under test, so stub
// them to plain passthroughs.
vi.mock('@/components/clinic-site/blog-chrome', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/clinic-site/scroll-reveal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/app/site/[slug]/membership/membership-join', () => ({
  default: () => <div data-testid="membership-join" />,
}))

import ClinicMembershipPage from '@/app/site/[slug]/membership/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

function planRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'plan-1',
    name: 'Smile Club',
    slug: 'smile-club',
    description: 'Preventive care covered.',
    billingInterval: 'annual',
    priceCents: 39900,
    benefits: [{ label: '2 cleanings', qty: 2 }],
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
  // Persistent (not -Once) so a test that throws mid-render can't leave a queued
  // value that drifts the next test's plan count.
  getShopConfigMock.mockResolvedValue(shopConfig as never)
  listActivePlansMock.mockResolvedValue(plans as never)
  const ui = await ClinicMembershipPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('ClinicMembershipPage guards', () => {
  it('renders the join page when membership is enabled and plans exist', async () => {
    await renderPage()
    expect(screen.getByTestId('membership-join')).toBeTruthy()
  })

  it('404s when membership is not enabled', async () => {
    await expect(
      renderPage(makeData(), [planRow()], { membershipEnabled: false }),
    ).rejects.toThrow(notFoundError)
  })

  it('404s when membership is enabled but there are zero active plans (wave 2 guard)', async () => {
    await expect(renderPage(makeData(), [], { membershipEnabled: true })).rejects.toThrow(
      notFoundError,
    )
  })

  it('404s when the clinic slug does not resolve', async () => {
    await expect(renderPage(null)).rejects.toThrow(notFoundError)
  })
})
