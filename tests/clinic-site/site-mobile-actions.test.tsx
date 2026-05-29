/**
 * Smoke tests for the SiteMobileActions component — the floating phone CTA
 * (desktop) + sticky bottom Book + Call bar (mobile). Extracted from the
 * homepage modern-template so /about, /services, /faq, /book, /careers all
 * carry the same conversion surface; before extraction, mobile visitors on
 * the new pages had no persistent booking CTA above the keyboard.
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
  it('renders the desktop-only floating phone CTA with a tel: href and hidden-on-mobile classes', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    const floating = container.querySelector('a[href="tel:(555) 555-0100"].hidden.lg\\:flex')
    expect(floating).not.toBeNull()
    expect(floating?.className).toContain('hidden')
    expect(floating?.className).toContain('lg:flex')
    expect(floating?.className).toContain('fixed')
  })

  it('renders the mobile-only sticky Book + Call bar that hides on desktop (lg:hidden)', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData()}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    // Sticky bar wrapper is `lg:hidden fixed bottom-0 …`
    const stickyBar = container.querySelector('.lg\\:hidden.fixed.bottom-0')
    expect(stickyBar).not.toBeNull()
    // It must contain both a Book link (to the bookHref) and a Call link.
    const bookLink = stickyBar?.querySelector('a[href="/site/acme-dental/book"]')
    expect(bookLink).not.toBeNull()
    expect(bookLink?.textContent).toMatch(/Book a Visit/)
    const callLink = stickyBar?.querySelector('a[href="tel:(555) 555-0100"]')
    expect(callLink).not.toBeNull()
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

  it('omits both the floating phone and the sticky call button when no phone is set', () => {
    const { container } = render(
      <SiteMobileActions
        data={makeData({ phone: null })}
        basePath="/site/acme-dental"
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
      />,
    )
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    // Sticky bar wrapper still renders so the Book CTA stays available.
    expect(container.querySelector('.lg\\:hidden.fixed.bottom-0')).not.toBeNull()
  })
})
