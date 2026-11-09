/**
 * The clinic-site 404 has two honest faces: an unknown SLUG ("Clinic not
 * found", nothing to link back to) and a bad URL INSIDE a live clinic site
 * (the clinic's own 404 — way home, phone, booking door).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import ClinicNotFound from '@/app/site/[slug]/not-found'
import { ClinicNotFoundProvider, type ClinicNotFoundInfo } from '@/components/clinic-site/clinic-not-found-context'

const ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

const clinic: ClinicNotFoundInfo = {
  name: 'Maple Dental',
  brand: '#1D4ED8',
  logoUrl: null,
  phone: '(555) 123-4567',
  homeHref: '/site/maple',
  bookHref: '/site/maple/book',
}

describe('clinic-site not-found', () => {
  it('slug-level: no clinic resolved keeps the neutral "Clinic not found"', () => {
    render(<ClinicNotFound />)
    expect(screen.getByRole('heading', { name: 'Clinic not found' })).toBeTruthy()
    expect(screen.queryByText(/Back to .* home/)).toBeNull()
  })

  it('page-level: a resolved clinic gets its own 404 with home, booking and phone doors', () => {
    render(
      <ClinicNotFoundProvider value={clinic}>
        <ClinicNotFound />
      </ClinicNotFoundProvider>,
    )
    expect(screen.queryByText('Clinic not found')).toBeNull()
    expect(screen.getByRole('heading', { name: /couldn.t find that page/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Maple Dental home' }).getAttribute('href')).toBe('/site/maple')
    expect(screen.getByRole('link', { name: 'Book a visit' }).getAttribute('href')).toBe('/site/maple/book')
    expect(screen.getByRole('link', { name: /Call/ }).getAttribute('href')).toBe('tel:(555) 123-4567')
  })

  it('page-level: a clinic with no phone shows no call door', () => {
    render(
      <ClinicNotFoundProvider value={{ ...clinic, phone: null }}>
        <ClinicNotFound />
      </ClinicNotFoundProvider>,
    )
    expect(screen.queryByRole('link', { name: /Call/ })).toBeNull()
  })

  it('routing: an unmatched path under a clinic throws notFound() (404 status + noindex from Next)', () => {
    const catchAll = read('app/site/[slug]/[...missing]/page.tsx')
    expect(catchAll).toMatch(/notFound\(\)/)
    const layout = read('app/site/[slug]/layout.tsx')
    expect(layout).toMatch(/<ClinicNotFoundProvider value=\{notFoundInfo\}>/)
  })
})
