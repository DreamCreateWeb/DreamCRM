/**
 * Smoke tests for the /new-patients first-visit guide page. Verifies the
 * universal defaults render on day 0, the money cards read REAL profile data
 * (carriers / payment methods) with honest fallbacks, the dental-plans card
 * gates on active membership plans, and the intake CTA points at the apex
 * host (the auth + portal flow only exists on www).
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

import NewPatientsPage from '@/app/site/[slug]/new-patients/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(
  data: ClinicSiteData | null = makeData(),
  plans: Array<{ id: string }> = [],
) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  listActivePlansMock.mockResolvedValueOnce(plans as never)
  const ui = await NewPatientsPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('NewPatientsPage', () => {
  it('renders the H1 with "Your first visit at {clinic}" copy', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Your first visit at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('renders the four what-to-expect steps and the bring checklist defaults', async () => {
    await renderPage()
    expect(screen.getByText('Book a time that fits')).toBeInTheDocument()
    expect(screen.getByText('A plan you understand')).toBeInTheDocument()
    expect(screen.getByText('Your insurance card')).toBeInTheDocument()
    expect(screen.getByText('Past records, if you have them')).toBeInTheDocument()
  })

  it('intake CTAs point at the apex host intake-start flow', async () => {
    await renderPage()
    const intakeLinks = screen
      .getAllByRole('link', { name: /Start your intake online/i })
      .map((a) => a.getAttribute('href'))
    expect(intakeLinks.length).toBeGreaterThan(0)
    for (const href of intakeLinks) {
      expect(href).toBe('https://app.example.com/site/acme-dental/intake-start')
    }
  })

  it('insurance money card reads real carriers when set', async () => {
    await renderPage(
      makeData({
        acceptedInsuranceCarriers: ['Aetna', 'Cigna', 'Delta Dental', 'MetLife'] as never,
      }),
    )
    expect(screen.getByText(/We accept Aetna, Cigna, Delta Dental and 1 more/i)).toBeInTheDocument()
  })

  it('insurance money card falls back to honest universal copy when carriers unset', async () => {
    await renderPage()
    expect(screen.getByText(/We work with most major PPO plans/i)).toBeInTheDocument()
  })

  it('payment money card reads real payment methods when set', async () => {
    await renderPage(makeData({ paymentMethods: ['Cash', 'HSA / FSA'] as never }))
    expect(screen.getByText(/We accept Cash, HSA \/ FSA\./i)).toBeInTheDocument()
  })

  it('shows the dental-plans card only when membership plans are active', async () => {
    await renderPage(makeData(), [{ id: 'plan1' }])
    expect(screen.getByText('No dental insurance?')).toBeInTheDocument()
    const dpLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental/dental-plans')
    expect(dpLinks.length).toBeGreaterThan(0)
  })

  it('hides the dental-plans card when no membership plans exist', async () => {
    await renderPage(makeData(), [])
    expect(screen.queryByText('No dental insurance?')).not.toBeInTheDocument()
  })

  it('renders the default first-visit FAQ (anti-shame item included) + FAQPage JSON-LD', async () => {
    const { container } = await renderPage()
    expect(
      screen.getByText(/I haven't been to a dentist in years\. Will you judge me\?/i),
    ).toBeInTheDocument()
    const ld = container.querySelector('script[type="application/ld+json"]')
    expect(ld).not.toBeNull()
    const parsed = JSON.parse(ld!.textContent ?? '{}')
    expect(parsed['@type']).toBe('FAQPage')
  })

  it('renders the no-judgment comfort section', async () => {
    await renderPage()
    expect(screen.getByText('No judgment, ever.')).toBeInTheDocument()
  })
})
