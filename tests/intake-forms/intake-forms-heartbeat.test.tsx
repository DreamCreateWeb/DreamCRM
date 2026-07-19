/**
 * CompletedHeartbeat — the Intake Forms list's 8-week heartbeat sparkline
 * (Design System law 7).
 *
 * Mirrors tests/patients/patients-list-heartbeat.test.tsx: renders with a
 * signal-bearing series, stays hidden with an empty / flat / single-blip
 * series, and is decorative (aria-hidden svg; the adjacent 12px text label
 * + the plain-language title carry the meaning).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import CompletedHeartbeat from '@/app/(default)/intake-forms/completed-heartbeat'

// 8 buckets, oldest first — mirrors getFormsCompletedPerWeek8's shape.
const series = (values: number[]) =>
  values.map((v, i) => ({ bucket: `Wk ${i + 1}`, value: v }))

describe('CompletedHeartbeat — 8-week sparkline (law 7)', () => {
  it('renders the sparkline with its label + title when the series carries signal', () => {
    const { container } = render(
      <CompletedHeartbeat series={series([0, 2, 1, 0, 3, 0, 1, 2])} />,
    )
    expect(screen.getByText('Completed · 8 weeks')).toBeInTheDocument()
    expect(
      screen.getByTitle('Forms completed per week over the last 8 weeks'),
    ).toBeInTheDocument()
    // Decorative: the svg is wrapped in aria-hidden; the adjacent text label
    // carries the meaning.
    const spark = container.querySelector('[aria-hidden="true"] svg')
    expect(spark).not.toBeNull()
    expect(spark!.querySelectorAll('circle')).toHaveLength(8)
  })

  it('stays hidden with an empty series or fewer than 2 nonzero weeks', () => {
    // Empty series — nothing renders.
    const { container, rerender } = render(<CompletedHeartbeat series={[]} />)
    expect(screen.queryByText('Completed · 8 weeks')).not.toBeInTheDocument()
    // All-zero weeks — still hidden.
    rerender(<CompletedHeartbeat series={series([0, 0, 0, 0, 0, 0, 0, 0])} />)
    expect(screen.queryByText('Completed · 8 weeks')).not.toBeInTheDocument()
    // A single blip is not a trend — still hidden.
    rerender(<CompletedHeartbeat series={series([0, 0, 0, 0, 0, 0, 0, 5])} />)
    expect(screen.queryByText('Completed · 8 weeks')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeNull()
  })
})
