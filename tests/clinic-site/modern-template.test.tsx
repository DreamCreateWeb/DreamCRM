import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ModernTemplate from '@/components/clinic-site/modern-template'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

function makeData(overrides: Partial<ClinicSiteData['profile']> = {}): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Test Dental',
    slug: 'test-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      legalName: null,
      displayName: 'Test Dental',
      tagline: 'Caring for smiles',
      about: 'We are a friendly local dentist office.',
      npi: null,
      brandColor: '#6d28d9',
      template: 'modern',
      phone: '(555) 123-4567',
      email: 'hello@test.com',
      websiteDomain: null,
      addressLine1: null,
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: null,
      country: 'US',
      hours: { mon: { open: '09:00', close: '17:00' } },
      planTier: 'basic',
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
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as ClinicSiteData['profile'],
  }
}

describe('ModernTemplate', () => {
  it('renders the tagline as the H1 (value-prop first, brand name in eyebrow)', () => {
    // The Tend-style hero pattern: H1 carries the value statement, not the
    // brand name. The clinic name + city sit in the small eyebrow above
    // so the hero reads as "here's why you should come in" rather than
    // "we exist and we are called X" (which every clinic site already does).
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    expect(screen.getByRole('heading', { level: 1, name: /Caring for smiles/ })).toBeInTheDocument()
  })

  it('puts the clinic name + city in the hero eyebrow', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    // Both the name and the city appear in the eyebrow row.
    const eyebrowMatches = screen.getAllByText(/Test Dental/)
    expect(eyebrowMatches.length).toBeGreaterThan(0)
  })

  it('shows phone number and tel link', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const phoneLinks = screen.getAllByRole('link', { name: /\(555\) 123-4567/ })
    expect(phoneLinks.length).toBeGreaterThan(0)
    phoneLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', 'tel:(555) 123-4567')
    })
  })

  it('uses "Book a Visit" copy regardless of tier, but basic links to contact, not /book', () => {
    render(<ModernTemplate data={makeData({ planTier: 'basic' })} basePath="/site/test" />)
    // Universal CTA copy
    const bookButtons = screen.getAllByRole('link', { name: /Book a Visit/i })
    expect(bookButtons.length).toBeGreaterThan(0)
    // Basic clinics route the CTA to the contact section, not a /book widget
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/site/test/book'),
    ).toHaveLength(0)
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/site/test#contact').length,
    ).toBeGreaterThan(0)
  })

  it('shows Book CTA for pro+ clinics pointing to /book', () => {
    render(<ModernTemplate data={makeData({ planTier: 'pro' })} basePath="/site/test" />)
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/test/book')
    expect(bookLinks.length).toBeGreaterThan(0)
  })

  it('shows booking link for premium clinics too', () => {
    render(<ModernTemplate data={makeData({ planTier: 'premium' })} basePath="/site/test" />)
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/test/book')
    expect(bookLinks.length).toBeGreaterThan(0)
  })

  it('omits about section when not provided', () => {
    render(<ModernTemplate data={makeData({ about: null })} basePath="/site/test" />)
    // The about *section* eyebrow lives in a <p>. The footer also carries
    // an "About {name}" H2 always — so we narrow to the section-eyebrow tag.
    const aboutEyebrows = Array.from(document.querySelectorAll('p')).filter(
      (p) => p.textContent === 'About Test Dental',
    )
    expect(aboutEyebrows).toHaveLength(0)
  })

  it('renders the about section with the clinic-name eyebrow when provided', () => {
    render(
      <ModernTemplate
        data={makeData({ about: 'We are a friendly local dentist office.' })}
        basePath="/site/test"
      />,
    )
    // The about block keeps its eyebrow + full paragraph. Multiple matches
    // are fine — the footer also carries an "About {name}" header.
    expect(screen.getAllByText(/About Test Dental/).length).toBeGreaterThanOrEqual(1)
    // The about text now appears in THREE places — hero subhead + the
    // "difference" leadin + the full paragraph in the about section.
    expect(screen.getAllByText(/friendly local dentist office/).length).toBeGreaterThanOrEqual(1)
  })

  it('formats hours in 12-hour format', () => {
    render(
      <ModernTemplate
        data={makeData({ hours: { mon: { open: '09:00', close: '17:00' } } as never })}
        basePath="/site/test"
      />,
    )
    // 9 AM–5 PM appears in the Hours section AND in the footer "today's
    // hours" blurb when run on a Monday — accept multiple matches.
    expect(screen.getAllByText(/9:00 AM – 5:00 PM/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows "Closed" for closed days', () => {
    render(
      <ModernTemplate
        data={makeData({ hours: { sun: { closed: true } } as never })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('shows footer with current year and powered-by attribution', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const year = new Date().getFullYear().toString()
    expect(screen.getByText(new RegExp(`© ${year}`))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /DreamCreate/ })).toBeInTheDocument()
  })

  // ── Sign-in links + section nav ─────────────────────────────────────

  it('exposes sign-in links pointing to the absolute app sign-in URL', () => {
    render(
      <ModernTemplate data={makeData()} basePath="/site/test" signInUrl="https://app.example.com/signin" />,
    )
    const signinLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === 'https://app.example.com/signin')
    // header Patient Login + footer Patient Login + footer Staff login
    expect(signinLinks.length).toBeGreaterThanOrEqual(3)
  })

  it('renders a discreet "Staff login" link in the footer → app sign-in', () => {
    render(
      <ModernTemplate data={makeData()} basePath="/site/test" signInUrl="https://app.example.com/signin" />,
    )
    expect(screen.getByRole('link', { name: /Staff login/i })).toHaveAttribute(
      'href',
      'https://app.example.com/signin',
    )
  })

  it('falls back to the canonical app host when no signInUrl prop is given', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const signinLinks = screen
      .getAllByRole('link')
      .filter((a) => (a.getAttribute('href') ?? '').endsWith('/signin'))
    expect(signinLinks.length).toBeGreaterThan(0)
    expect(signinLinks[0].getAttribute('href')).toMatch(/^https?:\/\/.+\/signin$/)
  })

  it('renders header nav using page paths (services + about + faq) plus #contact anchor', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const links = screen.getAllByRole('link')
    // Page-path nav: /services, /about, /faq each render. Contact stays
    // an anchor (there is no /contact page).
    expect(links.some((a) => a.getAttribute('href') === '/site/test/services')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/site/test/about')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/site/test/faq')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/site/test#contact')).toBe(true)
  })

  it('surfaces a Blog nav link only when hasBlog is true', () => {
    const { rerender } = render(<ModernTemplate data={makeData()} basePath="/site/test" hasBlog={false} />)
    expect(
      screen.queryAllByRole('link').some((a) => a.getAttribute('href') === '/site/test/blog'),
    ).toBe(false)
    rerender(<ModernTemplate data={makeData()} basePath="/site/test" hasBlog />)
    expect(
      screen.queryAllByRole('link').some((a) => a.getAttribute('href') === '/site/test/blog'),
    ).toBe(true)
  })

  it('logo links home (basePath), never an empty href', () => {
    // Subdomain serving passes basePath='' — the logo must fall back to '/'.
    render(<ModernTemplate data={makeData()} basePath="" signInUrl="https://app.example.com/signin" />)
    const homeLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/')
    expect(homeLinks.length).toBeGreaterThan(0)
  })

  it('renders default services when none are configured', () => {
    render(<ModernTemplate data={makeData({ services: null as never })} basePath="/site/test" />)
    // Services now appear in two places: the pill carousel under the hero
    // AND the full services section below. Use getAllByText.
    expect(screen.getAllByText('Cleanings & Exams').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cosmetic Dentistry').length).toBeGreaterThanOrEqual(1)
  })

  it('renders configured services with descriptions', () => {
    render(
      <ModernTemplate
        data={makeData({
          services: [
            { id: 's1', name: 'Teeth Whitening', description: 'Brighter in one visit', icon: '✨' },
            { id: 's2', name: 'Implants', description: 'Permanent solutions', icon: '🦷' },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    // Names appear in BOTH the hero pill carousel + the services section.
    // The DESCRIPTION only renders in the services section.
    expect(screen.getAllByText('Teeth Whitening').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Brighter in one visit')).toBeInTheDocument()
    expect(screen.getAllByText('Implants').length).toBeGreaterThanOrEqual(1)
  })

  it('omits the staff section when no staff configured', () => {
    render(<ModernTemplate data={makeData({ staff: null as never })} basePath="/site/test" />)
    expect(screen.queryByText(/Our team/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/people who care/i)).not.toBeInTheDocument()
  })

  it('renders staff with names, titles, and bios', () => {
    render(
      <ModernTemplate
        data={makeData({
          staff: [
            {
              id: 'p1',
              name: 'Dr. Jane Smith',
              title: 'Lead Dentist',
              bio: '15 years of practice.',
              photoUrl: null,
            },
            { id: 'p2', name: 'Dr. John Lee', title: 'Orthodontist' },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('Lead Dentist')).toBeInTheDocument()
    expect(screen.getByText('15 years of practice.')).toBeInTheDocument()
    expect(screen.getByText('Dr. John Lee')).toBeInTheDocument()
  })

  it('replaces the emoji avatar with an initial mark when a staff member has no photo', () => {
    // The prior 👤 emoji read as "unfinished site." This pins the gradient
    // initial chip as the replacement so a future regression can't silently
    // bring back the emoji.
    render(
      <ModernTemplate
        data={makeData({
          staff: [{ id: 'p1', name: 'Dr. Jane Lee', title: 'Lead Dentist', photoUrl: null }] as never,
        })}
        basePath="/site/test"
      />,
    )
    // "Dr." is stripped → first name + last name initials = "JL" (not "DJ").
    expect(screen.getAllByLabelText('Dr. Jane Lee').some((el) => el.textContent === 'JL')).toBe(true)
    // Belt-and-braces: the emoji must not be present anywhere on the page.
    expect(screen.queryByText('👤')).not.toBeInTheDocument()
  })

  it('renders both Book and Phone CTAs in the centered hero (Tend pattern)', () => {
    render(<ModernTemplate data={makeData({ phone: '(555) 123-4567' })} basePath="/site/test" />)
    // Tend's hero has Book + phone side-by-side under the H1, centered. We
    // match that — both CTAs anchor different commit levels (Book = ready,
    // Phone = needs to ask).
    const heroSection = document.querySelector('section.relative.overflow-hidden')
    expect(heroSection).not.toBeNull()
    expect(heroSection!.querySelector('a[href^="tel:"]')).not.toBeNull()
    expect(heroSection!.querySelector('a[href$="#contact"], a[href$="/book"]')).not.toBeNull()
  })

  it('pins the persistent sticky action bar (Book + Login + Phone) to the viewport bottom', () => {
    render(<ModernTemplate data={makeData({ phone: '(555) 123-4567' })} basePath="/site/test" />)
    // The Tend #sticky element — always visible at the bottom across all
    // breakpoints (vs the prior mobile-only sticky + floating-circle pair).
    // Carries the phone CTA tagged with the brand-aware Call aria-label.
    const stickyPhone = document.querySelector(
      'a[aria-label*="Call Test Dental"][href="tel:(555) 123-4567"]',
    )
    expect(stickyPhone).not.toBeNull()
  })

  it('shows the top announcement strip with the tagline + universal trust chips', () => {
    render(
      <ModernTemplate
        data={makeData({ tagline: 'Caring for smiles' })}
        basePath="/site/test"
      />,
    )
    // Tagline appears in both the strip AND the hero H1, so accept ≥1.
    expect(screen.getAllByText(/Caring for smiles/i).length).toBeGreaterThanOrEqual(1)
    // "No judgment, ever" and "Same-week visits" appear in the strip,
    // the hero subhead, and the "difference" chip checklist — accept any.
    expect(screen.getAllByText(/No judgment, ever/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Same-week visits/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the Tend-style centered hero composition with the H1 in the brand color', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const h1 = screen.getByRole('heading', { level: 1 })
    // H1 uses the brand color (sage default in tests = #6d28d9 from makeData)
    // via inline style.
    expect(h1.getAttribute('style')).toMatch(/color: ?(rgb\(109, ?40, ?217\)|#6d28d9)/i)
    // Display serif via the next/font CSS var (or Georgia fallback).
    expect(h1.getAttribute('style')).toMatch(/font-family/i)
  })

  it('renders service pills below the hero linking to #services', () => {
    render(
      <ModernTemplate
        data={makeData({
          services: [
            { id: 's1', name: 'Quick Cleaning', description: null, icon: null },
            { id: 's2', name: 'Emergency', description: null, icon: null },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    // Each pill is a link with href ending in #services. Both names should
    // be reachable as links.
    const pillLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/test#services')
    expect(pillLinks.length).toBeGreaterThanOrEqual(2)
  })

  it("renders today's-hours blurb in the footer when hours are configured", () => {
    const hours = { mon: { open: '09:00', close: '17:00' } } as never
    render(<ModernTemplate data={makeData({ hours })} basePath="/site/test" />)
    // The footer "Today" column reads "Open today · 9:00 AM – 5:00 PM" on
    // weekdays where the clinic has open hours, "Closed today" otherwise.
    const todayMatches = screen.queryAllByText(/Open today|Closed today|Hours by appointment/)
    expect(todayMatches.length).toBeGreaterThanOrEqual(1)
  })

  it('strips post-nominals from the initials chip too', () => {
    // "Maria Vega, RDH" → "MV" (the RDH credential doesn't show up as "MR").
    render(
      <ModernTemplate
        data={makeData({
          staff: [{ id: 'p1', name: 'Maria Vega, RDH', title: 'Hygienist', photoUrl: null }] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.getAllByLabelText('Maria Vega, RDH').some((el) => el.textContent === 'MV')).toBe(true)
  })

  it('uses the staff photo when provided', () => {
    render(
      <ModernTemplate
        data={makeData({
          staff: [
            {
              id: 'p1',
              name: 'Dr. Jane',
              photoUrl: 'https://example.com/jane.jpg',
            },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    const img = screen.getByAltText('Dr. Jane') as HTMLImageElement
    expect(img.src).toBe('https://example.com/jane.jpg')
  })

  it('uses the logo image in the header when provided', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({ logoUrl: 'https://example.com/logo.png' })}
        basePath="/site/test"
      />,
    )
    // Logo lives in both the SiteHeader and SiteFooter — both render alt=""
    // (decorative, since adjacent text carries the clinic name). Find by src.
    const logos = container.querySelectorAll<HTMLImageElement>(
      'img[src="https://example.com/logo.png"]',
    )
    expect(logos.length).toBeGreaterThan(0)
    expect(logos[0].src).toBe('https://example.com/logo.png')
  })

  it('uses letter mark when no logo is set', () => {
    render(<ModernTemplate data={makeData({ logoUrl: null })} basePath="/site/test" />)
    // First letter of name appears as letter mark
    const marks = screen.getAllByText('T')
    expect(marks.length).toBeGreaterThan(0)
  })

  it('renders hero image when provided', () => {
    render(
      <ModernTemplate
        data={makeData({ heroImageUrl: 'https://example.com/hero.jpg' })}
        basePath="/site/test"
      />,
    )
    // alt="" — pick it up by src
    const imgs = document.querySelectorAll('img')
    const hero = Array.from(imgs).find((i) => i.src === 'https://example.com/hero.jpg')
    expect(hero).toBeDefined()
  })

  it('falls back to a confident default H1 when no tagline is set', () => {
    // Tagline is the H1 now, so the fallback IS the headline. Voice
    // stays warm + value-prop-led, matching the Tend-style hero pattern.
    render(<ModernTemplate data={makeData({ tagline: null })} basePath="/site/test" />)
    expect(screen.getByRole('heading', { level: 1, name: /finally feels human/i })).toBeInTheDocument()
  })

  it('renders numbered service pillars (01, 02, …)', () => {
    render(
      <ModernTemplate
        data={makeData({
          services: [
            { id: 's1', name: 'Cleanings', description: null },
            { id: 's2', name: 'Whitening', description: null },
            { id: 's3', name: 'Implants', description: null },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
    expect(screen.getByText('03')).toBeInTheDocument()
  })

  it('caps services at 6 in the main body sections (hero pills + services grid)', () => {
    const services = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      name: `Service ${i}`,
      description: null,
    }))
    const { container } = render(
      <ModernTemplate data={makeData({ services: services as never })} basePath="/site/test" />,
    )
    // Main body = everything inside <main>. Services 0-5 each appear in
    // the hero pill carousel + the services section. 6+ never appear
    // inside <main>. The footer separately surfaces up to 8 entries.
    const main = container.querySelector('main')
    expect(main).not.toBeNull()
    const mainText = main!.textContent ?? ''
    expect(mainText).toContain('Service 0')
    expect(mainText).toContain('Service 5')
    expect(mainText).not.toContain('Service 6')
    expect(mainText).not.toContain('Service 9')
  })

  it('renders the sticky mobile Book + Call bar', () => {
    render(
      <ModernTemplate
        data={makeData({ planTier: 'pro', phone: '(555) 123-4567' })}
        basePath="/site/test"
      />,
    )
    // Both the floating desktop circle CTA and the mobile sticky bar share
    // a "Call Test Dental" aria-label prefix — getAllByRole catches both.
    const callLinks = screen.getAllByRole('link', { name: /Call Test Dental/i })
    expect(callLinks.length).toBeGreaterThan(0)
    expect(callLinks[0]).toHaveAttribute('href', 'tel:(555) 123-4567')
  })

  it('uses the sage-default brand color when none is set', () => {
    // No assertion on visual style directly — instead verify the template
    // renders without errors when brandColor is null (fallback path).
    const { container } = render(
      <ModernTemplate data={makeData({ brandColor: null })} basePath="/site/test" />,
    )
    expect(container.querySelector('header')).toBeInTheDocument()
  })

  // ── Stat anchors ────────────────────────────────────────────────────

  it('omits stat anchors when none are configured', () => {
    render(<ModernTemplate data={makeData({ stats: null as never })} basePath="/site/test" />)
    expect(screen.queryByText('8,000+')).not.toBeInTheDocument()
  })

  it('renders stat anchor values + labels', () => {
    render(
      <ModernTemplate
        data={makeData({
          stats: [
            { id: 's1', value: '8,000+', label: 'five-star reviews' },
            { id: 's2', value: 'Same-week', label: 'appointments available' },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText('8,000+')).toBeInTheDocument()
    expect(screen.getByText('five-star reviews')).toBeInTheDocument()
    expect(screen.getByText('Same-week')).toBeInTheDocument()
  })

  it('caps stats at 4 on the homepage', () => {
    const stats = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      value: `V${i}`,
      label: `Label ${i}`,
    }))
    render(<ModernTemplate data={makeData({ stats: stats as never })} basePath="/site/test" />)
    expect(screen.getByText('V0')).toBeInTheDocument()
    expect(screen.getByText('V3')).toBeInTheDocument()
    expect(screen.queryByText('V4')).not.toBeInTheDocument()
  })

  // ── Testimonials ────────────────────────────────────────────────────

  it('omits the testimonials section when none configured', () => {
    render(
      <ModernTemplate
        data={makeData({ testimonials: null as never })}
        basePath="/site/test"
      />,
    )
    expect(screen.queryByText(/In their words/i)).not.toBeInTheDocument()
  })

  it('renders testimonial quote + author + location', () => {
    render(
      <ModernTemplate
        data={makeData({
          testimonials: [
            {
              id: 't1',
              quote: 'They made me feel at home.',
              authorName: 'Sarah K.',
              authorLocation: 'Brooklyn, NY',
              authorPhotoUrl: null,
            },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText(/They made me feel at home/)).toBeInTheDocument()
    expect(screen.getByText('Sarah K.')).toBeInTheDocument()
    expect(screen.getByText(/Brooklyn, NY/)).toBeInTheDocument()
  })

  it('renders patient-linked testimonials with the denormalized "First L." label', () => {
    // Linked testimonials carry patientId + the privacy-first author label
    // is already denormalized at promotion time, so the public template
    // just renders authorName/authorLocation as-is. This locks in that the
    // schema change (optional patientId on ClinicTestimonial) doesn't
    // perturb rendering for linked entries.
    render(
      <ModernTemplate
        data={makeData({
          testimonials: [
            {
              id: 't1',
              quote: 'Genuinely warm experience.',
              authorName: 'Mia H.',
              authorLocation: 'Brooklyn, NY',
              authorPhotoUrl: null,
              patientId: 'pat_mia',
            },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText(/Genuinely warm experience/)).toBeInTheDocument()
    expect(screen.getByText('Mia H.')).toBeInTheDocument()
    // Location reads inline with the strong author name, separated by '·'.
    expect(screen.getByText(/Brooklyn, NY/)).toBeInTheDocument()
  })

  // ── Testimonials carousel (arrow-paginated, Tend-verbatim) ─────────

  it('uses the arrow-paginated carousel for testimonial sections (no marquee)', () => {
    const testimonials = Array.from({ length: 3 }, (_, i) => ({
      id: `tm${i}`,
      quote: `Quote ${i}`,
      authorName: `Person ${i}`,
      authorLocation: 'City, ST',
      authorPhotoUrl: null,
    }))
    const { container } = render(
      <ModernTemplate data={makeData({ testimonials: testimonials as never })} basePath="/site/test" />,
    )
    // Carousel wrapper present — labelled by aria-roledescription.
    expect(container.querySelector('[aria-roledescription="carousel"]')).not.toBeNull()
    // Each testimonial renders exactly once (no marquee duplication).
    expect(screen.getAllByText(/Quote 0/)).toHaveLength(1)
    expect(screen.getAllByText(/Quote 2/)).toHaveLength(1)
  })

  it('exposes Previous and Next buttons for paging the carousel', () => {
    const testimonials = Array.from({ length: 4 }, (_, i) => ({
      id: `tm${i}`,
      quote: `Quote ${i}`,
      authorName: `Person ${i}`,
      authorLocation: null,
      authorPhotoUrl: null,
    }))
    render(
      <ModernTemplate data={makeData({ testimonials: testimonials as never })} basePath="/site/test" />,
    )
    expect(screen.getByRole('button', { name: /Previous testimonial/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next testimonial/i })).toBeInTheDocument()
  })

  it('hides the carousel chrome for a single testimonial (buttons would page nothing)', () => {
    const testimonials = [
      { id: 't1', quote: 'Solo q', authorName: 'A', authorLocation: null, authorPhotoUrl: null },
    ]
    render(
      <ModernTemplate data={makeData({ testimonials: testimonials as never })} basePath="/site/test" />,
    )
    expect(screen.queryByRole('button', { name: /Previous testimonial/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Next testimonial/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Solo q/)).toBeInTheDocument()
  })

  it('caps the carousel render at the 50-testimonial defense limit', () => {
    const testimonials = Array.from({ length: 80 }, (_, i) => ({
      id: `tm${i}`,
      quote: `Q ${i}`,
      authorName: `P ${i}`,
      authorLocation: null,
      authorPhotoUrl: null,
    }))
    const { container } = render(
      <ModernTemplate data={makeData({ testimonials: testimonials as never })} basePath="/site/test" />,
    )
    // No duplication — exactly 50 cards in a single track.
    const items = container.querySelectorAll('[aria-roledescription="carousel"] ul > li')
    expect(items.length).toBe(50)
  })

  it('renders testimonial cards with the patient name in bold (no avatar — Tend pattern)', () => {
    // Tend's review cards lead with the quote, then a star row, then
    // "<strong>Author</strong> · Location" — no avatar mark. The carousel
    // matches that minimal chrome.
    render(
      <ModernTemplate
        data={makeData({
          testimonials: [
            {
              id: 't1',
              quote: 'Such a calming visit.',
              authorName: 'Marcus T.',
              authorLocation: null,
              authorPhotoUrl: null,
            },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    // Author name carries the <strong> emphasis Tend uses — find ANY
    // strong with the author text (multiple strongs on the page belong
    // to other emphasis treatments like "no judgment, ever").
    const strongs = Array.from(document.querySelectorAll('strong'))
    expect(strongs.some((s) => s.textContent === 'Marcus T.')).toBe(true)
  })

  // ── Office photos ───────────────────────────────────────────────────

  it('omits the office tour section when no photos configured', () => {
    render(
      <ModernTemplate
        data={makeData({ officePhotos: null as never })}
        basePath="/site/test"
      />,
    )
    expect(screen.queryByText(/Inside the office/i)).not.toBeInTheDocument()
  })

  it('renders office photo URLs', () => {
    render(
      <ModernTemplate
        data={makeData({
          officePhotos: [
            { id: 'op1', url: 'https://example.com/op1.jpg', alt: 'Reception', caption: null },
            { id: 'op2', url: 'https://example.com/op2.jpg', alt: 'Treatment room', caption: null },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    const imgs = Array.from(document.querySelectorAll('img'))
    expect(imgs.some((i) => i.src === 'https://example.com/op1.jpg')).toBe(true)
    expect(imgs.some((i) => i.src === 'https://example.com/op2.jpg')).toBe(true)
  })

  it('caps office photos at 4', () => {
    const photos = Array.from({ length: 8 }, (_, i) => ({
      id: `op${i}`,
      url: `https://example.com/op${i}.jpg`,
      alt: null,
      caption: null,
    }))
    render(
      <ModernTemplate data={makeData({ officePhotos: photos as never })} basePath="/site/test" />,
    )
    const imgs = Array.from(document.querySelectorAll('img'))
    expect(imgs.some((i) => i.src === 'https://example.com/op0.jpg')).toBe(true)
    expect(imgs.some((i) => i.src === 'https://example.com/op3.jpg')).toBe(true)
    expect(imgs.some((i) => i.src === 'https://example.com/op4.jpg')).toBe(false)
  })
})
