import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PipelineMetrics } from '@/lib/services/projects'
import PipelineStats from '@/app/(default)/ecommerce/orders/pipeline-stats'

function metrics(overrides: Partial<PipelineMetrics> = {}): PipelineMetrics {
  return {
    openCount: 0,
    openValueCents: 0,
    wonCount90d: 0,
    wonValueCents90d: 0,
    winRatePct: 0,
    avgDaysToClose: null,
    byStatusValueCents: {
      lead: 0,
      discovery: 0,
      in_progress: 0,
      review: 0,
      completed: 0,
      on_hold: 0,
      cancelled: 0,
    },
    byStatusCount: {
      lead: 0,
      discovery: 0,
      in_progress: 0,
      review: 0,
      completed: 0,
      on_hold: 0,
      cancelled: 0,
    },
    byTypeCount: {
      website: 0,
      ecommerce: 0,
      intake_form: 0,
      videography: 0,
      photography: 0,
      content: 0,
      other: 0,
    },
    overdueCount: 0,
    ...overrides,
  }
}

describe('PipelineStats', () => {
  it('shows the open pipeline value with project count', () => {
    render(<PipelineStats metrics={metrics({ openCount: 3, openValueCents: 750_000 })} />)
    expect(screen.getByText('Open pipeline value')).toBeInTheDocument()
    expect(screen.getByText(/\$7,500/)).toBeInTheDocument()
    expect(screen.getByText(/3 projects in flight/)).toBeInTheDocument()
  })

  it("uses singular project copy when openCount = 1", () => {
    render(<PipelineStats metrics={metrics({ openCount: 1, openValueCents: 100_000 })} />)
    expect(screen.getByText(/1 project in flight/)).toBeInTheDocument()
  })

  it('shows wins for the last 90d', () => {
    render(<PipelineStats metrics={metrics({ wonCount90d: 4, wonValueCents90d: 1_200_000 })} />)
    expect(screen.getByText('Won (last 90d)')).toBeInTheDocument()
    expect(screen.getByText(/4 projects delivered/)).toBeInTheDocument()
  })

  it('shows win rate %', () => {
    render(<PipelineStats metrics={metrics({ winRatePct: 80, wonCount90d: 4 })} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('shows "No closes yet" when win rate is 0 and no wins', () => {
    render(<PipelineStats metrics={metrics({ winRatePct: 0, wonCount90d: 0 })} />)
    expect(screen.getByText(/No closes yet/)).toBeInTheDocument()
  })

  it('flags needs attention with overdue count', () => {
    render(<PipelineStats metrics={metrics({ overdueCount: 2 })} />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/Past their due date/)).toBeInTheDocument()
  })

  it('shows reassuring text when nothing is overdue', () => {
    render(<PipelineStats metrics={metrics({ overdueCount: 0 })} />)
    expect(screen.getByText(/Nothing overdue/)).toBeInTheDocument()
  })
})
