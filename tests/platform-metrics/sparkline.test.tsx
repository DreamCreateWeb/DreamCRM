import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sparkline from '@/components/ui/sparkline'

describe('Sparkline', () => {
  it('renders the empty-state when there is no data', () => {
    render(<Sparkline data={[]} />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  it('renders a polyline for the line variant', () => {
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
    expect(container.querySelector('polyline')).not.toBeNull()
    expect(container.querySelectorAll('circle').length).toBe(3)
  })

  it('renders bars for the bar variant', () => {
    const { container } = render(
      <Sparkline
        data={[
          { bucket: '2026-01-01', value: 0 },
          { bucket: '2026-01-08', value: 5 },
        ]}
        variant="bar"
      />,
    )
    expect(container.querySelector('polyline')).toBeNull()
    expect(container.querySelectorAll('rect').length).toBe(2)
  })

  it('embeds a tooltip title for each datapoint when labels=true', () => {
    const { container } = render(
      <Sparkline
        data={[{ bucket: '2026-01-01', value: 7 }]}
        variant="bar"
        labels
      />,
    )
    const title = container.querySelector('rect title')
    expect(title?.textContent).toContain('7')
  })

  it('respects the custom color', () => {
    const { container } = render(
      <Sparkline
        data={[{ bucket: '2026-01-01', value: 1 }, { bucket: '2026-01-08', value: 2 }]}
        variant="line"
        color="#ff0000"
      />,
    )
    const line = container.querySelector('polyline')
    expect(line?.getAttribute('stroke')).toBe('#ff0000')
  })
})
