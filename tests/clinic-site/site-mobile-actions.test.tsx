/**
 * Smoke tests for the SiteMobileActions component — Tend's persistent
 * #sticky element. Renamed in this pass from "mobile actions" to "sticky
 * bar" semantically, but the export name + filename stay for back-compat
 * with the existing route imports.
 *
 * The Tend-verbatim shape: ALWAYS visible across breakpoints (was
 * mobile-only before this pass), fixed to the viewport bottom, carrying
 * Book Now (brand) + Login (white outline, ≥sm) + Phone (tan accent).
 * The prior floating-circle desktop-only phone CTA is gone — the sticky
 * bar covers both surfaces now.
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

describe('SiteMobileActions', () => {
  it('renders a persistent sticky action bar pinned to the viewport bottom (no breakpoint hiding)', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    // Bar wrapper is `fixed bottom-0 left-0 right-0` — always visible.
    const bar = container.querySelector('.fixed.bottom-0')
    expect(bar).not.toBeNull()
    // It must NOT carry `lg:hidden` (would hide on desktop, defeating
    // the Tend-pattern always-visible bottom bar).
    expect(bar?.className ?? '').not.toContain('lg:hidden')
  })

  it('carries Book + Phone CTAs inside the sticky bar', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    const bar = container.querySelector('.fixed.bottom-0')
    expect(bar).not.toBeNull()
    expect(bar?.querySelector('a[href="/site/acme-dental/book"]')).not.toBeNull()
    expect(bar?.querySelector('a[href="tel:(555) 555-0100"]')).not.toBeNull()
  })

  it('surfaces a Login pill in the sticky bar when signInUrl is supplied', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const bar = container.querySelector('.fixed.bottom-0')
    const loginLink = bar?.querySelector('a[href="https://app.example.com/signin"]')
    expect(loginLink).not.toBeNull()
    expect(loginLink?.textContent).toMatch(/Login/)
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

  it('omits the phone CTA when no phone is set; bar still renders the Book button', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData({ phone: null })}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    const bar = container.querySelector('.fixed.bottom-0')
    expect(bar).not.toBeNull()
    expect(bar?.querySelector('a[href="/site/acme-dental/book"]')).not.toBeNull()
  })
})
