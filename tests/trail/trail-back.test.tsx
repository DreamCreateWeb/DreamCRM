import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { TrailStop } from '@/lib/trail'

/**
 * TrailBack — the only visible UI of the journey-trail. Covers invisibility on
 * a fresh trail, the "← {previous}" chip + back(), and the multi-step jump menu
 * (excludes the current page; goTo by original index).
 */

const trailState = {
  trail: [] as TrailStop[],
  previous: null as TrailStop | null,
  back: vi.fn(),
  goTo: vi.fn(),
  setLabel: vi.fn(),
}
vi.mock('@/app/trail-context', () => ({
  useTrail: () => trailState,
}))

import TrailBack from '@/components/ui/trail-back'

function setTrail(trail: TrailStop[]) {
  trailState.trail = trail
  trailState.previous = trail.length >= 2 ? trail[trail.length - 2] : null
}

beforeEach(() => {
  trailState.back.mockReset()
  trailState.goTo.mockReset()
  setTrail([])
})

describe('TrailBack — visibility', () => {
  it('renders nothing on an empty trail', () => {
    setTrail([])
    const { container } = render(<TrailBack />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing with a single stop (no previous → direct entry)', () => {
    setTrail([{ pathname: '/patients', url: '/patients', label: 'Patients' }])
    const { container } = render(<TrailBack />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('TrailBack — back chip', () => {
  it('shows "← {previous.label}" and calls back() on click', () => {
    setTrail([
      { pathname: '/patients', url: '/patients?filter=lapsed', label: 'Patients' },
      { pathname: '/appointments', url: '/appointments', label: 'Appointments' },
    ])
    render(<TrailBack />)
    const backBtn = screen.getByRole('button', { name: 'Back to Patients' })
    expect(within(backBtn).getByText('Patients')).toBeInTheDocument()
    fireEvent.click(backBtn)
    expect(trailState.back).toHaveBeenCalledTimes(1)
  })

  it('does NOT show the jump chevron when there is only one prior stop', () => {
    setTrail([
      { pathname: '/patients', url: '/patients', label: 'Patients' },
      { pathname: '/appointments', url: '/appointments', label: 'Appointments' },
    ])
    render(<TrailBack />)
    expect(screen.queryByRole('button', { name: 'Recent pages' })).not.toBeInTheDocument()
  })
})

describe('TrailBack — jump menu (multi-step)', () => {
  const longTrail: TrailStop[] = [
    { pathname: '/', url: '/', label: 'Overview' },
    { pathname: '/patients', url: '/patients', label: 'Patients' },
    { pathname: '/patients/p1', url: '/patients/p1', label: 'Olivia Lopez' },
    { pathname: '/appointments', url: '/appointments?window=today', label: 'Appointments' },
  ]

  it('shows the chevron once there are ≥2 prior stops', () => {
    setTrail(longTrail)
    render(<TrailBack />)
    expect(screen.getByRole('button', { name: 'Recent pages' })).toBeInTheDocument()
  })

  it('lists prior stops most-recent-first, EXCLUDING the current page', () => {
    setTrail(longTrail)
    render(<TrailBack />)
    fireEvent.click(screen.getByRole('button', { name: 'Recent pages' }))
    const menu = screen.getByRole('navigation', { name: 'Recent pages' })
    const items = within(menu).getAllByRole('menuitem')
    // Current page (Appointments) is excluded; the rest appear newest-first.
    expect(items.map((el) => el.textContent)).toEqual([
      expect.stringContaining('Olivia Lopez'),
      expect.stringContaining('Patients'),
      expect.stringContaining('Overview'),
    ])
    // The current page never appears as a jump target.
    expect(within(menu).queryByText('Appointments')).not.toBeInTheDocument()
  })

  it('goTo() is called with the ORIGINAL trail index when a row is clicked', () => {
    setTrail(longTrail)
    render(<TrailBack />)
    fireEvent.click(screen.getByRole('button', { name: 'Recent pages' }))
    const menu = screen.getByRole('navigation', { name: 'Recent pages' })
    // Click "Overview" — it is index 0 in the original trail.
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Overview/ }))
    expect(trailState.goTo).toHaveBeenCalledWith(0)
  })

  it('clicking the topmost jump row goes to the previous stop (index 2 here)', () => {
    setTrail(longTrail)
    render(<TrailBack />)
    fireEvent.click(screen.getByRole('button', { name: 'Recent pages' }))
    const menu = screen.getByRole('navigation', { name: 'Recent pages' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Olivia Lopez/ }))
    // Olivia Lopez is at original index 2 (the previous stop).
    expect(trailState.goTo).toHaveBeenCalledWith(2)
  })

  it('the back chip and the menu agree on the previous label', () => {
    setTrail(longTrail)
    render(<TrailBack />)
    // Back chip → previous (Olivia Lopez).
    expect(screen.getByRole('button', { name: 'Back to Olivia Lopez' })).toBeInTheDocument()
  })
})
