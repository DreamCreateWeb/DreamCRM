/**
 * Smoke tests for the SiteFooter component — focused on the cross-page link
 * patterns that were broken under subdomain mode (basePath='') before this
 * PR's fixes. The "See all hours" link in particular needs `${basePath || '/'}`
 * so it resolves to a homepage `/#hours` anchor rather than a bare `#hours`
 * that scrolls within a page that has no `#hours` section.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('anchors the footer in the brand-DERIVED deep band (theme-driven via --c-deep)', () => {
    // The footer's deep band is no longer a fixed forest-teal — it derives from
    // the clinic's brand through the layout palette var (--c-deep). happy-dom
    // strips var() from inline styles so we can't read the rendered color; we
    // assert the SOURCE wires --c-deep (contrast is covered by palette.test.ts)
    // and that the footer still renders for any brand.
    const src = readFileSync(
      resolve(__dirname, '../../components/clinic-site/site-footer.tsx'),
      'utf8',
    )
    expect(src).toMatch(/var\(--c-deep/)
    expect(src).not.toMatch(/const FOOTER_BG = '#36514c'/)

    for (const brandColor of ['#9CAF9F', '#FF1493']) {
      const { container } = render(
        <SiteFooter
          data={makeData({ brandColor })}
          basePath=""
          navLinks={navLinks}
          bookHref="/book"
          bookLabel="Book a Visit"
          signInUrl="https://app.example.com/signin"
        />,
      )
      expect(container.querySelector('footer')).not.toBeNull()
    }
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

describe('SiteFooter — logo is editable from the canvas', () => {
  function renderFooter(profile: Partial<ClinicSiteData['profile']> = {}) {
    const { container } = render(
      <SiteFooter
        data={makeData(profile)}
        basePath=""
        navLinks={navLinks}
        bookHref="/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    return container
  }

  it('instruments the logo region with data-edit-* for the Studio image modal (logo set)', () => {
    const container = renderFooter({ logoUrl: 'https://x/logo.png' })
    const region = container.querySelector('[data-edit-field="logoUrl"]') as HTMLElement
    expect(region).toBeTruthy()
    // EditBridge emits `editImage` for kind="image" → opens the logo modal.
    expect(region.getAttribute('data-edit-kind')).toBe('image')
    expect(region.getAttribute('data-edit-label')).toBe('logo')
    // The real logo <img> lives inside the region (the bridge swaps its src).
    expect(region.querySelector('img')).toBeTruthy()
  })

  it('instruments the letter-mark fallback too, so a logo can be ADDED (no logo yet)', () => {
    const container = renderFooter({ logoUrl: null })
    const region = container.querySelector('[data-edit-field="logoUrl"]') as HTMLElement
    expect(region).toBeTruthy()
    expect(region.getAttribute('data-edit-kind')).toBe('image')
    // No <img> (letter-mark), but an editor-only "+ Add logo" nudge is present.
    expect(region.querySelector('img')).toBeNull()
    expect(region.querySelector('.dc-edit-only')?.textContent).toMatch(/add logo/i)
  })
})
