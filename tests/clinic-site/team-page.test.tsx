/**
 * Smoke tests for the /team index page. Confirms the H1, the staff grid,
 * empty-state placeholder (no 404), and per-card links to detail pages.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { ClinicStaff } from '@/lib/types/clinic-content'

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
      about:
        'We started Acme to make going to the dentist feel like going to any other thoughtful place. Calm rooms, plain explanations, no judgment.',
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
      services: null,
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

const SAMPLE_STAFF: ClinicStaff[] = [
  {
    id: 'p1',
    name: 'Dr. Jordan Reyes',
    title: 'Lead Dentist',
    slug: 'dr-jordan-reyes',
    bio: 'Founder of Acme.',
    credentials: 'DDS · 15 years experience',
    specialties: ['Family dentistry'],
    funFact: 'Hikes.',
    bookHref: null,
    photoUrl: null,
  },
  {
    id: 'p2',
    name: 'Dr. Sam Patel',
    title: 'Cosmetic Dentist',
    slug: null,
    bio: 'Cosmetic specialist.',
    credentials: 'DDS, MS',
    specialties: ['Cosmetic dentistry'],
    funFact: null,
    bookHref: null,
    photoUrl: null,
  },
  {
    id: 'p3',
    name: 'Maria Vega, RDH',
    title: 'Lead Hygienist',
    slug: null,
    bio: 'Lead hygienist with 12 years.',
    credentials: 'RDH',
    specialties: null,
    funFact: null,
    bookHref: null,
    photoUrl: null,
  },
]

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

vi.mock('@/lib/services/membership', () => ({
  listActivePlans: vi.fn(async () => []),
}))

vi.mock('@/lib/services/careers', () => ({
  getOpenJobs: vi.fn(async () => []),
}))

import TeamPage from '@/app/site/[slug]/team/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(data: ClinicSiteData | null = makeData()) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  const ui = await TeamPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('TeamPage', () => {
  it('renders the H1 "Meet the team at {clinic}"', async () => {
    await renderPage(makeData({ staff: SAMPLE_STAFF }))
    expect(
      screen.getByRole('heading', { level: 1, name: /Meet the team at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('renders each staff member with their name', async () => {
    await renderPage(makeData({ staff: SAMPLE_STAFF }))
    expect(screen.getByText(/Dr\. Jordan Reyes/)).toBeInTheDocument()
    expect(screen.getByText(/Dr\. Sam Patel/)).toBeInTheDocument()
    expect(screen.getByText(/Maria Vega, RDH/)).toBeInTheDocument()
  })

  it('renders "More" links pointing at each staff detail page', async () => {
    await renderPage(makeData({ staff: SAMPLE_STAFF }))
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    // Explicit slug — Jordan Reyes set slug='dr-jordan-reyes'.
    expect(hrefs).toContain('/site/acme-dental/team/dr-jordan-reyes')
    // Derived slug from kebab(name) — strips honorifics + post-nominals via
    // kebab regex, "Dr. Sam Patel" → "dr-sam-patel".
    expect(hrefs).toContain('/site/acme-dental/team/dr-sam-patel')
    // Honorific + post-nominal name → kebab handles it the same way.
    expect(hrefs).toContain('/site/acme-dental/team/maria-vega-rdh')
  })

  it('renders the empty-state placeholder (NOT a 404) when staff is empty', async () => {
    await renderPage(makeData({ staff: [] }))
    expect(screen.getByText(/Our team page is coming soon/i)).toBeInTheDocument()
  })

  it('renders the empty-state placeholder when staff is null', async () => {
    await renderPage(makeData({ staff: null }))
    expect(screen.getByText(/Our team page is coming soon/i)).toBeInTheDocument()
  })

  it('renders the page in the standard Tend chrome (SiteHeader + footer)', async () => {
    const { container } = await renderPage(makeData({ staff: SAMPLE_STAFF }))
    expect(container.querySelector('header')).not.toBeNull()
    expect(container.querySelector('footer')).not.toBeNull()
  })

  it('falls back to a universal warm hero lead when about is null', async () => {
    await renderPage(makeData({ staff: SAMPLE_STAFF, about: null }))
    // Universal lead substitutes clinic name.
    expect(screen.getByText(/Real people who care about the experience you have at Acme Dental/i)).toBeInTheDocument()
  })

  it('pulls the first sentence of about into the hero subhead when present', async () => {
    await renderPage(makeData({ staff: SAMPLE_STAFF }))
    expect(
      screen.getByText(/We started Acme to make going to the dentist feel like going to any other thoughtful place\./),
    ).toBeInTheDocument()
  })
})
