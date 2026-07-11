import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import CosmeticHome, { pickHeroDoctor } from '@/components/clinic-site/templates/cosmetic/home'
import { cosmeticTemplate } from '@/lib/site-templates/cosmetic'
import { FIXTURES } from '../fixtures/clinic-site-fixtures'
import type { HomePageProps } from '@/lib/site-templates/page-props'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

function props(data: ClinicSiteData, over: Partial<HomePageProps> = {}): HomePageProps {
  const staff = (data.profile.staff as unknown[] | null) ?? []
  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
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
      isPro,
      selfBooking: true,
    },
    bookHref: isPro ? '/site/fixture-dental/book' : '/site/fixture-dental#contact',
    bookLabel: cosmeticTemplate.bookLabel,
    recentPosts: [],
    reviewCount: 0,
    featuredGoogleReviews: [],
    googleRating: null,
    ...over,
  }
}

describe('CosmeticHome', () => {
  it('speaks the consultation voice, never "Book a Visit"', () => {
    const { container } = render(<CosmeticHome {...props(FIXTURES.rich())} />)
    expect(container.textContent).toContain('Book a Consultation')
    expect(container.textContent).not.toContain('Book a Visit')
    cleanup()
  })

  it('features the credentialed doctor as the hero subject', () => {
    render(<CosmeticHome {...props(FIXTURES.rich())} />)
    // Dr. Maya Patel (DDS) leads even though she is first among two staff —
    // and her name appears in both the hero figcaption and the feature band.
    expect(screen.getAllByText(/Dr\. Maya Patel/).length).toBeGreaterThan(0)
    cleanup()
  })

  it('NEVER surfaces a price on the Home surface (luxury no-pricing rule)', () => {
    const { container } = render(<CosmeticHome {...props(FIXTURES.rich())} />)
    expect(container.textContent).not.toMatch(/\$\s?\d/)
    cleanup()
  })

  it('caps the services index at 6 with numbered entries', () => {
    const { container } = render(<CosmeticHome {...props(FIXTURES.rich())} />)
    // richClinic has 7 services; the index shows 01–06 only.
    expect(container.textContent).toContain('01')
    expect(container.textContent).toContain('06')
    expect(container.textContent).not.toContain('07')
    cleanup()
  })

  it('renders the day-0 empty clinic without crashing (typographic hero, no dead links)', () => {
    const data = FIXTURES.empty()
    const { container } = render(<CosmeticHome {...props(data)} />)
    expect(container.textContent).toContain('New Smile Dental')
    // Basic tier → the #contact section hosts the shared ContactForm core.
    expect(container.querySelector('#contact')).toBeTruthy()
    cleanup()
  })

  it('keeps Studio wiring on the canonical fields (tagline text + hero image + section modals)', () => {
    const { container } = render(<CosmeticHome {...props(FIXTURES.rich())} />)
    const f = (sel: string) => container.querySelector(sel)
    expect(f('[data-edit-field="tagline"][data-edit-kind="text"]')).toBeTruthy()
    expect(f('[data-edit-field="heroImageUrl"][data-edit-kind="image"]')).toBeTruthy()
    expect(f('[data-edit-field="services"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="testimonials"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="officePhotos"][data-edit-kind="modal"]')).toBeTruthy()
    cleanup()
  })
})

describe('pickHeroDoctor', () => {
  it('prefers the credentialed member over list order', () => {
    const staff = [
      { id: 'a', name: 'Jordan Reyes', title: 'Office Manager' },
      { id: 'b', name: 'Maya Patel', title: 'DDS' },
    ]
    expect(pickHeroDoctor(staff as never)?.id).toBe('b')
  })
  it('falls back to the first member when nobody is credentialed', () => {
    const staff = [{ id: 'a', name: 'Jordan Reyes' }]
    expect(pickHeroDoctor(staff as never)?.id).toBe('a')
  })
  it('returns null for an empty roster', () => {
    expect(pickHeroDoctor([])).toBeNull()
  })
})
