/**
 * Smoke tests for the two-bar SiteHeader. The top strip is a hardcoded
 * chartreuse marquee (Tend's signature accent), the main nav lives inside
 * a cream rounded-bottom drawer container.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  it('renders a "Skip to content" link targeting the #main-content landmark', () => {
    const { getByText } = render(
      <SiteHeader
        data={makeData()}
        basePath="/site/acme-dental"
        navLinks={navLinks}
        bookHref="/site/acme-dental/book"
        bookLabel="Book a Visit"
        signInUrl="https://app.example.com/signin"
      />,
    )
    const skip = getByText('Skip to content')
    expect(skip.getAttribute('href')).toBe('#main-content')
  })

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
    // Wave 4 universalized the chips to voice/quality claims (dropped the
    // "Same-week" availability + "Most insurance" coverage promises).
    expect(screen.getAllByText(/No judgment, ever/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Gentle, modern care/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Insurance welcome/i).length).toBeGreaterThan(0)
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

  it('paints the bright announcement strip from the brand-DERIVED --c-strip var', () => {
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
    // The strip is still the FIRST child div of the header (structure intact).
    expect(container.querySelector('header > div')).not.toBeNull()
    // Its background now derives from the brand (a bright brand-tinted band) via
    // the --c-strip palette var rather than a fixed chartreuse. happy-dom drops
    // var() from inline styles, so we assert the source wiring.
    const src = readFileSync(
      resolve(__dirname, '../../components/clinic-site/site-header.tsx'),
      'utf8',
    )
    expect(src).toMatch(/var\(--c-strip/)
    expect(src).not.toMatch(/STRIP_BG = '#E7FB7E'/)
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
    // The nav container carries `lg:rounded-b-[32px]`. Its background is now a
    // brand-tinted near-white from the --c-bg var (happy-dom strips var() from
    // inline styles, so we assert the structural class here + source wiring).
    const navWrappers = Array.from(container.querySelectorAll('div'))
    expect(
      navWrappers.some((d) => d.className.includes('lg:rounded-b-[32px]')),
    ).toBe(true)
    const src = readFileSync(
      resolve(__dirname, '../../components/clinic-site/site-header.tsx'),
      'utf8',
    )
    expect(src).toMatch(/NAV_CONTAINER_BG = 'var\(--c-bg/)
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

  it('renders the child service links in the mobile drawer when it is opened', () => {
    renderWithNav(navWithDropdowns)
    // Mobile nav is now collapsed behind a hamburger button. Open the
    // drawer and verify the child link is queryable — the drawer renders
    // all dropdown children flat (no accordion tap step).
    fireEvent.click(screen.getByRole('button', { name: /Open menu/i }))
    const allLinks = screen.getAllByRole('link', { name: /Teeth Whitening/i })
    expect(allLinks.length).toBeGreaterThan(0)
  })
})

// ── Patients dropdown (Insurance / Payment & Financing / Dental Plans) ─────

import { buildClinicNavLinks } from '@/lib/clinic-site-helpers'

describe('SiteHeader — Patients dropdown', () => {
  it('buildClinicNavLinks emits a Patients parent with Insurance + Payment & Financing children when hasDentalPlans=false', () => {
    const links = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      services: [],
    })
    const patients = links.find((l) => l.label === 'Patients')
    expect(patients).toBeDefined()
    const childLabels = (patients?.children ?? []).map((c) => c.label)
    expect(childLabels).toContain('Insurance')
    expect(childLabels).toContain('Payment & Financing')
    // Dental Plans must NOT appear when the clinic has no active membership.
    expect(childLabels).not.toContain('Dental Plans')
  })

  it('buildClinicNavLinks includes Dental Plans when hasDentalPlans=true', () => {
    const links = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: true,
      services: [],
    })
    const patients = links.find((l) => l.label === 'Patients')
    const childLabels = (patients?.children ?? []).map((c) => c.label)
    expect(childLabels).toEqual(['Your First Visit', 'Insurance', 'Payment & Financing', 'Dental Plans'])
  })

  it('child hrefs route under the given basePath', () => {
    const links = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: true,
      services: [],
    })
    const patients = links.find((l) => l.label === 'Patients')
    const childHrefs = (patients?.children ?? []).map((c) => c.href)
    expect(childHrefs).toContain('/site/acme-dental/insurance')
    expect(childHrefs).toContain('/site/acme-dental/payment-financing')
    expect(childHrefs).toContain('/site/acme-dental/dental-plans')
  })

  it('renders the Patients dropdown toggle in the desktop header + child links in the mobile drawer', () => {
    const navWithPatients = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: true,
      services: [],
    })
    renderWithNav(navWithPatients)
    expect(
      screen.getByRole('button', { name: /^Patients menu$/i }),
    ).toBeInTheDocument()
    // Open the mobile drawer; all dropdown children render flat inside.
    fireEvent.click(screen.getByRole('button', { name: /Open menu/i }))
    const allLinks = screen.getAllByRole('link')
    const hrefs = allLinks.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/site/acme-dental/insurance')
    expect(hrefs).toContain('/site/acme-dental/payment-financing')
    expect(hrefs).toContain('/site/acme-dental/dental-plans')
  })

  it('omits Dental Plans link entirely when hasDentalPlans=false', () => {
    const navNoDP = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      services: [],
    })
    renderWithNav(navNoDP)
    const dpLinks = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental/dental-plans')
    expect(dpLinks).toHaveLength(0)
  })
})

// ── About dropdown (Checkpoint 3 — consolidates About + Team + Blog + Careers + FAQ)

describe('SiteHeader — About dropdown', () => {
  it('emits an About parent with About + FAQ children always (universal floor)', () => {
    const links = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: false,
      services: [],
    })
    const about = links.find((l) => l.label === 'About')
    expect(about).toBeDefined()
    const childLabels = (about?.children ?? []).map((c) => c.label)
    // Two universal floor children — they render even with no gated content.
    expect(childLabels).toContain('About')
    expect(childLabels).toContain('FAQ')
    // Gated children must NOT appear when their flags are false.
    expect(childLabels).not.toContain('Meet Our Team')
    expect(childLabels).not.toContain('Blog')
    expect(childLabels).not.toContain('Careers')
  })

  it('includes Meet Our Team only when hasTeam=true', () => {
    const off = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: false,
      services: [],
    })
    const aboutOff = off.find((l) => l.label === 'About')
    expect((aboutOff?.children ?? []).map((c) => c.label)).not.toContain('Meet Our Team')

    const on = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      hasTeam: true,
      hasCareers: false,
      services: [],
    })
    const aboutOn = on.find((l) => l.label === 'About')
    const labels = (aboutOn?.children ?? []).map((c) => c.label)
    expect(labels).toContain('Meet Our Team')
    const hrefs = (aboutOn?.children ?? []).map((c) => c.href)
    expect(hrefs).toContain('/site/acme-dental/team')
  })

  it('includes Blog only when hasBlog=true', () => {
    const off = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: false,
      services: [],
    })
    const aboutOff = off.find((l) => l.label === 'About')
    expect((aboutOff?.children ?? []).map((c) => c.label)).not.toContain('Blog')

    const on = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: true,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: false,
      services: [],
    })
    const aboutOn = on.find((l) => l.label === 'About')
    const hrefs = (aboutOn?.children ?? []).map((c) => c.href)
    expect(hrefs).toContain('/site/acme-dental/blog')
  })

  it('includes Careers only when hasCareers=true', () => {
    const off = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: false,
      services: [],
    })
    const aboutOff = off.find((l) => l.label === 'About')
    expect((aboutOff?.children ?? []).map((c) => c.label)).not.toContain('Careers')

    const on = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: false,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: true,
      services: [],
    })
    const aboutOn = on.find((l) => l.label === 'About')
    const hrefs = (aboutOn?.children ?? []).map((c) => c.href)
    expect(hrefs).toContain('/site/acme-dental/careers')
  })

  it('renders the About dropdown toggle in the desktop header', () => {
    const links = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: true,
      hasDentalPlans: false,
      hasTeam: true,
      hasCareers: true,
      services: [],
    })
    renderWithNav(links)
    expect(
      screen.getByRole('button', { name: /^About menu$/i }),
    ).toBeInTheDocument()
  })

  it('renders all About children in the mobile drawer when opened', () => {
    const links = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: true,
      hasDentalPlans: false,
      hasTeam: true,
      hasCareers: true,
      services: [],
    })
    renderWithNav(links)
    fireEvent.click(screen.getByRole('button', { name: /Open menu/i }))
    const allLinks = screen.getAllByRole('link')
    const hrefs = allLinks.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/site/acme-dental/about')
    expect(hrefs).toContain('/site/acme-dental/team')
    expect(hrefs).toContain('/site/acme-dental/blog')
    expect(hrefs).toContain('/site/acme-dental/careers')
    expect(hrefs).toContain('/site/acme-dental/faq')
  })

  it('FAQ and Blog are NO LONGER top-level — they live inside About', () => {
    const links = buildClinicNavLinks({
      basePath: '/site/acme-dental',
      hasBlog: true,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: false,
      services: [],
    })
    // No top-level node should be labeled FAQ or Blog. They appear only as
    // About → children.
    expect(links.some((l) => l.label === 'FAQ')).toBe(false)
    expect(links.some((l) => l.label === 'Blog')).toBe(false)
  })
})
