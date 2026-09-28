import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import HometeamHome, { pickSkipper } from '@/components/clinic-site/templates/hometeam/home'
import { hometeamTemplate } from '@/lib/site-templates/hometeam'
import { buildHometeamPalette, HOMETEAM_INK, HOMETEAM_DEEP } from '@/lib/site-templates/hometeam/palette'
import { FIXTURES } from '../fixtures/clinic-site-fixtures'
import type { HomePageProps } from '@/lib/site-templates/page-props'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

function props(data: ClinicSiteData, over: Partial<HomePageProps> = {}): HomePageProps {
  const staff = (data.profile.staff as unknown[] | null) ?? []
  return {
    data,
    basePath: '/site/fixture-dental',
    signInUrl: 'https://www.example.com/site/fixture-dental/portal',
    gates: {
      hasBlog: false,
      hasTeam: staff.length > 0,
      hasCareers: false,
      hasDentalPlans: false,
      hasColoringPages: false,
      selfBooking: false,
    },
    bookHref: '/site/fixture-dental#contact',
    bookLabel: hometeamTemplate.bookLabel,
    recentPosts: [],
    reviewCount: 0,
    featuredGoogleReviews: [],
    googleRating: null,
    ...over,
  }
}

/**
 * Home Team — the practice everyone in town knows (2026-09-28). What this
 * file pins is the template's SIGNATURE: the home plate, the scoreboard's
 * honesty, the jersey numbers, the doctor-first roster, and the palette's
 * uniform (charcoal + home whites) under any team color. The one thing it
 * also pins by ABSENCE: no baseball imagery — the structure and the voice
 * carry it, never a stitched ball.
 */
describe('HometeamHome', () => {
  it('renders the home plate with the town on it, and a monogram when there is no logo', () => {
    const data = FIXTURES.empty()
    const { container } = render(<HometeamHome {...props(data)} />)
    expect(container.querySelector('svg path[d*="L160 296"]')).toBeTruthy() // the pointed bottom
    expect(container.textContent).toContain('NS') // New Smile → NS
    cleanup()
  })

  it('the scoreboard drops a zero review count rather than printing "0"', () => {
    const zero = render(<HometeamHome {...props(FIXTURES.rich(), { reviewCount: 0 })} />)
    expect(zero.container.querySelector('dl')?.textContent).not.toContain('happy patients')
    cleanup()
    const some = render(<HometeamHome {...props(FIXTURES.rich(), { reviewCount: 240 })} />)
    expect(some.container.querySelector('dl')?.textContent).toContain('240+')
    cleanup()
  })

  it('numbers the lineup like a roster, 01 through 06, and stops there', () => {
    const { container } = render(<HometeamHome {...props(FIXTURES.rich())} />)
    const text = container.textContent ?? ''
    expect(text).toContain('01')
    expect(text).toContain('06')
    expect(text).not.toContain('07')
    expect(text).toContain('The lineup')
    cleanup()
  })

  it('leads with the credentialed doctor as the skipper', () => {
    expect(
      pickSkipper([
        { id: 'a', name: 'Jordan Reyes', title: 'Office Manager' },
        { id: 'b', name: 'Dr. Maya Patel', title: 'DDS' },
      ])?.id,
    ).toBe('b')
    expect(pickSkipper([])).toBeNull()
    const { container } = render(<HometeamHome {...props(FIXTURES.rich())} />)
    expect(container.textContent).toContain('The skipper')
    expect(container.textContent).toContain('Dr. Maya Patel')
    cleanup()
  })

  it('draws no baseball imagery: the structure carries it', () => {
    const { container } = render(<HometeamHome {...props(FIXTURES.rich())} />)
    expect(container.querySelector('img[src*="baseball"], img[src*="stitch"]')).toBeNull()
    expect(container.textContent).not.toMatch(/⚾/)
    cleanup()
  })

  it('speaks the visit voice and hosts #contact when self-booking is off', () => {
    const { container } = render(<HometeamHome {...props(FIXTURES.empty())} />)
    expect(container.textContent).toContain('Book a Visit')
    expect(container.querySelector('#contact')).toBeTruthy()
    cleanup()
  })

  it('keeps Studio wiring on the canonical fields', () => {
    const { container } = render(<HometeamHome {...props(FIXTURES.rich())} />)
    const f = (sel: string) => container.querySelector(sel)
    expect(f('[data-edit-field="tagline"][data-edit-kind="text"]')).toBeTruthy()
    expect(f('[data-edit-field="heroImageUrl"][data-edit-kind="image"]')).toBeTruthy()
    expect(f('[data-edit-field="services"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="stats"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="staff"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="testimonials"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="officePhotos"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="hours"][data-edit-kind="modal"]')).toBeTruthy()
    cleanup()
  })
})

describe('the Home Team palette', () => {
  it('keeps the uniform — charcoal ink, charcoal scoreboard, home-whites paper — under any team color', () => {
    for (const brand of ['#40C0E0', '#B5121B', '#FFE900', '#FFFFFF', null]) {
      const p = buildHometeamPalette(brand)
      expect(p.ink).toBe(HOMETEAM_INK)
      expect(p.heading).toBe(HOMETEAM_INK)
      expect(p.deep).toBe(HOMETEAM_DEEP)
      expect(p.bg.toLowerCase()).not.toBe('#ffffff')
    }
  })

  it('a chromaless brand has no team color and falls to the sky', () => {
    expect(buildHometeamPalette('#FFFFFF').strip).toBe(buildHometeamPalette(null).strip)
  })

  it('keeps a sky-blue team color sky blue on the trim, and drives the same hue deep for buttons', () => {
    const p = buildHometeamPalette('#40C0E0')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(p.strip.slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(r + 60) // blue dominates on the trim
    expect(g).toBeGreaterThan(r + 40)
    expect(p.brandInk).toBe('#FFFFFF')
    const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(p.brandStrong.slice(i, i + 2), 16))
    expect(b2).toBeGreaterThan(r2) // still the team's hue, deeper
    expect(g2).toBeGreaterThan(r2)
  })
})
