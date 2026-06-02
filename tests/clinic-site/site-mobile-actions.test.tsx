/**
 * Smoke tests for the SiteMobileActions component — now rendering as
 * floating action widgets pinned to the bottom-right corner of the
 * viewport (replacing the prior full-width sticky bottom bar).
 *
 * Two stacked widgets: a phone circle on top + a brand-colored Book pill
 * below. The legacy Login pill is gone — patient login is reachable from
 * the chartreuse top strip of the site header.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import SiteMobileActions from '@/components/clinic-site/site-mobile-actions'

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

describe('SiteMobileActions — floating widgets', () => {
  it('renders a fixed widget stack pinned to the bottom-right corner (no breakpoint hiding)', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    const stack = container.querySelector('.floating-cta-stack')
    expect(stack).not.toBeNull()
    expect(stack?.className ?? '').toContain('fixed')
    // Must not carry `lg:hidden` — the widgets stay visible across
    // every breakpoint (mobile + tablet + desktop).
    expect(stack?.className ?? '').not.toContain('lg:hidden')
    // Wrapper itself disables pointer events so empty space between
    // widgets doesn't trap clicks meant for underlying content; the
    // children re-enable them on themselves.
    expect(stack?.className ?? '').toContain('pointer-events-none')
  })

  it('carries Book + Phone CTAs as floating widgets', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    const stack = container.querySelector('.floating-cta-stack')
    expect(stack).not.toBeNull()
    expect(stack?.querySelector('a[href="/site/acme-dental/book"]')).not.toBeNull()
    expect(stack?.querySelector('a[href="tel:(555) 555-0100"]')).not.toBeNull()
  })

  it('does NOT render a Login pill (login lives in the header top strip now)', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    // signInUrl is accepted for back-compat but not rendered as a CTA.
    expect(container.querySelector('a[href="https://app.example.com/signin"]')).toBeNull()
  })

  it('uses the Book CTA label from props (universal "Book a Visit" copy)', () => {
    render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental#contact"
        bookLabel="Book a Visit"
      />,
    )
    const bookLinks = screen.getAllByRole('link', { name: /Book a Visit/i })
    expect(bookLinks.length).toBeGreaterThan(0)
  })

  it('omits the phone widget when no phone is set; Book widget still renders', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData({ phone: null })}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    const stack = container.querySelector('.floating-cta-stack')
    expect(stack).not.toBeNull()
    expect(stack?.querySelector('a[href="/site/acme-dental/book"]')).not.toBeNull()
  })

  it('Phone widget has an accessible label (icon-only button)', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    const phone = container.querySelector('a[href^="tel:"]')
    expect(phone).not.toBeNull()
    expect(phone?.getAttribute('aria-label')).toMatch(/Call Acme Dental/)
  })
})
