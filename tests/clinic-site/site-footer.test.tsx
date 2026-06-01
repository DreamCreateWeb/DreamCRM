/**
 * Smoke tests for the SiteFooter component — focused on the cross-page link
 * patterns that were broken under subdomain mode (basePath='') before this
 * PR's fixes. The "See all hours" link in particular needs `${basePath || '/'}`
 * so it resolves to a homepage `/#hours` anchor rather than a bare `#hours`
 * that scrolls within a page that has no `#hours` section.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import SiteFooter from '@/components/clinic-site/site-footer'

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
      hours: { mon: { open: '09:00', close: '17:00' } } as never,
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
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about' },
]

describe('SiteFooter', () => {
  it('renders the full weekly hours inline (no more "See all hours" link)', () => {
    render(
      <SiteFooter
        data={makeData()}
        basePath=""
        navLinks={navLinks}
        bookHref="/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    // The standalone homepage Hours section was removed; the footer now
    // carries the full weekly hours in its "Visit" column. Monday's open
    // range renders in 12-hour format, and there's no longer a
    // "See all hours" anchor link (the #hours target is gone).
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('9:00 AM – 5:00 PM')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /See all hours/i })).not.toBeInTheDocument()
  })

  it('renders "Closed" days in the footer weekly hours', () => {
    render(
      <SiteFooter
        data={makeData({ hours: { mon: { open: '09:00', close: '17:00' }, sun: { closed: true } } as never })}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('uses the hardcoded forest-teal background (NOT theme-driven) regardless of brand color', () => {
    // Whether the clinic picks sage or hot pink, the footer always anchors
    // the page in forest-teal — that's the Tend-verbatim look.
    const { container: a } = render(
      <SiteFooter
        data={makeData({ brandColor: '#9CAF9F' })}
        basePath=""
        navLinks={navLinks}
        bookHref="/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const footerA = a.querySelector('footer') as HTMLElement
    expect(footerA.style.backgroundColor).toMatch(/rgb\(54, ?81, ?76\)|#36514c/i)

    const { container: b } = render(
      <SiteFooter
        data={makeData({ brandColor: '#FF1493' })}
        basePath=""
        navLinks={navLinks}
        bookHref="/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const footerB = b.querySelector('footer') as HTMLElement
    expect(footerB.style.backgroundColor).toMatch(/rgb\(54, ?81, ?76\)|#36514c/i)
  })

  it('renders 4-column layout with About / Visit / (Services if any) / Questions headers', () => {
    render(
      <SiteFooter
        data={makeData({
          services: [
            { id: 's1', name: 'Cleanings', description: null },
            { id: 's2', name: 'Whitening', description: null },
          ] as never,
        })}
        basePath=""
        navLinks={navLinks}
        bookHref="/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    // Four heading columns
    expect(screen.getByRole('heading', { level: 2, name: /About Acme Dental/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /^Visit$/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /^Services$/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /^Questions\?/ })).toBeInTheDocument()
  })

  it('omits the Services column when the clinic has no services configured', () => {
    render(
      <SiteFooter
        data={makeData({ services: null })}
        basePath=""
        navLinks={navLinks}
        bookHref="/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    expect(screen.queryByRole('heading', { level: 2, name: /^Services$/ })).not.toBeInTheDocument()
  })
})
