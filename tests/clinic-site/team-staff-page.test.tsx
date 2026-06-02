/**
 * Smoke tests for the per-staff /team/[staffSlug] detail page. Confirms
 * resolution by explicit + derived slug, Person JSON-LD emission, optional
 * field render/hide branches, and notFound for unknown slugs.
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

const STAFF: ClinicStaff[] = [
  {
    id: 'p1',
    name: 'Dr. Jordan Reyes',
    title: 'Lead Dentist',
    slug: 'dr-jordan-reyes',
    bio: 'Founded Acme in 2019 after a career in community dentistry.',
    credentials: 'DDS · 15 years experience',
    specialties: ['Family dentistry', 'Restorative care'],
    funFact: 'Hikes the Hill Country on weekends.',
    bookHref: null,
    photoUrl: null,
  },
  {
    id: 'p2',
    name: 'Maria Vega',
    title: 'Hygienist',
    slug: null,
    bio: 'Twelve years of patient care.',
    credentials: null,
    specialties: null,
    funFact: null,
    bookHref: null,
    photoUrl: null,
  },
  {
    id: 'p3',
    name: 'Sam Patel',
    title: 'Cosmetic Dentist',
    slug: null,
    bio: 'Cosmetic specialist with eight years of practice.',
    credentials: 'DDS, MS',
    specialties: ['Veneers'],
    funFact: null,
    // Custom booking override — exercises the per-staff bookHref branch.
    bookHref: '/book?provider=sam-patel',
    photoUrl: null,
  },
]

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

import StaffDetailPage from '@/app/site/[slug]/team/[staffSlug]/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(staffSlug: string, staff: ClinicStaff[] = STAFF) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeData({ staff }),
  )
  const ui = await StaffDetailPage({
    params: Promise.resolve({ slug: 'acme-dental', staffSlug }),
  })
  return render(ui as React.ReactElement)
}

describe('StaffDetailPage', () => {
  it('resolves a staff member by EXPLICIT slug', async () => {
    await renderPage('dr-jordan-reyes')
    expect(
      screen.getByRole('heading', { level: 1, name: /Dr\. Jordan Reyes/i }),
    ).toBeInTheDocument()
  })

  it('resolves a staff member by DERIVED slug (kebab of name)', async () => {
    await renderPage('maria-vega')
    expect(
      screen.getByRole('heading', { level: 1, name: /Maria Vega/i }),
    ).toBeInTheDocument()
  })

  it('renders credentials and specialties when present', async () => {
    await renderPage('dr-jordan-reyes')
    expect(screen.getByText(/DDS · 15 years experience/)).toBeInTheDocument()
    expect(screen.getByText('Family dentistry')).toBeInTheDocument()
    expect(screen.getByText('Restorative care')).toBeInTheDocument()
  })

  it('renders the funFact section when present', async () => {
    await renderPage('dr-jordan-reyes')
    expect(screen.getByText('Outside the office')).toBeInTheDocument()
    expect(screen.getByText(/Hikes the Hill Country on weekends/)).toBeInTheDocument()
  })

  it('hides credentials / specialties / funFact when absent', async () => {
    await renderPage('maria-vega')
    // Specialties pill section header — only renders when specialties exist.
    expect(screen.queryByText('Focus areas')).not.toBeInTheDocument()
    // Fun-fact label — only renders when funFact is present.
    expect(screen.queryByText('Outside the office')).not.toBeInTheDocument()
  })

  it('uses per-staff bookHref override when set', async () => {
    await renderPage('sam-patel')
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href') === '/book?provider=sam-patel')).toBe(true)
  })

  it('renders a Book CTA labeled "Book with {firstName}" (stripping honorific)', async () => {
    await renderPage('dr-jordan-reyes')
    // Honorific "Dr." stripped → firstName = "Jordan"
    expect(screen.getAllByRole('link', { name: /Book with Jordan/i }).length).toBeGreaterThan(0)
  })

  it('renders a "Back to team" link to /team', async () => {
    await renderPage('dr-jordan-reyes')
    const back = screen.getByRole('link', { name: /Back to team/i })
    expect(back).toHaveAttribute('href', '/site/acme-dental/team')
  })

  it('emits Person JSON-LD with worksFor → Dentist (clinic)', async () => {
    const { container } = await renderPage('dr-jordan-reyes')
    const ldScript = container.querySelector('script[type="application/ld+json"]')
    expect(ldScript).not.toBeNull()
    const ld = JSON.parse(ldScript!.textContent ?? '{}')
    expect(ld['@type']).toBe('Person')
    expect(ld.name).toBe('Dr. Jordan Reyes')
    expect(ld.jobTitle).toBe('Lead Dentist')
    expect(ld.worksFor['@type']).toBe('Dentist')
    expect(ld.worksFor.name).toBe('Acme Dental')
  })

  it('calls notFound when the staffSlug does not match any staff member', async () => {
    await expect(renderPage('does-not-exist')).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('calls notFound when the clinic has no staff at all', async () => {
    await expect(renderPage('anyone', [])).rejects.toThrow(/NEXT_NOT_FOUND/)
  })
})
