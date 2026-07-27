import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sparkline from '@/components/ui/sparkline'

/**
 * Sparkline is now a COMPAT WRAPPER over the chart kit (the Recharts
 * rollout): the polyline decoration became a real mini chart with a hover
 * tooltip. These pin the wrapper contract; the kit itself is covered by
 * tests/ui/chart-kit.test.tsx.
 */
describe('Sparkline (compat wrapper over the chart kit)', () => {
  it('renders the empty-state when there is no data', () => {
    render(<Sparkline data={[]} />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  it('renders the kit mini line chart for the line variant', () => {
    const { container } = render(
      <Sparkline
        data={[
          { bucket: '2026-01-01', value: 1 },
          { bucket: '2026-01-08', value: 3 },
          { bucket: '2026-01-15', value: 2 },
        ]}
        variant="line"
      />,
    )
    expect(container.querySelector('[data-chart="mini-line"]')).not.toBeNull()
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(1)
    // The whole point of the rollout: a hover layer exists.
    expect(container.querySelector('.recharts-tooltip-wrapper')).not.toBeNull()
  })

  it('renders kit bars for the bar variant', () => {
    const { container } = render(
      <Sparkline
        data={[
          { bucket: '2026-01-01', value: 2 },
          { bucket: '2026-01-08', value: 5 },
        ]}
        variant="bar"
      />,
    )
    expect(container.querySelector('[data-chart="mini-bar"]')).not.toBeNull()
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2)
  })

  it('respects the custom color', () => {
    const { container } = render(
      <Sparkline
        data={[{ bucket: '2026-01-01', value: 1 }, { bucket: '2026-01-08', value: 2 }]}
        variant="line"
        color="#ff0000"
      />,
    )
    const line = container.querySelector('.recharts-line-curve')
    expect(line?.getAttribute('stroke')).toBe('#ff0000')
  })
})
