/**
 * Smoke tests for the /about page. Renders the page with mocked clinic-site
 * + blog services and asserts the hero copy, real about-text passthrough, a
 * Book CTA, and the Staff login link (from the shared SiteFooter).
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
      about: 'We started Acme to make going to the dentist feel like going to a thoughtful place. No judgment.',
      npi: null,
      brandColor: '#9CAF9F',
      template: 'modern',
      phone: '(555) 555-0100',
      email: 'hi@acme.test',
      websiteDomain: null,
      addressLine1: '500 Main St',
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: null,
      country: 'US',
      hours: { mon: { open: '09:00', close: '17:00' } } as never,
      planTier: 'pro',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      services: null,
      staff: [{ id: 'p1', name: 'Dr. Jordan Reyes', title: 'Lead Dentist', bio: '15 years.' }] as never,
      stats: [{ id: 's1', value: '4.9', label: 'rating' }] as never,
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

vi.mock('@/lib/services/membership', () => ({
  listActivePlans: vi.fn(async () => []),
}))

vi.mock('@/lib/services/careers', () => ({
  getOpenJobs: vi.fn(async () => []),
}))

import AboutPage from '@/app/site/[slug]/about/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(data: ClinicSiteData | null = makeData()) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  const ui = await AboutPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('AboutPage', () => {
  it('renders the H1 with the clinic tagline as the headline', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Care that feels like care/i }),
    ).toBeInTheDocument()
  })

  it('renders the About <name> eyebrow + the clinic name', async () => {
    await renderPage()
    // The footer also carries an "About Acme Dental" column header now —
    // accept multiple matches, just confirm the about page surfaces the
    // clinic-name-in-eyebrow pattern at all.
    expect(screen.getAllByText(/About Acme Dental/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows the about first sentence once (hero) and the remainder in the story — no duplication', async () => {
    await renderPage()
    // Wave 4: the hero subhead carries the first sentence, and the Story
    // section below carries only the REMAINDER, so the opening line isn't
    // printed twice. The first sentence must appear exactly once.
    const firstSentenceMatches = screen.getAllByText(
      /We started Acme to make going to the dentist feel like going to a thoughtful place\./,
      { exact: false },
    ).filter((el) =>
      el.textContent?.trim().startsWith(
        'We started Acme to make going to the dentist feel like going to a thoughtful place.',
      ),
    )
    expect(firstSentenceMatches.length).toBe(1)
    // The remainder ("No judgment.") still renders in the story body.
    expect(screen.getByText('No judgment.')).toBeInTheDocument()
  })

  it('renders a Book CTA in the hero', async () => {
    await renderPage()
    const bookButtons = screen.getAllByRole('link', { name: /Book a Visit/i })
    expect(bookButtons.length).toBeGreaterThan(0)
  })

  it('renders the staff section with the seeded staff member', async () => {
    await renderPage()
    expect(screen.getByText('Dr. Jordan Reyes')).toBeInTheDocument()
  })

  it('renders the SiteFooter staff-login link', async () => {
    await renderPage()
    const staffLinks = screen.getAllByRole('link', { name: /Staff login/i })
    expect(staffLinks.length).toBeGreaterThan(0)
  })

  it('basic-tier bookHref routes back to the homepage #contact anchor', async () => {
    // Pro+ gets the slot picker at /book; basic tier has no /book route so
    // Book CTAs must route back to the homepage's #contact form anchor —
    // and the `${basePath || '/'}` pattern lets subdomain mode (basePath='')
    // still resolve to a valid path instead of a bare `#contact`.
    await renderPage(makeData({ planTier: 'basic' }))
    const contactLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental#contact')
    expect(contactLinks.length).toBeGreaterThan(0)
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/site/acme-dental/book'),
    ).toHaveLength(0)
  })
})
