/**
 * Smoke tests for the ServicePills client component — Tend's qualifier
 * pill strip just below the hero with visible prev/next arrow buttons.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import ServicePills from '@/components/clinic-site/service-pills'

const PILLS = [
  { id: 'p1', name: 'Cleanings' },
  { id: 'p2', name: 'Whitening' },
  { id: 'p3', name: 'Implants' },
]

describe('ServicePills', () => {
  it('renders each pill as a link to the shared href', () => {
    render(
      <ServicePills pills={PILLS} brand="#9CAF9F" ink="#1C1A17" href="/site/test#services" />,
    )
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs.filter((h) => h === '/site/test#services').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('Cleanings')).toBeInTheDocument()
    expect(screen.getByText('Whitening')).toBeInTheDocument()
    expect(screen.getByText('Implants')).toBeInTheDocument()
  })

  it('renders visible prev / next arrow buttons that scroll the pill row', () => {
    render(
      <ServicePills pills={PILLS} brand="#9CAF9F" ink="#1C1A17" href="/site/test#services" />,
    )
    expect(screen.getByRole('button', { name: /Previous services/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next services/i })).toBeInTheDocument()
  })

  it('renders nothing when given an empty pill array', () => {
    const { container } = render(
      <ServicePills pills={[]} brand="#9CAF9F" ink="#1C1A17" href="/site/test#services" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('applies brand-color styling to the arrow buttons', () => {
    render(
      <ServicePills pills={PILLS} brand="#9CAF9F" ink="#1C1A17" href="/site/test#services" />,
    )
    const prev = screen.getByRole('button', { name: /Previous services/i })
    expect(prev.getAttribute('style')).toMatch(/#9CAF9F/i)
  })
})
