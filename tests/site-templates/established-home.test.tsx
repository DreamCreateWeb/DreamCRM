import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import EstablishedHome, { accentLastWord, pickDoctor } from '@/components/clinic-site/templates/established/home'
import { establishedTemplate } from '@/lib/site-templates/established'
import { nameInitials } from '@/components/clinic-site/name-initials'
import { buildEstablishedPalette } from '@/lib/site-templates/established/palette'
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
    bookLabel: establishedTemplate.bookLabel,
    recentPosts: [],
    reviewCount: 0,
    featuredGoogleReviews: [],
    googleRating: null,
    ...over,
  }
}

/**
 * Established — the credentialed practice (2026-09-28). What this file pins
 * is the template's SIGNATURE, the things a restyle could lose while every
 * conformance check still passed: the italic accent word, the crest, the
 * box score's honesty, and the doctor-first roster.
 */
describe('EstablishedHome', () => {
  it('sets the last word of every headline in the accent italic, punctuation outside the word', () => {
    const html = renderToStaticMarkup(<>{accentLastWord('The voice of dentistry in Arkansas.')}</>)
    expect(html).toContain('<em')
    expect(html).toMatch(/<em[^>]*>Arkansas<\/em>\./)
    // A one-word headline is left alone rather than italicised whole.
    expect(renderToStaticMarkup(<>{accentLastWord('Welcome')}</>)).not.toContain('<em')
  })

  it('renders the crest with the practice name on its ring, and the monogram when there is no logo', () => {
    const data = FIXTURES.empty()
    const { container } = render(<EstablishedHome {...props(data)} />)
    const ring = container.querySelector('textPath')
    expect(ring?.textContent).toBe((data.profile.displayName as string).toUpperCase())
    // No logo → the serif monogram sits in the disc.
    expect(container.querySelector('svg text[font-style="italic"]')?.textContent).toBe('NS')
    cleanup()
  })

  it('puts the logo in the crest and drops the monogram when the clinic has one', () => {
    const { container } = render(<EstablishedHome {...props(FIXTURES.rich())} />)
    expect(container.querySelector('svg text[font-style="italic"]')).toBeNull()
    cleanup()
  })

  it('the box score drops a zero review count rather than printing "0"', () => {
    // richClinic carries a dynamic review_count stat; with no reviews the
    // row must vanish, and with reviews it must read the live number.
    const zero = render(<EstablishedHome {...props(FIXTURES.rich(), { reviewCount: 0 })} />)
    expect(zero.container.querySelector('dl')?.textContent).not.toContain('happy patients')
    cleanup()
    const some = render(<EstablishedHome {...props(FIXTURES.rich(), { reviewCount: 240 })} />)
    expect(some.container.querySelector('dl')?.textContent).toContain('240+')
    expect(some.container.querySelector('dl')?.textContent).toContain('happy patients')
    cleanup()
  })

  it('leads the practice band with the credentialed doctor, not the first name on the roster', () => {
    expect(
      pickDoctor([
        { id: 'a', name: 'Jordan Reyes', title: 'Office Manager' },
        { id: 'b', name: 'Dr. Maya Patel', title: 'DDS' },
      ])?.id,
    ).toBe('b')
    expect(pickDoctor([{ id: 'a', name: 'Jordan Reyes' }])?.id).toBe('a')
    expect(pickDoctor([])).toBeNull()
  })

  it('monograms skip honorifics and middle initials', () => {
    expect(nameInitials('Dr. Ted M. Pinney')).toBe('TP')
    expect(nameInitials('Complete Family Dentistry')).toBe('CF')
    expect(nameInitials('Q')).toBe('Q')
  })

  it('speaks the visit voice and hosts #contact when self-booking is off', () => {
    const { container } = render(<EstablishedHome {...props(FIXTURES.empty())} />)
    expect(container.textContent).toContain('Book a Visit')
    expect(container.querySelector('#contact')).toBeTruthy()
    cleanup()
  })

  it('keeps Studio wiring on the canonical fields', () => {
    const { container } = render(<EstablishedHome {...props(FIXTURES.rich())} />)
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

describe('the Established palette', () => {
  it('keeps the ink navy and the ground cream whatever the brand is — the brand is the accent', () => {
    for (const brand of ['#B5121B', '#1D4ED8', '#FFE900', '#FFFFFF', null]) {
      const p = buildEstablishedPalette(brand)
      expect(p.ink).toBe('#152238')
      expect(p.heading).toBe('#152238')
      expect(p.bg).toBe('#FAF7F0')
      expect(p.deep).toBe('#0F1B2D')
    }
  })

  it('a chromaless brand falls to the register-s own red rather than a gray accent', () => {
    const white = buildEstablishedPalette('#FFFFFF')
    const red = buildEstablishedPalette('#B5121B')
    expect(white.brandStrong).toBe(red.brandStrong)
  })

  it('keeps a red brand red — darkened only as far as white ink needs', () => {
    const p = buildEstablishedPalette('#C41E3A')
    // Hue stays in the red band: R dominates, G is low.
    const r = parseInt(p.brandStrong.slice(1, 3), 16)
    const g = parseInt(p.brandStrong.slice(3, 5), 16)
    expect(r).toBeGreaterThan(g + 80)
    expect(p.brandInk).toBe('#FFFFFF')
  })
})
