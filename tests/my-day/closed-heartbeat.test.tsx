/**
 * ClosedHeartbeat — My Day's ONE heartbeat (Design System law 7).
 *
 * Mirrors tests/patients/patients-list-heartbeat.test.tsx: renders with a
 * signal-bearing series, stays hidden with no signal / a single blip, and is
 * decorative (aria-hidden svg; the visible 12px label carries the meaning).
 * The label speaks the warm personal voice — "You closed N this week" —
 * never a surveillance framing, and a zero-close history renders NOTHING
 * (no "you closed 0" shame).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import ClosedHeartbeat from '@/app/(default)/my-day/closed-heartbeat'

// 8 buckets, oldest first — mirrors getMyClosedFollowupsPerWeek8's shape.
const series = (values: number[]) =>
  values.map((v, i) => ({ bucket: `Wk ${i + 1}`, value: v }))

describe('ClosedHeartbeat — the 8-week personal heartbeat (law 7)', () => {
  it('renders the bar sparkline with the "this week" label when the series carries signal', () => {
    const { container } = render(<ClosedHeartbeat series={series([0, 2, 1, 0, 4, 2, 0, 3])} />)
    expect(screen.getByText('You closed 3 this week')).toBeInTheDocument()
    // Decorative: the svg is wrapped in aria-hidden; the adjacent visible
    // text label carries the meaning.
    const spark = container.querySelector('[aria-hidden="true"] svg')
    expect(spark).not.toBeNull()
    expect(spark!.querySelectorAll('rect')).toHaveLength(8)
  })

  it('falls back to the 8-week total when this week has no closes yet', () => {
    render(<ClosedHeartbeat series={series([0, 2, 1, 0, 4, 2, 3, 0])} />)
    expect(screen.getByText('You closed 12 these past 8 weeks')).toBeInTheDocument()
    expect(screen.queryByText(/this week/)).not.toBeInTheDocument()
  })

  it('renders nothing with an all-zero series or a single blip (no "you closed 0" shame)', () => {
    // All zeros — nothing renders.
    const { container, rerender } = render(<ClosedHeartbeat series={series([0, 0, 0, 0, 0, 0, 0, 0])} />)
    expect(container).toBeEmptyDOMElement()
    // A single blip is not a trend — still hidden.
    rerender(<ClosedHeartbeat series={series([0, 0, 0, 0, 0, 0, 0, 4])} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/You closed/)).not.toBeInTheDocument()
  })
})
