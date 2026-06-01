/**
 * Smoke tests for the two-bar SiteHeader. The top strip is a hardcoded
 * chartreuse marquee (Tend's signature accent), the main nav lives inside
 * a cream rounded-bottom drawer container.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { SiteNavLink } from '@/lib/clinic-site-helpers'
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

  it('renders value-prop chips in the top strip marquee', () => {
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
    // Marquee duplicates each chip for the seamless loop + a sr-only fallback
    // mirrors the chips, so each label appears multiple times in the DOM.
    expect(screen.getAllByText(/No judgment, ever/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Same-week visits/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Most insurance accepted/i).length).toBeGreaterThan(0)
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
    expect(screen.getAllByText(/Care that feels like care/i).length).toBeGreaterThan(0)
  })

  it('hardcodes the chartreuse #E7FB7E strip background regardless of brand color', () => {
    const { container } = render(
      <SiteHeader
        data={makeData({ brandColor: '#9CAF9F' })}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    // Strip is the FIRST child div of the header. Its inline style must
    // carry the hardcoded chartreuse background, NOT the brand color.
    const strip = container.querySelector('header > div')
    const style = strip?.getAttribute('style') ?? ''
    expect(style).toMatch(/#E7FB7E/i)
    // Brand color must NOT bleed into the strip.
    expect(style).not.toMatch(/#9CAF9F/i)
  })

  it('renders a marquee track that loops the chips for a seamless scroll', () => {
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
    expect(container.querySelector('.tend-marquee-track')).not.toBeNull()
  })

  it('wraps the main nav in a cream rounded-bottom drawer container at desktop', () => {
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
    // The cream container carries `lg:rounded-b-[32px]` + the cream bg.
    const navWrappers = Array.from(container.querySelectorAll('div'))
    expect(
      navWrappers.some(
        (d) =>
          d.className.includes('lg:rounded-b-[32px]') &&
          (d.getAttribute('style') ?? '').toUpperCase().includes('#FEF7F1'),
      ),
    ).toBe(true)
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

  // ── Hide-on-scroll ────────────────────────────────────────────────────

  it('carries the slide CSS hook + initial visible transform on the <header>', () => {
    // Hide-on-scroll is driven by client-side scroll listening; under
    // happy-dom there's no real scroll so the initial state must be
    // visible. Verify the structural wiring (class hook + inline
    // transform attribute) is present so the runtime behavior can flip
    // the state via the same plumbing.
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
    expect(header!.className).toContain('site-header-slide')
    expect(header!.getAttribute('style') ?? '').toContain('translateY(0')
    expect(header!.getAttribute('data-hidden')).toBe('false')
  })

  it('emits a CSS transition rule that runs only when prefers-reduced-motion is no-preference', () => {
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
    // The inline <style> block carries the transition rule. Reduced-motion
    // users must NOT get the slide; the rule should be gated behind a
    // @media (prefers-reduced-motion: no-preference) wrapper so the default
    // (no preference set) keeps the slide animation.
    const style = container.querySelector('style')?.textContent ?? ''
    expect(style).toMatch(/prefers-reduced-motion:\s*no-preference/i)
    expect(style).toMatch(/site-header-slide/)
    expect(style).toMatch(/transition:\s*transform/i)
  })

  it('keeps the sticky top-0 + z-40 positioning so the slide stays anchored', () => {
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
    expect(header!.className).toContain('sticky')
    expect(header!.className).toContain('top-0')
    expect(header!.className).toContain('z-40')
  })
})

// ── Nav dropdowns (Core / Special services) ──────────────────────────────────

const navWithDropdowns: SiteNavLink[] = [
  {
    label: 'Services',
    href: '/site/acme-dental/services',
    children: [
      { label: 'Teeth Whitening', href: '/site/acme-dental/services/teeth-whitening' },
      { label: 'Dental Exams', href: '/site/acme-dental/services/dental-exams' },
    ],
  },
  {
    label: 'Special Services',
    href: '/site/acme-dental/services',
    children: [
      { label: 'Oral Surgery', href: '/site/acme-dental/services/oral-surgery' },
    ],
  },
  { label: 'About', href: '/site/acme-dental/about' },
]

function renderWithNav(nav: SiteNavLink[]) {
  return render(
    <SiteHeader
      data={makeData()}
      basePath="/site/acme-dental"
      navLinks={nav}
      bookHref="/site/acme-dental/book"
      bookLabel="Book a Visit"
      signInUrl="https://app.example.com/signin"
    />,
  )
}

describe('SiteHeader — nav dropdowns', () => {
  it('renders a chevron toggle button with aria-haspopup for a parent with children', () => {
    renderWithNav(navWithDropdowns)
    const toggle = screen.getByRole('button', { name: /^Services menu$/i })
    expect(toggle).toHaveAttribute('aria-haspopup', 'menu')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the parent label as a link to the index even with children', () => {
    renderWithNav(navWithDropdowns)
    const serviceLinks = screen
      .getAllByRole('link', { name: /^Services$/i })
      .filter((a) => a.getAttribute('href') === '/site/acme-dental/services')
    expect(serviceLinks.length).toBeGreaterThan(0)
  })

  it('reveals child menu items + sets aria-expanded when the toggle is clicked', () => {
    renderWithNav(navWithDropdowns)
    const toggle = screen.getByRole('button', { name: /^Services menu$/i })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: /Services/i })
    expect(menu).toBeInTheDocument()
    const items = screen.getAllByRole('menuitem')
    const itemHrefs = items.map((i) => i.getAttribute('href'))
    expect(itemHrefs).toContain('/site/acme-dental/services/teeth-whitening')
    expect(itemHrefs).toContain('/site/acme-dental/services/dental-exams')
  })

  it('renders a Special Services parent toggle when special children exist', () => {
    renderWithNav(navWithDropdowns)
    expect(
      screen.getByRole('button', { name: /^Special Services menu$/i }),
    ).toBeInTheDocument()
  })

  it('omits the Special Services parent when there are no special services', () => {
    const noSpecial: SiteNavLink[] = [
      {
        label: 'Services',
        href: '/site/acme-dental/services',
        children: [
          { label: 'Teeth Whitening', href: '/site/acme-dental/services/teeth-whitening' },
        ],
      },
      { label: 'About', href: '/site/acme-dental/about' },
    ]
    renderWithNav(noSpecial)
    expect(
      screen.queryByRole('button', { name: /^Special Services menu$/i }),
    ).not.toBeInTheDocument()
  })

  it('renders the child service links in the mobile sub-nav too', () => {
    renderWithNav(navWithDropdowns)
    // Mobile sub-list always renders the children (no toggle needed), so the
    // teeth-whitening href appears even before opening the desktop dropdown.
    const allLinks = screen.getAllByRole('link', { name: /Teeth Whitening/i })
    expect(allLinks.length).toBeGreaterThan(0)
  })
})
