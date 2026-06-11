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
  it('renders the primary variant in brand teal (v2 — not violet)', () => {
    render(<ActionButton variant="primary">+ Add patient</ActionButton>)
    const btn = screen.getByRole('button', { name: '+ Add patient' })
    expect(btn.className).toContain('bg-teal-500')
    expect(btn.className).not.toContain('bg-violet')
  })

  it('adds the ambient breath skin only on a primary marked breath', () => {
    const { rerender } = render(
      <ActionButton variant="primary" breath>
        + New booking
      </ActionButton>,
    )
    expect(screen.getByRole('button', { name: '+ New booking' }).className).toContain('breath')
    // breath is ignored on non-primary variants (one ambient primary per page).
    rerender(
      <ActionButton variant="secondary" breath>
        + New booking
      </ActionButton>,
    )
    expect(screen.getByRole('button', { name: '+ New booking' }).className).not.toContain('breath')
  })

  it('renders a link when href is given', () => {
    render(
      <ActionButton variant="secondary" href="/patients">
        Open patients
      </ActionButton>,
    )
    expect(screen.getByRole('link', { name: 'Open patients' })).toHaveAttribute('href', '/patients')
  })

  it('renders new-tab links with a safe rel default', () => {
    render(
      <ActionButton href="/site/acme/intake/new-patient" target="_blank">
        Preview ↗
      </ActionButton>,
    )
    const link = screen.getByRole('link', { name: 'Preview ↗' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
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

  it('renders the info tone in indigo (v2 — moved off sky), never teal', () => {
    render(<StatusPill tone="info" label="Contacted" />)
    const pill = screen.getByText('Contacted')
    expect(pill.className).toContain('indigo')
    expect(pill.className).not.toContain('sky')
    expect(pill.className).not.toContain('teal')
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

  it('uses the teal selection treatment when active (selection ≠ status)', () => {
    const { rerender } = render(
      <FilterChip active onClick={() => {}}>
        New
      </FilterChip>,
    )
    expect(screen.getByRole('button', { name: /New/ }).className).toContain('teal')
    rerender(
      <FilterChip active={false} onClick={() => {}}>
        New
      </FilterChip>,
    )
    expect(screen.getByRole('button', { name: /New/ }).className).not.toContain('teal')
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

  it('renders the hero number in Geist Mono with tabular figures, on an etched card', () => {
    const { container } = render(<KpiStat label="Recall due" value={12} />)
    const numeral = screen.getByText('12')
    expect(numeral.className).toContain('font-mono-num')
    expect(numeral.className).toContain('tabular-nums')
    // Etched resting surface (no drop-shadow), not the old rounded-xl card.
    expect(container.querySelector('.v2-card')).not.toBeNull()
  })

  it('is drillable when href is set (and uses the interactive etched card)', () => {
    const { container } = render(<KpiStat label="New leads" value={6} href="/leads?status=new" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/leads?status=new')
    expect(container.querySelector('.v2-card-interactive')).not.toBeNull()
  })

  it('count-up snaps to the final value once the session flag is set', () => {
    // Simulate "already counted up this session" → no animation, render final.
    sessionStorage.setItem('v2-countup-done', '1')
    render(<KpiStat label="New patients" value={42} countUp />)
    expect(screen.getByText('42')).toBeInTheDocument()
    sessionStorage.removeItem('v2-countup-done')
  })

  it('count-up sets the once-per-session flag on first entry', () => {
    sessionStorage.removeItem('v2-countup-done')
    render(<KpiStat label="New patients" value={7} countUp />)
    expect(sessionStorage.getItem('v2-countup-done')).toBe('1')
    sessionStorage.removeItem('v2-countup-done')
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
