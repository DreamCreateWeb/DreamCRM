/**
 * Smoke tests for the /insurance standalone Patients-dropdown page.
 * Verifies carriers list + verifier form + cross-link to /dental-plans
 * (when membership active) + fallback "call to verify" copy.
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
      tagline: 'Care that feels like care',
      about: null,
      npi: null,
      brandColor: '#9CAF9F',
      template: 'modern',
      phone: '(555) 555-0100',
      email: 'hi@acme.test',
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
      acceptedInsuranceCarriers: ['Aetna', 'Cigna', 'Delta Dental'] as never,
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
    // The template-dispatching chrome resolves the active template per
    // request; a null orgId short-circuits it to the modern default with no
    // cookie/auth reads.
    getClinicThemeBySlug: vi.fn(async () => ({ orgId: null, brand: null, template: null })),
    getClinicSiteBySlug: vi.fn(),
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
    appBaseUrl: vi.fn(() => 'https://app.example.com'),
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
  }
})

vi.mock('@/lib/services/blog', () => ({
  listPublishedPosts: vi.fn(async () => []),
}))

const listActivePlansMock = vi.fn(async () => [])
vi.mock('@/lib/services/membership', () => ({
  listActivePlans: (...args: unknown[]) => listActivePlansMock(...(args as [])),
}))

vi.mock('@/lib/services/careers', () => ({
  getOpenJobs: vi.fn(async () => []),
}))

import InsurancePage from '@/app/site/[slug]/insurance/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(
  data: ClinicSiteData | null = makeData(),
  plans: Array<{ id: string }> = [],
) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  listActivePlansMock.mockResolvedValueOnce(plans as never)
  const ui = await InsurancePage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('InsurancePage', () => {
  it('renders the H1 with "Insurance at {clinic}" copy', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Insurance at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('renders the carriers list when acceptedInsuranceCarriers is set', async () => {
    await renderPage()
    expect(screen.getAllByText(/Aetna/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Cigna/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Delta Dental/i).length).toBeGreaterThan(0)
  })

  it('falls back to "call to verify" copy when carriers list is empty', async () => {
    await renderPage(makeData({ acceptedInsuranceCarriers: null as never }))
    expect(
      screen.getByText(/Call us to verify your specific plan/i),
    ).toBeInTheDocument()
  })

  it('renders the InsuranceVerifierForm (email field present)', async () => {
    await renderPage()
    // The form ships an email input; it's the load-bearing verifier piece.
    const emails = screen
      .getAllByPlaceholderText(/Email/i)
      .filter((el) => el.tagName === 'INPUT')
    expect(emails.length).toBeGreaterThan(0)
  })

  it('cross-links to /dental-plans when membership plans are active', async () => {
    await renderPage(makeData(), [{ id: 'plan1' }])
    const dpLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental/dental-plans')
    expect(dpLinks.length).toBeGreaterThan(0)
  })

  it('hides the dental-plans cross-link when no membership plans exist', async () => {
    await renderPage(makeData(), [])
    const dpLinks = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental/dental-plans')
    expect(dpLinks).toHaveLength(0)
  })

  it('renders both in-network and out-of-network process steps', async () => {
    await renderPage()
    expect(screen.getByText(/If we're in-network/i)).toBeInTheDocument()
    expect(screen.getByText(/If we're out-of-network/i)).toBeInTheDocument()
  })

  it('renders insurance-category FAQ from clinic_profile.faq when present', async () => {
    const customFaq = [
      {
        id: 'q1',
        category: 'Insurance',
        question: 'Do you take Custom PPO Plan?',
        answer: 'Yes we do.',
      },
      {
        id: 'q2',
        category: 'Billing',
        question: 'Unrelated billing question.',
        answer: 'Billing answer.',
      },
    ]
    await renderPage(makeData({ faq: customFaq as never }))
    expect(screen.getByText(/Do you take Custom PPO Plan\?/i)).toBeInTheDocument()
    // Billing-category FAQ should NOT bleed onto the insurance page.
    expect(
      screen.queryByText(/Unrelated billing question\./i),
    ).not.toBeInTheDocument()
  })

  it('falls back to universal default insurance FAQ when none in profile', async () => {
    await renderPage()
    // Default question key present
    expect(
      screen.getAllByText(/in-network with my plan/i).length,
    ).toBeGreaterThan(0)
  })

  it('basic-tier bookHref routes back to homepage #contact (no /book route)', async () => {
    await renderPage(makeData({ planTier: 'basic' }))
    const contactLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental#contact')
    expect(contactLinks.length).toBeGreaterThan(0)
  })
})
