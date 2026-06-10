import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionButton } from '@/components/ui/action-button'
import { BulkBar } from '@/components/ui/bulk-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterChip } from '@/components/ui/filter-chip'
import { FlashToast } from '@/components/ui/flash-toast'
import { KpiStat } from '@/components/ui/kpi-stat'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'

describe('ActionButton', () => {
  it('renders the primary variant in brand violet', () => {
    render(<ActionButton variant="primary">+ Add patient</ActionButton>)
    const btn = screen.getByRole('button', { name: '+ Add patient' })
    expect(btn.className).toContain('bg-violet-600')
  })

  it('renders a link when href is given', () => {
    render(
      <ActionButton variant="secondary" href="/patients">
        Open patients
      </ActionButton>,
    )
    expect(screen.getByRole('link', { name: 'Open patients' })).toHaveAttribute('href', '/patients')
  })

  it('renders danger in rose and supports disabled', () => {
    render(
      <ActionButton variant="danger" disabled>
        Delete
      </ActionButton>,
    )
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn.className).toContain('bg-rose-600')
    expect(btn).toBeDisabled()
  })
})

describe('StatusPill', () => {
  it('renders the tone recipe and an explanatory title', () => {
    render(<StatusPill tone="warn" label="Unconfirmed" title="Needs a confirmation text" />)
    const pill = screen.getByText('Unconfirmed')
    expect(pill.className).toContain('amber')
    expect(pill.getAttribute('title')).toBe('Needs a confirmation text')
  })
})

describe('FilterChip', () => {
  it('toggles via aria-pressed and shows the count inside the chip', () => {
    const onClick = vi.fn()
    render(
      <FilterChip active={false} onClick={onClick} count={3}>
        New
      </FilterChip>,
    )
    const chip = screen.getByRole('button', { name: /New/ })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip.textContent).toBe('New3')
    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('carries a title for emoji labels', () => {
    render(
      <FilterChip active onClick={() => {}} title="Birthday this month">
        🎂 Birthday
      </FilterChip>,
    )
    expect(screen.getByRole('button', { name: /Birthday/ }).getAttribute('title')).toBe('Birthday this month')
  })
})

describe('EmptyState', () => {
  it('leads with the next action', () => {
    render(
      <EmptyState
        icon="🌿"
        title="No patients yet"
        body="Add your first patient to start the relationship record."
        action={<ActionButton variant="primary">+ Add patient</ActionButton>}
      />,
    )
    expect(screen.getByText('No patients yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add patient' })).toBeInTheDocument()
  })
})

describe('BulkBar', () => {
  it('hides at zero selection', () => {
    const { container } = render(
      <BulkBar count={0} onClear={() => {}}>
        <button>Send</button>
      </BulkBar>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows the count, actions, and a Clear escape hatch', () => {
    const onClear = vi.fn()
    render(
      <BulkBar count={4} onClear={onClear}>
        <ActionButton variant="primary" size="sm">
          Send 4 reminders
        </ActionButton>
      </BulkBar>,
    )
    expect(screen.getByText('4 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send 4 reminders' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})

describe('KpiStat', () => {
  it('renders label, value, and sub', () => {
    render(<KpiStat label="Unconfirmed (48h)" value={3} sub="3 need a reminder" tone="warn" />)
    expect(screen.getByText('Unconfirmed (48h)')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('3 need a reminder').className).toContain('amber')
  })

  it('is drillable when href is set', () => {
    render(<KpiStat label="New leads" value={6} href="/leads?status=new" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/leads?status=new')
  })
})

describe('PageHeader', () => {
  it('renders eyebrow, H1 title, subtitle, and the action slot', () => {
    render(
      <PageHeader
        eyebrow="Daily · Acme Dental"
        title="Appointments"
        subtitle="The schedule as a relationship view."
        actions={<ActionButton variant="primary">+ New booking</ActionButton>}
      />,
    )
    expect(screen.getByText('Daily · Acme Dental')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Appointments' })).toBeInTheDocument()
    expect(screen.getByText('The schedule as a relationship view.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New booking' })).toBeInTheDocument()
  })
})

describe('FlashToast', () => {
  it('announces politely and auto-dismisses via onDone', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<FlashToast message="Sent 4 reminders" onDone={onDone} duration={4000} />)
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Sent 4 reminders')
    expect(toast).toHaveAttribute('aria-live', 'polite')
    vi.advanceTimersByTime(4100)
    expect(onDone).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
