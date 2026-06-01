/**
 * Smoke tests for the two-bar SiteHeader (top brand-color announcement
 * strip + main white edge-to-edge nav). Replaces the prior floating-pill
 * header per the Tend-clone composition.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import SiteHeader from '@/components/clinic-site/site-header'

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

const navLinks = [
  { label: 'Services', href: '/site/acme-dental/services' },
  { label: 'About', href: '/site/acme-dental/about' },
  { label: 'FAQ', href: '/site/acme-dental/faq' },
]

describe('SiteHeader', () => {
  it('renders TWO bars — top announcement strip + main white nav', () => {
    const { container } = render(
      <SiteHeader
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const header = container.querySelector('header')
    expect(header).not.toBeNull()
    // Two top-level child bars (strip + nav). Style tag may render too;
    // count only divs.
    const bars = header!.querySelectorAll(':scope > div')
    expect(bars.length).toBeGreaterThanOrEqual(2)
  })

  it('renders auto-rotating value-prop chips in the top strip', () => {
    render(
      <SiteHeader
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    // Universal chips always render (CSS-rotated, all in DOM).
    expect(screen.getByText(/No judgment, ever/i)).toBeInTheDocument()
    expect(screen.getByText(/Same-week visits/i)).toBeInTheDocument()
    expect(screen.getByText(/Most insurance accepted/i)).toBeInTheDocument()
  })

  it('includes the tagline as a chip when short enough', () => {
    render(
      <SiteHeader
        data={makeData({ tagline: 'Care that feels like care' })}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    expect(screen.getByText(/Care that feels like care/i)).toBeInTheDocument()
  })

  it('omits the tagline chip when the tagline is too long for a chip', () => {
    const longTag = 'A really really really long tagline that overflows the chip width budget for the strip'
    render(
      <SiteHeader
        data={makeData({ tagline: longTag })}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    expect(screen.queryByText(longTag)).not.toBeInTheDocument()
  })

  it('renders the Login link in the top strip pointed at signInUrl', () => {
    render(
      <SiteHeader
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const loginLink = screen.getByRole('link', { name: /^Login$/i })
    expect(loginLink).toHaveAttribute('href', 'https://app.example.com/signin')
  })

  it('renders nav links in the main nav row', () => {
    render(
      <SiteHeader
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    expect(screen.getAllByRole('link', { name: /Services/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /About/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /FAQ/ }).length).toBeGreaterThan(0)
  })

  it('renders Book Now button pointing at the bookHref', () => {
    render(
      <SiteHeader
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const links = screen.getAllByRole('link', { name: /Book a Visit/i })
    expect(links.some((a) => a.getAttribute('href') === '/site/acme-dental/book')).toBe(true)
  })

  it('drops the floating-pill rounded-full wrapper (Tend two-bar pattern)', () => {
    const { container } = render(
      <SiteHeader
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    // Prior implementation wrapped the nav in `.rounded-full.backdrop-blur-md`
    // — the new edge-to-edge nav must NOT carry that class on the nav row.
    const mainBar = container.querySelectorAll('header > div')[1]
    expect(mainBar?.className ?? '').not.toContain('rounded-full')
  })
})
