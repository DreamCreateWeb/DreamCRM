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
  it('"See all hours" link routes to /#hours when basePath is empty (subdomain mode)', () => {
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
    const link = screen.getByRole('link', { name: /See all hours/i }) as HTMLAnchorElement
    // Subdomain mode strips basePath, but the link must still resolve to a
    // homepage anchor (`/#hours`) — a bare `#hours` would scroll within the
    // current page, which has no `#hours` element on /about /services /faq.
    expect(link.getAttribute('href')).toBe('/#hours')
  })

  it('"See all hours" link routes to {basePath}/#hours under path-based mode', () => {
    render(
      <SiteFooter
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const link = screen.getByRole('link', { name: /See all hours/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/site/acme-dental#hours')
  })
})
