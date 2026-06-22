import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Router + server actions are out of scope for a render test.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => ({
  archiveThreadAction: vi.fn(),
  reopenThreadAction: vi.fn(),
  sendMessageAction: vi.fn(),
  snoozeThreadAction: vi.fn(),
}))

import ThreadDetailPanel from '@/app/(double-sidebar)/messages/clinic-thread-detail-panel'

const baseThread = {
  id: 'thr_1',
  patientId: 'pat_1',
  patientFirstName: 'Mia',
  patientLastName: 'Nguyen',
  patientEmail: 'mia@example.com',
  patientPhone: '(512) 555-0101',
  status: 'open' as const,
  assignedUserId: null,
  assignedUserName: null,
  snoozedUntil: null,
  lastMessageChannel: 'email' as const,
}

function renderPanel(props: Partial<React.ComponentProps<typeof ThreadDetailPanel>> = {}) {
  return render(
    <ThreadDetailPanel
      thread={baseThread}
      messages={[]}
      currentUserName="Dr. Reyes"
      templates={[]}
      hasEmail={true}
      {...props}
    />,
  )
}

describe('Thread detail — patient context strip', () => {
  it('renders next visit (date + type), last visit, and a positive balance', () => {
    renderPanel({
      patientContext: {
        patientId: 'pat_1',
        nextVisitAt: '2026-06-18T15:00:00.000Z',
        nextVisitType: 'Cleaning',
        lastVisitAt: '2026-01-10T15:00:00.000Z',
        outstandingBalanceCents: 12300,
        balanceAsOf: '2026-06-01T00:00:00.000Z',
        missingIntake: false,
      },
    })
    // Scannable eyebrow labels (Next / Last / Balance) lead each stat.
    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.getByText(/Cleaning/)).toBeInTheDocument()
    expect(screen.getByText('Last')).toBeInTheDocument()
    // A positive PMS balance renders the dollar figure (rose tone).
    expect(screen.getByText('$123.00')).toBeInTheDocument()
    // No intake-missing chip when the flag is false.
    expect(screen.queryByText(/Intake missing/)).not.toBeInTheDocument()
  })

  it('shows the honest "no PMS balance" framing instead of $0', () => {
    renderPanel({
      patientContext: {
        patientId: 'pat_1',
        nextVisitAt: null,
        nextVisitType: null,
        lastVisitAt: null,
        outstandingBalanceCents: null,
        balanceAsOf: null,
        missingIntake: false,
      },
    })
    expect(screen.getByText('no PMS balance')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    // No visits → calm "none scheduled" / "none yet", not a fake date.
    expect(screen.getByText('none scheduled')).toBeInTheDocument()
    expect(screen.getByText('none yet')).toBeInTheDocument()
  })

  it('surfaces the amber intake-missing chip when flagged', () => {
    renderPanel({
      patientContext: {
        patientId: 'pat_1',
        nextVisitAt: '2026-06-18T15:00:00.000Z',
        nextVisitType: 'Cleaning',
        lastVisitAt: null,
        outstandingBalanceCents: 0,
        balanceAsOf: null,
        missingIntake: true,
      },
    })
    expect(screen.getByText(/Intake missing/)).toBeInTheDocument()
    // A zero balance reads "paid up" (emerald), never a rose dollar figure.
    expect(screen.getByText('paid up')).toBeInTheDocument()
  })

  it('renders no strip at all when context is absent', () => {
    renderPanel({ patientContext: null })
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
    expect(screen.queryByText('Balance')).not.toBeInTheDocument()
  })

  it('shows a mobile back link when backHref is provided', () => {
    renderPanel({ backHref: '/messages?status=open' })
    const link = screen.getByRole('link', { name: /All conversations/ })
    expect(link).toHaveAttribute('href', '/messages?status=open')
    // It is mobile-only (hidden at lg+).
    expect(link.className).toContain('lg:hidden')
  })
})
