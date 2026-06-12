import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ModernTemplate, { formatReviewCount } from '@/components/clinic-site/modern-template'
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
      differenceVideoUrl: null,
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

  describe('brand-tinted hero placeholders (Day-0 imagery floor)', () => {
    it('paints an empty hero oval with a brand-derived gradient (not a flat fill)', () => {
      const { container } = render(
        <ModernTemplate data={makeData({ heroImageUrl: null, brandColor: '#2A7F8C' })} basePath="/site/test" />,
      )
      // The empty oval is a round div carrying a brand-derived radial gradient
      // (so a photo-less site still looks designed). Find round divs whose
      // inline backgroundImage references the brand color.
      const rounds = Array.from(container.querySelectorAll('div')).filter((d) =>
        (d.getAttribute('style') ?? '').includes('border-radius: 50%'),
      )
      const brandTinted = rounds.filter((d) => {
        const style = d.getAttribute('style') ?? ''
        return style.includes('radial-gradient') && style.toLowerCase().includes('#2a7f8c')
      })
      expect(brandTinted.length).toBeGreaterThan(0)
    })

    it('renders the decorative line-motif SVG over an empty oval', () => {
      const { container } = render(
        <ModernTemplate data={makeData({ heroImageUrl: null, brandColor: '#2A7F8C' })} basePath="/site/test" />,
      )
      // The motif is an aria-hidden SVG with brand-colored concentric circles
      // (stroke is set on the wrapping <g>). Find groups stroked in the brand
      // color that contain circles.
      const groups = Array.from(container.querySelectorAll('svg g')).filter(
        (g) =>
          (g.getAttribute('stroke') ?? '').toLowerCase() === '#2a7f8c' &&
          g.querySelectorAll('circle').length > 0,
      )
      expect(groups.length).toBeGreaterThan(0)
    })

    it('keeps the WITH-photo path unchanged: renders the <img>, no gradient/motif', () => {
      const heroUrl = 'https://example.com/hero.jpg'
      const { container } = render(
        <ModernTemplate
          data={makeData({ heroImageUrl: heroUrl, brandColor: '#2A7F8C' })}
          basePath="/site/test"
        />,
      )
      // The hero photo renders as an <img> with the supplied src.
      const imgs = Array.from(container.querySelectorAll('img')).filter(
        (i) => i.getAttribute('src') === heroUrl,
      )
      expect(imgs.length).toBeGreaterThan(0)
      // The oval that now holds the photo is a plain backgroundColor fill — no
      // brand gradient painted behind a present photo (left hero oval).
      const photoOval = imgs[0].closest('div')
      expect(photoOval?.getAttribute('style') ?? '').not.toContain('radial-gradient')
    })
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
    // FAQ now lives under the About dropdown — open the mobile drawer so
    // every nav link (top-level + children) is queryable. Phone users see
    // the full list there anyway.
    fireEvent.click(screen.getByRole('button', { name: /Open menu/i }))
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href') === '/site/test/services')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/site/test/about')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/site/test/faq')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '/site/test#contact')).toBe(true)
  })

  it('surfaces a Blog nav link only when hasBlog is true', () => {
    const { rerender } = render(<ModernTemplate data={makeData()} basePath="/site/test" hasBlog={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Open menu/i }))
    expect(
      screen.queryAllByRole('link').some((a) => a.getAttribute('href') === '/site/test/blog'),
    ).toBe(false)
    rerender(<ModernTemplate data={makeData()} basePath="/site/test" hasBlog />)
    fireEvent.click(screen.getByRole('button', { name: /Open menu/i }))
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

  it('renders NO services when none are configured (no phantom defaults)', () => {
    // Placeholder services had no library content behind them and produced
    // broken detail pages on brand-new clinics — services only come from
    // the library now (see the new-clinic baseline suite below).
    render(<ModernTemplate data={makeData({ services: null as never })} basePath="/site/test" />)
    expect(screen.queryByText('Cleanings & Exams')).not.toBeInTheDocument()
    expect(screen.queryByText('Cosmetic Dentistry')).not.toBeInTheDocument()
  })

  it('renders configured service names in the hero pill carousel', () => {
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
    // Service NAMES appear in the hero pill carousel (and the "Difference"
    // section's value-prop chips when applicable). Descriptions no longer
    // render on the homepage — the dedicated services-pillars section was
    // removed in favor of putting the testimonials carousel right under
    // the hero. The full catalog (with descriptions) lives at /services.
    expect(screen.getAllByText('Teeth Whitening').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Brighter in one visit')).not.toBeInTheDocument()
    expect(screen.getAllByText('Implants').length).toBeGreaterThanOrEqual(1)
  })

  it('does not render the staff grid on the homepage (it lives on /about now)', () => {
    // The standalone "people who care for you" staff grid was removed to
    // match Tend's homepage flow (clinical-team trust → blog → CTA →
    // footer). The full staff roster lives on /about; the homepage only
    // carries the clinical-team trust band + a "Meet our team →" link.
    render(
      <ModernTemplate
        data={makeData({
          staff: [
            { id: 'p1', name: 'Dr. Jane Smith', title: 'Lead Dentist', bio: '15 years.', photoUrl: null },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.queryByText(/people who care/i)).not.toBeInTheDocument()
    expect(screen.queryByText('15 years.')).not.toBeInTheDocument()
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

  it('renders the hero phone CTA as an outline pill with no icon', () => {
    render(<ModernTemplate data={makeData({ phone: '(555) 123-4567' })} basePath="/site/test" />)
    const heroSection = document.querySelector('section.relative.overflow-hidden')
    const heroPhoneCta = heroSection!.querySelector('a[href="tel:(555) 123-4567"]')
    expect(heroPhoneCta).not.toBeNull()
    // No icon SVG inside the hero phone CTA — Tend's pattern is text-only
    // with a brand-color border + matching text.
    expect(heroPhoneCta!.querySelector('svg')).toBeNull()
    // White background (outline pill), not the prior tan fill.
    expect(heroPhoneCta!.className).toMatch(/bg-white/)
  })

  it('renders the hero photo backdrops as the hardcoded neutral pastels (not brand color)', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({ brandColor: '#9CAF9F' })}
        basePath="/site/test"
      />,
    )
    const heroSection = container.querySelector('section.relative.overflow-hidden')!
    // Walk the hero's hidden lg:block photo wrappers; their inner oval div
    // carries the inline backgroundColor we hardcode (blue + peach).
    const html = heroSection.innerHTML
    expect(html).toMatch(/#B8D4E8/i) // light blue (left photo backdrop)
    expect(html).toMatch(/#F0D9BD/i) // warm peach (right photo backdrop)
  })

  it('renders the secondary hero H2 with bold (not italic) emphasis on "all your needs"', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const heroSection = document.querySelector('section.relative.overflow-hidden')!
    // The secondary H2 lives inside the hero text column.
    const h2s = Array.from(heroSection.querySelectorAll('h2'))
    const target = h2s.find((h) => /all your needs/i.test(h.textContent ?? ''))
    expect(target).toBeDefined()
    const strong = target!.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong!.textContent).toMatch(/all your needs/i)
    // <strong> must NOT carry the italic class — Tend's emphasis is bold-only.
    expect(strong!.className).not.toMatch(/\bitalic\b/)
    // Should carry a bold-weight class.
    expect(strong!.className).toMatch(/font-(bold|semibold)/)
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
    // Universal value-prop chips appear in the closer strip + the "difference"
    // chip checklist. Wave 4 universalized them to voice/quality claims (no
    // operational "same-week" / "most insurance" promises).
    expect(screen.getAllByText(/No judgment, ever/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Gentle, modern care/i).length).toBeGreaterThanOrEqual(1)
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

  it('renders service pills below the hero linking to /services', () => {
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
    // Pills now point at the standalone /services index page (the prior
    // on-page #services anchor was removed when the services-pillars
    // section was deleted in favor of putting the testimonials carousel
    // right under the hero).
    const pillLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/test/services')
    expect(pillLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('renders the full weekly hours in the footer when hours are configured', () => {
    const hours = { mon: { open: '09:00', close: '17:00' } } as never
    render(<ModernTemplate data={makeData({ hours })} basePath="/site/test" />)
    // The standalone Hours section was removed; full weekly hours now live
    // in the footer "Visit" column. Monday's open hours render as a 12-hour
    // range there.
    expect(screen.getAllByText(/9:00 AM – 5:00 PM/).length).toBeGreaterThanOrEqual(1)
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

  it('caps services at 6 in the hero pill carousel', () => {
    const services = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      name: `Service ${i}`,
      description: null,
    }))
    const { container } = render(
      <ModernTemplate data={makeData({ services: services as never })} basePath="/site/test" />,
    )
    // Main body = everything inside <main>. The pill carousel renders
    // services 0-5 (cap of 6). Items 6+ never appear inside <main>; the
    // full catalog lives at /services. The footer separately surfaces
    // up to 8 entries (asserted elsewhere).
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

  // ── Dynamic stats — live review count ──────────────────────────────

  it('substitutes the dynamic review_count stat with the live count', () => {
    render(
      <ModernTemplate
        data={makeData({
          stats: [
            { id: 'st_reviews', value: '0', label: 'happy reviews', dynamic: 'review_count' },
            { id: 'st2', value: 'Same-week', label: 'appointments' },
          ] as never,
        })}
        basePath="/site/test"
        reviewCount={47}
      />,
    )
    // 47 formats to "47+" (medium count, rounded preserved exact since <100)
    expect(screen.getByText('47+')).toBeInTheDocument()
    expect(screen.getByText('happy reviews')).toBeInTheDocument()
    // The hardcoded value "0" should NOT be rendered — it was overridden
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('drops the dynamic review_count stat when the live count is zero', () => {
    // Fresh clinic with no reviews — the dynamic stat row must hide rather
    // than render "0 happy reviews" (would look broken on a real site).
    render(
      <ModernTemplate
        data={makeData({
          stats: [
            { id: 'st_reviews', value: '0', label: 'happy reviews', dynamic: 'review_count' },
            { id: 'st2', value: 'Same-week', label: 'appointments' },
          ] as never,
        })}
        basePath="/site/test"
        reviewCount={0}
      />,
    )
    expect(screen.queryByText('happy reviews')).not.toBeInTheDocument()
    // The other static stat survives
    expect(screen.getByText('Same-week')).toBeInTheDocument()
  })

  it('hides the whole stats section when the dynamic stat is the only one and count is zero', () => {
    render(
      <ModernTemplate
        data={makeData({
          stats: [
            { id: 'st_reviews', value: '0', label: 'happy reviews', dynamic: 'review_count' },
          ] as never,
        })}
        basePath="/site/test"
        reviewCount={0}
      />,
    )
    expect(screen.queryByText('happy reviews')).not.toBeInTheDocument()
  })

  describe('formatReviewCount', () => {
    it('renders small counts exact (under 10)', () => {
      expect(formatReviewCount(0)).toBe('0')
      expect(formatReviewCount(5)).toBe('5')
      expect(formatReviewCount(9)).toBe('9')
    })
    it('appends "+" to two-digit counts', () => {
      expect(formatReviewCount(47)).toBe('47+')
      expect(formatReviewCount(99)).toBe('99+')
    })
    it('rounds three-digit counts down to the nearest 10', () => {
      expect(formatReviewCount(234)).toBe('230+')
      expect(formatReviewCount(999)).toBe('990+')
    })
    it('collapses thousands to "k+" notation', () => {
      expect(formatReviewCount(1234)).toBe('1.2k+')
      expect(formatReviewCount(8500)).toBe('8.5k+')
      // Strip ".0" so "1000" formats to "1k+" not "1.0k+"
      expect(formatReviewCount(1000)).toBe('1k+')
    })
    it('uses whole-number "k+" for counts over 10k', () => {
      expect(formatReviewCount(12345)).toBe('12k+')
      expect(formatReviewCount(8500)).toBe('8.5k+') // under 10k stays decimal
    })
  })

  // ── Difference section — video vs image ────────────────────────────

  it('renders an autoplay <video> in the difference section when differenceVideoUrl is set', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({
          differenceVideoUrl: 'https://example.com/dental-loop.mp4',
        } as never)}
        basePath="/site/test"
      />,
    )
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('loop')
    // muted is required for autoplay on every modern browser
    // jsdom serializes the muted property differently; the React-applied
    // attribute is set as a boolean prop. Check via the property too.
    expect(video!.muted).toBe(true)
    const source = video!.querySelector('source')
    expect(source).toHaveAttribute('src', 'https://example.com/dental-loop.mp4')
  })

  it('falls back to <img> in the difference section when differenceVideoUrl is null', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({ differenceVideoUrl: null, heroImageUrl: 'https://example.com/hero.jpg' } as never)}
        basePath="/site/test"
      />,
    )
    expect(container.querySelector('video')).toBeNull()
    // Hero image renders as an <img> somewhere (could be in the difference
    // section). Smoke check by counting images > 0.
    expect(container.querySelectorAll('img').length).toBeGreaterThan(0)
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
    // Each testimonial renders twice — the N+N doubled track that powers
    // the seamless infinite-loop wrap. The duplicates carry aria-hidden
    // for non-adjacent positions, so screen readers still hear each
    // quote once.
    expect(screen.getAllByText(/Quote 0/)).toHaveLength(2)
    expect(screen.getAllByText(/Quote 2/)).toHaveLength(2)
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
    // Template caps the array at 50 before handing it to the carousel;
    // the carousel then doubles to 100 DOM cards for the wrap.
    const items = container.querySelectorAll('[aria-roledescription="carousel"] ul > li')
    expect(items.length).toBe(100)
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

  it('does not render the standalone office-tour gallery (removed to match Tend)', () => {
    // The "A space designed to put you at ease" gallery band was removed.
    // Office photos still surface via the hero mobile-scroll + the
    // clinical-team trust ovals, but the dedicated gallery section + its
    // "Inside the office" eyebrow are gone — assert that even WITH photos.
    render(
      <ModernTemplate
        data={makeData({
          officePhotos: [
            { id: 'op1', url: 'https://example.com/op1.jpg', alt: null, caption: null },
            { id: 'op2', url: 'https://example.com/op2.jpg', alt: null, caption: null },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.queryByText(/Inside the office/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/A space designed to put you/i)).not.toBeInTheDocument()
  })

  it('surfaces office photo URLs (hero mobile scroll + clinical-team ovals)', () => {
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

  it('caps office photos at 4 in the hero mobile scroll', () => {
    const photos = Array.from({ length: 8 }, (_, i) => ({
      id: `op${i}`,
      url: `https://example.com/op${i}.jpg`,
      alt: null,
      caption: null,
    }))
    render(
      <ModernTemplate data={makeData({ officePhotos: photos as never })} basePath="/site/test" />,
    )
    // The hero mobile-scroll renders officePhotos.slice(0, 4) — op0..op3
    // appear, op4+ never do.
    const imgs = Array.from(document.querySelectorAll('img'))
    expect(imgs.some((i) => i.src === 'https://example.com/op0.jpg')).toBe(true)
    expect(imgs.some((i) => i.src === 'https://example.com/op3.jpg')).toBe(true)
    expect(imgs.some((i) => i.src === 'https://example.com/op4.jpg')).toBe(false)
  })

  // ── Blog band + contact gating ──────────────────────────────────────

  it('renders the "From the blog" band with up to 3 recent posts', () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      id: `post${i}`,
      slug: `post-${i}`,
      title: `Post Title ${i}`,
      excerpt: `Excerpt ${i}`,
      coverImageUrl: null,
      coverImageAlt: null,
      category: 'Oral Health',
    })) as never
    render(<ModernTemplate data={makeData()} basePath="/site/test" recentPosts={posts} />)
    expect(screen.getByText(/From the blog/i)).toBeInTheDocument()
    // Only the first 3 render; 4th+ are dropped.
    expect(screen.getByText('Post Title 0')).toBeInTheDocument()
    expect(screen.getByText('Post Title 2')).toBeInTheDocument()
    expect(screen.queryByText('Post Title 3')).not.toBeInTheDocument()
    // "View all posts" CTA → /blog
    const viewAll = screen.getByRole('link', { name: /View all posts/i })
    expect(viewAll).toHaveAttribute('href', '/site/test/blog')
    // Each card links to its post.
    expect(
      screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/site/test/blog/post-0'),
    ).toBe(true)
  })

  it('hides the blog band when there are no recent posts', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" recentPosts={[]} />)
    expect(screen.queryByText(/From the blog/i)).not.toBeInTheDocument()
  })

  it('renders the on-page contact form ONLY for basic-tier clinics', () => {
    // Pro/premium route every Book CTA to /book, so the homepage has no
    // on-page contact form (matches Tend — booking is always the widget).
    const { rerender } = render(
      <ModernTemplate data={makeData({ planTier: 'basic' })} basePath="/site/test" />,
    )
    expect(document.querySelector('#contact')).not.toBeNull()
    expect(screen.getByText(/We'd love to see you/i)).toBeInTheDocument()

    rerender(<ModernTemplate data={makeData({ planTier: 'pro' })} basePath="/site/test" />)
    expect(document.querySelector('#contact')).toBeNull()
  })

  // ── Location section (map + directions) ─────────────────────────────

  it('renders the Location section heading + map iframe + Get directions CTA when address is set', () => {
    render(
      <ModernTemplate
        data={makeData({
          addressLine1: '500 Main St',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
        })}
        basePath="/site/test"
      />,
    )
    // H2 includes the literal address line 1
    const heading = screen.getByRole('heading', { level: 2, name: /Come meet us at 500 Main St/i })
    expect(heading).toBeInTheDocument()
    // Address one-liner subhead
    expect(screen.getByText(/500 Main St, Austin, TX, 78701/)).toBeInTheDocument()
    // Keyless Google Maps iframe
    const iframe = document.querySelector('iframe[title^="Map showing"]') as HTMLIFrameElement | null
    expect(iframe).not.toBeNull()
    expect(iframe?.src).toContain('https://www.google.com/maps?q=')
    expect(iframe?.src).toContain('output=embed')
    // Address is URL-encoded into the q= parameter
    expect(iframe?.src).toMatch(/500%20Main%20St/)
    // "Get directions" CTA opens in a new tab and points at maps/dir
    const directions = screen.getByRole('link', { name: /Get directions/i })
    expect(directions).toHaveAttribute('target', '_blank')
    expect(directions.getAttribute('rel') ?? '').toMatch(/noopener/)
    expect(directions.getAttribute('href') ?? '').toContain('google.com/maps/dir/?api=1&destination=')
  })

  it('falls back to "Come meet us in {City, State}" when only city/state is set', () => {
    // Some clinics fill in city + state but leave the street address blank
    // (suite/office still in flux at sign-up). The Location section still
    // renders meaningfully without a street.
    render(
      <ModernTemplate
        data={makeData({ addressLine1: null, city: 'Austin', state: 'TX' })}
        basePath="/site/test"
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: /Come meet us in Austin, TX/i }),
    ).toBeInTheDocument()
  })

  it('omits the Location section entirely when no address is configured', () => {
    render(
      <ModernTemplate
        data={makeData({ addressLine1: null, city: null, state: null, postalCode: null })}
        basePath="/site/test"
      />,
    )
    expect(screen.queryByRole('heading', { name: /Come meet us/i })).not.toBeInTheDocument()
    expect(document.querySelector('iframe[title^="Map showing"]')).toBeNull()
    expect(screen.queryByRole('link', { name: /Get directions/i })).not.toBeInTheDocument()
  })

  it('prefers primaryLocation.addressLine1 over the profile-level address when both are set', () => {
    // Multi-location clinics keep the canonical address on clinic_location,
    // and the profile-level fields may be stale or empty. The Location
    // section should cite the location row's address verbatim — same
    // precedence as the Hours+Location card and the JSON-LD builder.
    const baseData = makeData({
      addressLine1: '999 Old St',
      city: 'Old City',
      state: 'TX',
    })
    const dataWithLocation: ClinicSiteData = {
      ...baseData,
      primaryLocation: {
        id: 'loc_primary',
        organizationId: 'org_1',
        name: 'Downtown',
        addressLine1: '500 Main St',
        addressLine2: null,
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        phone: null,
        isPrimary: 1,
        createdAt: new Date(),
      },
      locations: [],
    }
    render(<ModernTemplate data={dataWithLocation} basePath="/site/test" />)
    expect(
      screen.getByRole('heading', { level: 2, name: /Come meet us at 500 Main St/i }),
    ).toBeInTheDocument()
    // The Location section H2 + subhead must NOT cite the stale profile-level
    // street. (The legacy Hours+Location card lower on the page may still
    // render it from profile.addressLine1 when locations[] is empty — that's
    // a separate concern; the Location section is what we're locking in.)
    expect(
      screen.queryByRole('heading', { level: 2, name: /Come meet us at 999 Old St/i }),
    ).not.toBeInTheDocument()
  })

  // ── Insurance section (carrier list + verifier form) ────────────────

  it('renders the Insurance section heading + 2-col layout (carriers + verifier form)', () => {
    render(
      <ModernTemplate
        data={makeData({ acceptedInsuranceCarriers: ['Aetna', 'Cigna', 'Delta Dental'] as never })}
        basePath="/site/test"
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: /Dental insurance coverage/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Our insurance carriers/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Check your insurance/i })).toBeInTheDocument()
  })

  it('renders the carrier checklist from acceptedInsuranceCarriers', () => {
    render(
      <ModernTemplate
        data={makeData({
          acceptedInsuranceCarriers: [
            'Aetna',
            'Cigna',
            'Delta Dental',
            'Guardian',
            'MetLife',
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    // Each carrier renders in BOTH the visible checklist <ul> AND the
    // <select> dropdown options in the verifier form — so we expect two
    // hits per name (one <span> in the checklist + one <option>). The
    // checklist hit is the visible UI surface that matters here.
    expect(screen.getAllByText('Aetna').length).toBeGreaterThanOrEqual(1)
    const aetnaInChecklist = Array.from(document.querySelectorAll('li span')).find(
      (s) => s.textContent === 'Aetna',
    )
    expect(aetnaInChecklist).toBeTruthy()
    const checklistNames = Array.from(document.querySelectorAll('li span'))
      .map((s) => s.textContent)
      .filter((t): t is string => Boolean(t))
    expect(checklistNames).toContain('Aetna')
    expect(checklistNames).toContain('Cigna')
    expect(checklistNames).toContain('Delta Dental')
    expect(checklistNames).toContain('Guardian')
    expect(checklistNames).toContain('MetLife')
  })

  it('falls back to "call us to verify" copy when no carriers configured', () => {
    render(
      <ModernTemplate
        data={makeData({ acceptedInsuranceCarriers: null as never })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText(/call us to verify your specific plan/i)).toBeInTheDocument()
    // No CARRIER dropdown when the list is empty — front desk doesn't want
    // to surface a "please pick" question they can't honestly answer yet.
    // The service-of-interest dropdown (id=iv-service) is unrelated and
    // may still render when the clinic has services configured.
    expect(document.querySelector('#iv-carrier')).toBeNull()
  })

  it('renders the verifier form with email + phone inputs and a Check insurance submit', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const email = document.querySelector('#iv-email') as HTMLInputElement | null
    const phone = document.querySelector('#iv-phone') as HTMLInputElement | null
    expect(email).not.toBeNull()
    expect(email?.type).toBe('email')
    expect(email?.required).toBe(true)
    expect(phone).not.toBeNull()
    expect(phone?.type).toBe('tel')
    expect(phone?.required).toBe(true)
    expect(screen.getByRole('button', { name: /Check insurance/i })).toBeInTheDocument()
  })

  it('exposes the carrier dropdown with an "Other / not listed" option when carriers are configured', () => {
    render(
      <ModernTemplate
        data={makeData({
          acceptedInsuranceCarriers: ['Aetna', 'Cigna'] as never,
        })}
        basePath="/site/test"
      />,
    )
    const select = document.querySelector('#iv-carrier') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    const optionValues = Array.from(select?.options ?? []).map((o) => o.value)
    expect(optionValues).toContain('Aetna')
    expect(optionValues).toContain('Cigna')
    expect(optionValues).toContain('__other__')
  })

  it('keeps the Insurance section even when the rest of the site is empty (it is a request channel)', () => {
    // The Insurance section is the universal "ask about my plan" channel
    // and renders for every clinic so patients can always reach out — the
    // carrier list adapts, but the form is always there.
    render(
      <ModernTemplate
        data={makeData({
          about: null,
          phone: null,
          city: null,
          state: null,
          addressLine1: null,
          acceptedInsuranceCarriers: null as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: /Dental insurance coverage/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Check insurance/i })).toBeInTheDocument()
  })
})

describe('new-clinic baseline (no phantom content)', () => {
  it('renders zero services UI when the clinic has none — no placeholder service names', () => {
    render(<ModernTemplate data={makeData({ services: null as never })} basePath="/site/test" />)
    expect(screen.queryByText('Cleanings & Exams')).not.toBeInTheDocument()
    expect(screen.queryByText('Cosmetic Dentistry')).not.toBeInTheDocument()
    expect(screen.queryByText('Restorations')).not.toBeInTheDocument()
    expect(screen.queryByText('Emergency Care')).not.toBeInTheDocument()
  })

  it('offers a Studio-only add-services prompt so the picker stays reachable', () => {
    render(<ModernTemplate data={makeData({ services: null as never })} basePath="/site/test" />)
    const prompt = screen.getByText(/\+ Add your services/i)
    expect(prompt.closest('.dc-edit-only')).not.toBeNull()
  })

  it('never mirrors the hero image into the "Why us" media slot', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({ heroImageUrl: 'https://img.test/hero.jpg', officePhotos: null as never })}
        basePath="/site/test"
      />,
    )
    // The hero portrait may use the image, but the difference-section media
    // box (tagged differenceVideoUrl) must not duplicate it.
    const mediaBox = container.querySelector('[data-edit-field="differenceVideoUrl"]')
    expect(mediaBox).not.toBeNull()
    expect(mediaBox!.querySelector('img')).toBeNull()
    // Publicly hidden when there is no media at all (Studio-only prompt).
    expect(mediaBox!.closest('.dc-edit-only')).not.toBeNull()
  })

  it('uses an office photo for the "Why us" media when available', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({
          heroImageUrl: 'https://img.test/hero.jpg',
          officePhotos: [
            { id: 'p1', url: 'https://img.test/office-1.jpg' },
            { id: 'p2', url: 'https://img.test/office-2.jpg' },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    const mediaBox = container.querySelector('[data-edit-field="differenceVideoUrl"]')
    const img = mediaBox!.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://img.test/office-2.jpg')
    expect(img?.getAttribute('src')).not.toBe('https://img.test/hero.jpg')
  })

  it('does not show the SAME office photo in the right hero oval and the "Why us" media', () => {
    // Partial-fill regression: a clinic with exactly ONE office photo and no
    // second hero image used to render that single photo in BOTH the right
    // hero oval (heroImageUrl2 fallback) AND the difference-section media —
    // the same image twice on one page. The difference media must now pick a
    // DIFFERENT office photo, or hide if there isn't one.
    const { container } = render(
      <ModernTemplate
        data={makeData({
          heroImageUrl: 'https://img.test/hero.jpg',
          heroImageUrl2: null,
          officePhotos: [{ id: 'p1', url: 'https://img.test/only-office.jpg' }],
        } as never)}
        basePath="/site/test"
      />,
    )
    // Right hero oval falls back to the single office photo.
    const rightOval = container.querySelector('[data-edit-field="heroImageUrl2"] img')
    expect(rightOval?.getAttribute('src')).toBe('https://img.test/only-office.jpg')
    // The difference media must NOT reuse it — with no other photo, it stays
    // empty (Studio-only prompt) rather than duplicating.
    const mediaBox = container.querySelector('[data-edit-field="differenceVideoUrl"]')
    expect(mediaBox!.querySelector('img')).toBeNull()
    expect(mediaBox!.closest('.dc-edit-only')).not.toBeNull()
  })

  it('picks a distinct office photo for the "Why us" media when the first feeds the hero oval', () => {
    // With two office photos and no second hero image, the right oval takes
    // photo[0] and the difference media takes photo[1] — two distinct images.
    const { container } = render(
      <ModernTemplate
        data={makeData({
          heroImageUrl: 'https://img.test/hero.jpg',
          heroImageUrl2: null,
          officePhotos: [
            { id: 'p1', url: 'https://img.test/office-1.jpg' },
            { id: 'p2', url: 'https://img.test/office-2.jpg' },
          ],
        } as never)}
        basePath="/site/test"
      />,
    )
    const rightOval = container.querySelector('[data-edit-field="heroImageUrl2"] img')
    expect(rightOval?.getAttribute('src')).toBe('https://img.test/office-1.jpg')
    const media = container.querySelector('[data-edit-field="differenceVideoUrl"] img')
    expect(media?.getAttribute('src')).toBe('https://img.test/office-2.jpg')
    expect(media?.getAttribute('src')).not.toBe(rightOval?.getAttribute('src'))
  })

  it('hides empty trust-stats / team / testimonials sections publicly but offers Studio add-prompts', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({
          stats: null as never,
          staff: null as never,
          testimonials: null as never,
          officePhotos: null as never,
        })}
        basePath="/site/test"
      />,
    )
    // No public stat / testimonial section headings leak on a fresh clinic.
    expect(screen.queryByText(/Why people love/i)).not.toBeInTheDocument()
    // The three add-prompts exist and are all gated to the Studio.
    const statPrompt = screen.getByText(/\+ Add trust stats/i)
    const teamPrompt = screen.getByText(/\+ Add your team/i)
    const reviewPrompt = screen.getByText(/\+ Feature patient reviews/i)
    expect(statPrompt.closest('.dc-edit-only')).not.toBeNull()
    expect(teamPrompt.closest('.dc-edit-only')).not.toBeNull()
    expect(reviewPrompt.closest('.dc-edit-only')).not.toBeNull()
    // Each prompt is a real edit target wired to its section's modal field.
    expect(statPrompt.closest('[data-edit-field="stats"]')).not.toBeNull()
    expect(teamPrompt.closest('[data-edit-field="staff"]')).not.toBeNull()
    expect(reviewPrompt.closest('[data-edit-field="testimonials"]')).not.toBeNull()
  })

  it('drops the finish-your-homepage prompts once those sections have content', () => {
    render(
      <ModernTemplate
        data={makeData({
          stats: [{ id: 's1', value: '10+', label: 'Years' }] as never,
          staff: [{ id: 'st1', name: 'Dr. Jane Lee', photoUrl: 'https://img.test/jane.jpg' }] as never,
          testimonials: [
            { id: 't1', quote: 'Lovely.', authorName: 'A. B.', authorLocation: 'City, ST', authorPhotoUrl: null },
          ] as never,
        })}
        basePath="/site/test"
      />,
    )
    expect(screen.queryByText(/\+ Add trust stats/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\+ Add your team/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\+ Feature patient reviews/i)).not.toBeInTheDocument()
  })

  it('renders empty hero ovals as clean decorative shapes with a Studio-only add hint (no broken image)', () => {
    const { container } = render(
      <ModernTemplate
        data={makeData({ heroImageUrl: null, heroImageUrl2: null, officePhotos: null as never })}
        basePath="/site/test"
      />,
    )
    const leftOval = container.querySelector('[data-edit-field="heroImageUrl"]')
    const rightOval = container.querySelector('[data-edit-field="heroImageUrl2"]')
    expect(leftOval).not.toBeNull()
    expect(rightOval).not.toBeNull()
    // No <img> at all when empty — so there is no broken-image / empty-alt state.
    expect(leftOval!.querySelector('img')).toBeNull()
    expect(rightOval!.querySelector('img')).toBeNull()
    // The "+ Add a photo" hint exists and is Studio-gated (hidden publicly).
    const hints = screen.getAllByText(/\+ Add a photo/i)
    expect(hints.length).toBeGreaterThanOrEqual(2)
    for (const h of hints) expect(h.closest('.dc-edit-only')).not.toBeNull()
  })
})
