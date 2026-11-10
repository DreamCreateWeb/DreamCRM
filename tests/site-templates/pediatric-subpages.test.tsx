import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { pediatricTemplate } from '@/lib/site-templates/pediatric'
import { FIXTURES } from '../fixtures/clinic-site-fixtures'
import { siteOffices } from '@/lib/site-offices'
import type { AboutPageBodyProps, TeamPageBodyProps } from '@/lib/site-templates/subpage-props'
import type { ClinicStaff, ClinicStat, ClinicOfficePhoto, ClinicTestimonial } from '@/lib/types/clinic-content'

afterEach(cleanup)

const data = FIXTURES.rich()
const profile = data.profile
const name = profile.displayName as string
const staff = profile.staff as unknown as ClinicStaff[]

const aboutProps = (over: Partial<AboutPageBodyProps> = {}): AboutPageBodyProps =>
  ({
    copyOverrides: null,
    name,
    headingInk: 'var(--c-heading, #1C1A17)',
    profile,
    bookHref: '/site/fixture-dental/book',
    brand: '#1D4ED8',
    bookLabel: pediatricTemplate.bookLabel,
    aboutRest: 'We treat every visit as a conversation.',
    stats: (profile.stats ?? []) as unknown as ClinicStat[],
    staff,
    officePhotos: (profile.officePhotos ?? []) as unknown as ClinicOfficePhoto[],
    testimonials: (profile.testimonials ?? []) as unknown as ClinicTestimonial[],
    mapOffice: siteOffices(data)[0] ?? null,
    data,
    ...over,
  }) as AboutPageBodyProps

const teamProps = (over: Partial<TeamPageBodyProps> = {}): TeamPageBodyProps => ({
  copyOverrides: null,
  headingInk: 'var(--c-heading, #1C1A17)',
  name,
  heroLead: 'The people behind your care.',
  hasTeam: staff.length > 0,
  staff,
  basePath: '/site/fixture-dental',
  brand: '#1D4ED8',
  bookHref: '/site/fixture-dental/book',
  bookLabel: pediatricTemplate.bookLabel,
  profile,
  ...over,
})

describe('Pediatric owns its About + Team (ML-52b)', () => {
  it('declares about and team as self-owned, with its own renderers', () => {
    expect(pediatricTemplate.subpageSource.about).toBe('self')
    expect(pediatricTemplate.subpageSource.team).toBe('self')
    expect(pediatricTemplate.pages.subpages.about.name).toBe('PediatricAbout')
    expect(pediatricTemplate.pages.subpages.team.name).toBe('PediatricTeam')
  })

  it('About: one h1, the skin register, the book CTA in this voice', () => {
    const About = pediatricTemplate.pages.subpages.about
    const { container } = render(<About {...aboutProps()} />)
    expect(container.querySelectorAll('h1').length).toBe(1)
    expect(container.querySelector('p.rounded-full.px-4')).toBeTruthy()
    expect(container.querySelector('.rounded-\\[2rem\\]')).toBeTruthy()
    expect(container.querySelector('h1')!.className).toContain('font-bold')
    expect(container.textContent).toContain(pediatricTemplate.bookLabel)
  })

  it('Team: one h1, the skin register, a portrait per person', () => {
    const Team = pediatricTemplate.pages.subpages.team
    const { container } = render(<Team {...teamProps()} />)
    expect(container.querySelectorAll('h1').length).toBe(1)
    expect(container.querySelector('p.rounded-full.px-4')).toBeTruthy()
    expect(container.querySelector('h1')!.className).toContain('font-bold')
    expect(container.textContent).toContain('Dr. Maya Patel')
  })

  it('Team: the empty state still offers the doors, never "coming soon"', () => {
    const Team = pediatricTemplate.pages.subpages.team
    const { container } = render(<Team {...teamProps({ hasTeam: false, staff: [] })} />)
    expect(container.textContent).toContain('Meet us in person.')
    expect(container.textContent).not.toMatch(/coming soon/i)
    expect(container.querySelector('.rounded-\\[2rem\\]')).toBeTruthy()
  })
})
