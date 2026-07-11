import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import PediatricHome from '@/components/clinic-site/templates/pediatric/home'
import { pediatricTemplate } from '@/lib/site-templates/pediatric'
import { buildClinicNavLinks } from '@/lib/clinic-site-helpers'
import { PEDIATRIC_EXTRA_PAGES } from '@/lib/site-templates/pediatric/pages'
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
    bookLabel: pediatricTemplate.bookLabel,
    recentPosts: [],
    reviewCount: 0,
    featuredGoogleReviews: [],
    googleRating: null,
    ...over,
  }
}

describe('PediatricHome', () => {
  it('shows the coloring corner ONLY when the clinic has coloring pages', () => {
    const base = props(FIXTURES.rich())
    const without = render(<PediatricHome {...base} />)
    expect(without.container.textContent).not.toContain('coloring corner')
    cleanup()
    const withPages = render(
      <PediatricHome {...base} gates={{ ...base.gates, hasColoringPages: true }} />,
    )
    expect(withPages.container.textContent?.toLowerCase()).toContain('coloring corner')
    const links = Array.from(withPages.container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links.some((h) => h?.endsWith('/coloring'))).toBe(true)
    cleanup()
  })

  it('renders the day-0 empty clinic with the playful no-photo hero + #contact section', () => {
    const { container } = render(<PediatricHome {...props(FIXTURES.empty())} />)
    expect(container.textContent).toContain('New Smile Dental')
    expect(container.querySelector('#contact')).toBeTruthy()
    cleanup()
  })

  it('keeps Studio wiring on the canonical fields', () => {
    const { container } = render(<PediatricHome {...props(FIXTURES.rich())} />)
    const f = (sel: string) => container.querySelector(sel)
    expect(f('[data-edit-field="tagline"][data-edit-kind="text"]')).toBeTruthy()
    expect(f('[data-edit-field="heroImageUrl"][data-edit-kind="image"]')).toBeTruthy()
    expect(f('[data-edit-field="services"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="testimonials"][data-edit-kind="modal"]')).toBeTruthy()
    expect(f('[data-edit-field="staff"][data-edit-kind="modal"]')).toBeTruthy()
    cleanup()
  })
})

describe('template-declared marketing pages in the shared nav builder', () => {
  const common = {
    basePath: '/site/x',
    hasBlog: false,
    hasDentalPlans: false,
    hasTeam: false,
    hasCareers: false,
    services: [],
    extraPages: PEDIATRIC_EXTRA_PAGES,
  }

  it('surfaces /coloring in the Patients group when the clinic has pages', () => {
    const nav = buildClinicNavLinks({ ...common, extraGates: { hasColoringPages: true } })
    const patients = nav.find((l) => l.label === 'Patients')!
    expect(patients.children?.some((c) => c.href === '/site/x/coloring')).toBe(true)
  })

  it('hides /coloring when the clinic has none (gate respected)', () => {
    const nav = buildClinicNavLinks({ ...common, extraGates: { hasColoringPages: false } })
    const all = nav.flatMap((l) => [l.href, ...(l.children ?? []).map((c) => c.href)])
    expect(all.some((h) => h.endsWith('/coloring'))).toBe(false)
  })

  it('omitting extras keeps the nav bit-identical to the pre-template shape', () => {
    const withEmpty = buildClinicNavLinks({ ...common, extraPages: [], extraGates: {} })
    const withoutOpts = buildClinicNavLinks({
      basePath: '/site/x',
      hasBlog: false,
      hasDentalPlans: false,
      hasTeam: false,
      hasCareers: false,
      services: [],
    })
    expect(withEmpty).toEqual(withoutOpts)
  })
})
