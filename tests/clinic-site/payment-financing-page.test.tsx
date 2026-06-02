/**
 * Smoke tests for the /payment-financing standalone page.
 * Verifies payment methods (defaults vs clinic-set), financing partners
 * visibility (hidden when empty / rendered when seeded), cancellation
 * policy visibility (hidden when null / rendered when set).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import {
  DEFAULT_PAYMENT_METHODS,
  type ClinicFinancingPartner,
} from '@/lib/types/clinic-content'

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

import PaymentFinancingPage from '@/app/site/[slug]/payment-financing/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(data: ClinicSiteData | null = makeData()) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  const ui = await PaymentFinancingPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('PaymentFinancingPage', () => {
  it('renders the H1 with "Payment options at {clinic}"', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Payment options at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('renders DEFAULT_PAYMENT_METHODS when clinic has not set their own', async () => {
    await renderPage()
    for (const method of DEFAULT_PAYMENT_METHODS) {
      expect(screen.getByText(method)).toBeInTheDocument()
    }
  })

  it('renders clinic-set payment methods when paymentMethods is populated', async () => {
    await renderPage(
      makeData({
        paymentMethods: ['Bitcoin', 'Wire transfer', 'Carrier pigeon'] as never,
      }),
    )
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('Wire transfer')).toBeInTheDocument()
    expect(screen.getByText('Carrier pigeon')).toBeInTheDocument()
    // The default list should NOT bleed in once a clinic has set their own.
    expect(screen.queryByText('Cash')).not.toBeInTheDocument()
  })

  it('hides the financing partners section when none are set', async () => {
    await renderPage()
    expect(screen.queryByText(/Financing options we partner with/i)).not.toBeInTheDocument()
  })

  it('renders financing partners when populated', async () => {
    const partners: ClinicFinancingPartner[] = [
      {
        id: 'p1',
        name: 'CareCredit',
        description: 'Health credit card.',
        applyUrl: 'https://www.carecredit.com',
        logoUrl: null,
      },
      {
        id: 'p2',
        name: 'Sunbit',
        description: null,
        applyUrl: null,
        logoUrl: null,
      },
    ]
    await renderPage(makeData({ financingPartners: partners as never }))
    expect(screen.getByText(/Financing options we partner with/i)).toBeInTheDocument()
    expect(screen.getAllByText(/CareCredit/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Sunbit/i).length).toBeGreaterThan(0)
    // The CareCredit row has an applyUrl — verify the external link renders.
    const links = screen.getAllByRole('link')
    const careCreditApply = links.find(
      (a) => a.getAttribute('href') === 'https://www.carecredit.com',
    )
    expect(careCreditApply).toBeDefined()
  })

  it('hides the cancellation policy section when null', async () => {
    await renderPage()
    expect(screen.queryByText(/Our cancellation policy/i)).not.toBeInTheDocument()
  })

  it('renders the cancellation policy verbatim when set', async () => {
    const policy =
      'We ask for 24 hours notice when you cancel. If you no-show twice we may ask for a deposit on the next visit.'
    await renderPage(makeData({ cancellationPolicy: policy }))
    expect(screen.getByText(/Our cancellation policy/i)).toBeInTheDocument()
    expect(screen.getByText(policy)).toBeInTheDocument()
  })

  it('renders billing-category FAQ from clinic_profile.faq when present', async () => {
    const customFaq = [
      {
        id: 'q1',
        category: 'Billing',
        question: 'Do you accept payment plans for orthodontics?',
        answer: 'Yes, we do.',
      },
      {
        id: 'q2',
        category: 'Insurance',
        question: 'Unrelated insurance question',
        answer: 'Insurance answer.',
      },
    ]
    await renderPage(makeData({ faq: customFaq as never }))
    expect(
      screen.getByText(/Do you accept payment plans for orthodontics\?/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Unrelated insurance question/i),
    ).not.toBeInTheDocument()
  })

  it('falls back to default billing FAQ when none in profile', async () => {
    await renderPage()
    // The first default Billing question covers "when do I pay"
    expect(screen.getAllByText(/When do I pay for my visit\?/i).length).toBeGreaterThan(0)
  })
})
