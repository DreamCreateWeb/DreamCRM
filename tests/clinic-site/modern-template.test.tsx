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
  it('renders the clinic display name as the H1', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    expect(screen.getByRole('heading', { level: 1, name: /Test Dental/ })).toBeInTheDocument()
  })

  it('renders the tagline', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    expect(screen.getAllByText('Caring for smiles').length).toBeGreaterThan(0)
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
    expect(screen.queryByText(/^About Test Dental$/)).not.toBeInTheDocument()
  })

  it('renders the about section with the clinic-name eyebrow when provided', () => {
    render(
      <ModernTemplate
        data={makeData({ about: 'We are a friendly local dentist office.' })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText(/About Test Dental/)).toBeInTheDocument()
    expect(screen.getByText(/friendly local dentist office/)).toBeInTheDocument()
  })

  it('formats hours in 12-hour format', () => {
    render(
      <ModernTemplate
        data={makeData({ hours: { mon: { open: '09:00', close: '17:00' } } as never })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText(/9:00 AM – 5:00 PM/)).toBeInTheDocument()
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

  it('renders in-page anchor nav (services + contact)', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href') === '/site/test#services')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/site/test#contact')).toBe(true)
  })

  it('adds a Team nav anchor only when staff are present', () => {
    const { rerender } = render(<ModernTemplate data={makeData({ staff: null as never })} basePath="/site/test" />)
    expect(
      screen.queryAllByRole('link').some((a) => a.getAttribute('href') === '/site/test#team'),
    ).toBe(false)
    rerender(
      <ModernTemplate
        data={makeData({ staff: [{ id: 'p1', name: 'Dr. Jane' }] as never })}
        basePath="/site/test"
      />,
    )
    expect(
      screen.queryAllByRole('link').some((a) => a.getAttribute('href') === '/site/test#team'),
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
    expect(screen.getByText('Cleanings & Exams')).toBeInTheDocument()
    expect(screen.getByText('Cosmetic Dentistry')).toBeInTheDocument()
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
    expect(screen.getByText('Teeth Whitening')).toBeInTheDocument()
    expect(screen.getByText('Brighter in one visit')).toBeInTheDocument()
    expect(screen.getByText('Implants')).toBeInTheDocument()
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
    render(
      <ModernTemplate
        data={makeData({ logoUrl: 'https://example.com/logo.png' })}
        basePath="/site/test"
      />,
    )
    const logo = screen.getByAltText('Test Dental') as HTMLImageElement
    expect(logo.src).toBe('https://example.com/logo.png')
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

  it('falls back to anti-shame default subhead when tagline is null', () => {
    render(<ModernTemplate data={makeData({ tagline: null })} basePath="/site/test" />)
    expect(screen.getByText(/No judgment, ever/i)).toBeInTheDocument()
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

  it('caps services at 6 on the homepage', () => {
    const services = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      name: `Service ${i}`,
      description: null,
    }))
    render(
      <ModernTemplate data={makeData({ services: services as never })} basePath="/site/test" />,
    )
    expect(screen.getByText('Service 0')).toBeInTheDocument()
    expect(screen.getByText('Service 5')).toBeInTheDocument()
    // 7+ should not render
    expect(screen.queryByText('Service 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Service 9')).not.toBeInTheDocument()
  })

  it('renders the sticky mobile Book + Call bar', () => {
    render(
      <ModernTemplate
        data={makeData({ planTier: 'pro', phone: '(555) 123-4567' })}
        basePath="/site/test"
      />,
    )
    // The sticky bar lives in a fixed container — look for its Call aria-label
    expect(
      screen.getByRole('link', { name: /Call Test Dental/i }),
    ).toHaveAttribute('href', 'tel:(555) 123-4567')
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
    expect(screen.getByText('Brooklyn, NY')).toBeInTheDocument()
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
    expect(screen.getByText('Brooklyn, NY')).toBeInTheDocument()
  })

  // ── Looping marquee (> 3 testimonials) ─────────────────────────────

  it('renders testimonials as a static grid when there are 3 or fewer', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({
          testimonials: [
            { id: 't1', quote: 'q1', authorName: 'A B.', authorLocation: null, authorPhotoUrl: null },
            { id: 't2', quote: 'q2', authorName: 'C D.', authorLocation: null, authorPhotoUrl: null },
            { id: 't3', quote: 'q3', authorName: 'E F.', authorLocation: null, authorPhotoUrl: null },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    // No marquee structures — the static grid is used.
    expect(container.querySelector('[aria-roledescription="carousel"]')).toBeNull()
    // Each testimonial is rendered exactly once (no duplication for the loop).
    expect(screen.getAllByText(/q1/i)).toHaveLength(1)
    expect(screen.getAllByText(/q2/i)).toHaveLength(1)
    expect(screen.getAllByText(/q3/i)).toHaveLength(1)
  })

  it('switches to the looping marquee when > 3 testimonials are featured', () => {
    const testimonials = Array.from({ length: 5 }, (_, i) => ({
      id: `tm${i}`,
      quote: `Quote ${i}`,
      authorName: `Person ${i}`,
      authorLocation: 'City, ST',
      authorPhotoUrl: null,
    }))
    const { container } = render(
      <ModernTemplate
        data={makeData({ testimonials: testimonials as never })}
        basePath="/site/test"
      />,
    )
    const marquee = container.querySelector('[aria-roledescription="carousel"]')
    expect(marquee).not.toBeNull()
    // Cards are duplicated for the seamless loop — each quote appears twice
    // in the DOM. Screen readers only see one of each (aria-hidden on dupes).
    expect(screen.getAllByText(/Quote 0/)).toHaveLength(2)
    expect(screen.getAllByText(/Quote 4/)).toHaveLength(2)
  })

  it('hides duplicate marquee cards from assistive tech (aria-hidden on the second pass)', () => {
    const testimonials = Array.from({ length: 4 }, (_, i) => ({
      id: `tm${i}`,
      quote: `Quote ${i}`,
      authorName: `Person ${i}`,
      authorLocation: null,
      authorPhotoUrl: null,
    }))
    const { container } = render(
      <ModernTemplate
        data={makeData({ testimonials: testimonials as never })}
        basePath="/site/test"
      />,
    )
    // 4 testimonials × 2 (visible + duplicate) = 8 list items.
    const items = container.querySelectorAll('[aria-roledescription="carousel"] li')
    expect(items).toHaveLength(8)
    // Exactly half should be aria-hidden — the duplicates.
    const hidden = Array.from(items).filter((el) => el.getAttribute('aria-hidden') === 'true')
    expect(hidden).toHaveLength(4)
  })

  it('marquee handles a large set without throwing (50-cap defense)', () => {
    const testimonials = Array.from({ length: 80 }, (_, i) => ({
      id: `tm${i}`,
      quote: `Q ${i}`,
      authorName: `P ${i}`,
      authorLocation: null,
      authorPhotoUrl: null,
    }))
    const { container } = render(
      <ModernTemplate
        data={makeData({ testimonials: testimonials as never })}
        basePath="/site/test"
      />,
    )
    // Pre-render cap at 50 testimonials × 2 for the loop = 100 items max.
    const items = container.querySelectorAll('[aria-roledescription="carousel"] li')
    expect(items.length).toBe(100)
  })

  it('marquee animation class names are deterministic (no Math.random — SSR-safe)', () => {
    const testimonials = Array.from({ length: 5 }, (_, i) => ({
      id: `stable-${i}`,
      quote: `Q ${i}`,
      authorName: `P ${i}`,
      authorLocation: null,
      authorPhotoUrl: null,
    }))
    const first = render(
      <ModernTemplate data={makeData({ testimonials: testimonials as never })} basePath="/site/test" />,
    )
    const firstStyle = first.container.querySelector('style')?.textContent ?? ''
    first.unmount()
    const second = render(
      <ModernTemplate data={makeData({ testimonials: testimonials as never })} basePath="/site/test" />,
    )
    const secondStyle = second.container.querySelector('style')?.textContent ?? ''
    // Identical testimonial id list → identical generated class names → no
    // hydration mismatch between SSR + client.
    expect(firstStyle).toBe(secondStyle)
  })

  it('renders an initial letter avatar when no testimonial photo is set', () => {
    render(
      <ModernTemplate
        data={makeData({
          testimonials: [
            {
              id: 't1',
              quote: 'Q.',
              authorName: 'Marcus T.',
              authorLocation: null,
              authorPhotoUrl: null,
            },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText('M')).toBeInTheDocument()
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
