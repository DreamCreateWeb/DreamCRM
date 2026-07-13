import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
const { bulkStatusMock, bulkFollowupMock } = vi.hoisted(() => ({
  bulkStatusMock: vi.fn(async () => ({ ok: true, updated: 2, skipped: 0 })),
  bulkFollowupMock: vi.fn(),
}))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(async () => ({ ok: true })),
  markCompletedAction: vi.fn(async () => ({ ok: true, reviewSent: true })),
  bulkSendRemindersAction: vi.fn(async () => ({ attempted: 0, sent: 0, skipped: 0, errors: [] })),
  bulkSetAppointmentStatusAction: bulkStatusMock,
  bulkCreateFollowupsForPatientsAction: bulkFollowupMock,
}))
vi.mock('@/app/(default)/appointments/appointment-drawer', () => ({
  default: () => null,
}))
vi.mock('@/app/(default)/appointments/new-booking-drawer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="new-booking-drawer">
      <button onClick={onClose}>close-drawer</button>
    </div>
  ),
}))

import AgendaView from '@/app/(default)/appointments/agenda-view'
import type {
  AppointmentRow,
  AppointmentDayGroup,
  AppointmentListFilters,
  AppointmentFilterMeta,
} from '@/lib/services/appointments'

const baseMeta: AppointmentFilterMeta = { providers: [], sources: [] }
const baseFilters: AppointmentListFilters = { window: 'next_14d', attention: [] }

function makeRow(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'a1',
    patientId: 'p1',
    patientName: 'Mia Hayes',
    patientLifecycle: 'active',
    startTime: new Date('2026-05-21T09:00:00Z'),
    endTime: new Date('2026-05-21T09:30:00Z'),
    durationMinutes: 30,
    type: 'cleaning',
    status: 'scheduled',
    source: 'booking_widget',
    notes: null,
    providerId: null,
    providerName: null,
    locationName: null,
    confirmedAt: null,
    cancelledAt: null,
    arrivedAt: null,
    seatedAt: null,
    reminderLastSentAt: null,
    createdAt: new Date('2026-05-10T12:00:00Z'),
    flags: {
      newPatient: false,
      birthdayThisWeek: false,
      hasOutstandingBalance: false,
      missingIntakeBeforeAppt: false,
      unconfirmedNext48h: false,
      lapsedReturning: false,
      optedOut: false,
      reminderSentRecently: false,
      bookedJustNow: false,
      rescheduled: false,
    },
    agingLevel: 'none',
    needsRebooking: false,
    tags: [],
    ...overrides,
  }
}

describe('AgendaView', () => {
  it('renders the empty-state copy when no groups match', () => {
    render(
      <AgendaView
        groups={[]}
        meta={baseMeta}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText(/No appointments in this window/)).toBeInTheDocument()
  })

  it('renders contextual empty-state copy for the "Unconfirmed" filter', () => {
    render(
      <AgendaView
        groups={[]}
        meta={baseMeta}
        filters={{ ...baseFilters, attention: ['unconfirmed'] }}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText(/No unconfirmed appointments — nice/)).toBeInTheDocument()
  })

  it('renders contextual empty-state copy for the "Cancelled" filter', () => {
    render(
      <AgendaView
        groups={[]}
        meta={baseMeta}
        filters={{ ...baseFilters, attention: ['cancelled'] }}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText(/No cancellations to recover from/)).toBeInTheDocument()
  })

  it('renders contextual empty-state copy for the "Lapsed rebooking" filter', () => {
    render(
      <AgendaView
        groups={[]}
        meta={baseMeta}
        filters={{ ...baseFilters, attention: ['lapsed_rebooking'] }}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText(/No lapsed-patient rebookings/)).toBeInTheDocument()
  })

  it('renders a row per appointment with patient name, type, and status pill', () => {
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [
        makeRow({ id: 'a1', patientName: 'Mia Hayes', status: 'confirmed', type: 'cleaning' }),
        makeRow({
          id: 'a2',
          patientName: 'Liam Brooks',
          status: 'scheduled',
          type: 'checkup',
          startTime: new Date('2026-05-21T10:00:00Z'),
          endTime: new Date('2026-05-21T10:30:00Z'),
          flags: {
            newPatient: true,
            birthdayThisWeek: false,
            hasOutstandingBalance: false,
            missingIntakeBeforeAppt: true,
            unconfirmedNext48h: true,
            lapsedReturning: false,
            optedOut: false,
            reminderSentRecently: false,
            bookedJustNow: false,
            rescheduled: false,
          },
        }),
      ],
      totals: { booked: 2, confirmed: 1, unconfirmed: 1 },
    }
    render(
      <AgendaView
        groups={[group]}
        meta={baseMeta}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText('Mia Hayes')).toBeInTheDocument()
    expect(screen.getByText('Liam Brooks')).toBeInTheDocument()
    expect(screen.getByText('cleaning')).toBeInTheDocument()
    expect(screen.getByText('checkup')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    // "Unconfirmed" appears in both the filter chip + the row status pill
    expect(screen.getAllByText('Unconfirmed').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
    expect(screen.getByLabelText(/Missing intake form before this visit/)).toBeInTheDocument()
  })

  it('renders the source dropdown only when the org has booking-source data', () => {
    const empty = { date: new Date('2026-05-21T00:00:00Z'), label: 'Wed May 21', rows: [makeRow()], totals: { booked: 1, confirmed: 0, unconfirmed: 1 } }
    const { rerender } = render(
      <AgendaView
        groups={[empty]}
        meta={{ providers: [], sources: [] }}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    // No source data → no dropdown
    expect(screen.queryByText(/Any source/)).not.toBeInTheDocument()
    rerender(
      <AgendaView
        groups={[empty]}
        meta={{ providers: [], sources: ['booking_widget', 'manual'] }}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText('Any source')).toBeInTheDocument()
    expect(screen.getByText('Public booking widget')).toBeInTheDocument()
    expect(screen.getByText('Front desk (manual)')).toBeInTheDocument()
  })

  it('shows the day sub-header with booked count + still-need-confirm count', () => {
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Today · Tue May 21',
      rows: [
        makeRow({ id: 'a1', status: 'confirmed' }),
        makeRow({ id: 'a2', status: 'scheduled' }),
        makeRow({ id: 'a3', status: 'scheduled' }),
      ],
      totals: { booked: 3, confirmed: 1, unconfirmed: 2 },
    }
    render(
      <AgendaView
        groups={[group]}
        meta={baseMeta}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText(/Today · Tue May 21/)).toBeInTheDocument()
    expect(screen.getByText(/3 booked · 1 confirmed · 2 still need a text/)).toBeInTheDocument()
  })

  it('shows the inline Confirm button only on a future scheduled row (not confirmed)', () => {
    // Confirm is for upcoming unconfirmed visits — use a future time so the row
    // isn't treated as a past-open "Mark done" candidate.
    const future = new Date(Date.now() + 3 * 86_400_000)
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [
        makeRow({ id: 'a1', status: 'confirmed', startTime: future, endTime: future }),
        makeRow({ id: 'a2', patientName: 'Liam Brooks', status: 'scheduled', startTime: future, endTime: future }),
      ],
      totals: { booked: 2, confirmed: 1, unconfirmed: 1 },
    }
    render(
      <AgendaView
        groups={[group]}
        meta={baseMeta}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    const confirmButtons = screen.getAllByRole('button', { name: /^Confirm$/ })
    expect(confirmButtons).toHaveLength(1)
  })

  it('shows "Mark done" on a past open visit instead of Confirm', () => {
    // A scheduled visit whose start time has passed is the one that needs
    // marking done (which fires the review request) — not confirming.
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [makeRow({ id: 'a1', status: 'scheduled', startTime: new Date('2026-05-21T09:00:00Z') })],
      totals: { booked: 1, confirmed: 0, unconfirmed: 1 },
    }
    render(
      <AgendaView groups={[group]} meta={baseMeta} filters={baseFilters} orgName="Acme Dental" />,
    )
    expect(screen.getByRole('button', { name: /Mark done/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Confirm$/ })).not.toBeInTheDocument()
  })

  it('shows the staff/provider name when provided on the row', () => {
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [makeRow({ providerName: 'Dr. Jordan Reyes' })],
      totals: { booked: 1, confirmed: 0, unconfirmed: 1 },
    }
    render(
      <AgendaView
        groups={[group]}
        meta={baseMeta}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    expect(screen.getByText(/· with Dr\. Jordan Reyes/)).toBeInTheDocument()
  })

  it('"+ New booking" opens the booking drawer (header + empty state)', () => {
    // Header button with rows present
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [makeRow({ id: 'nb1', patientName: 'Mia Hayes' })],
      totals: { booked: 1, confirmed: 0, unconfirmed: 1 },
    }
    const { unmount } = render(
      <AgendaView groups={[group]} meta={baseMeta} filters={baseFilters} orgName="Acme" />,
    )
    expect(screen.queryByTestId('new-booking-drawer')).toBeNull()
    fireEvent.click(screen.getAllByText('+ New booking')[0])
    expect(screen.getByTestId('new-booking-drawer')).toBeTruthy()
    fireEvent.click(screen.getByText('close-drawer'))
    expect(screen.queryByTestId('new-booking-drawer')).toBeNull()
    unmount()

    // Empty-state CTA opens it too
    render(<AgendaView groups={[]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    fireEvent.click(screen.getAllByText('+ New booking')[0])
    expect(screen.getByTestId('new-booking-drawer')).toBeTruthy()
  })

  it('selecting a row reveals the sticky bulk-send bar', () => {
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [makeRow()],
      totals: { booked: 1, confirmed: 0, unconfirmed: 1 },
    }
    render(
      <AgendaView
        groups={[group]}
        meta={baseMeta}
        filters={baseFilters}
        orgName="Acme Dental"
      />,
    )
    expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Select Mia Hayes'))
    expect(screen.getByText(/1 selected/)).toBeInTheDocument()
    // BulkBar uses an explicit-verb label that pluralizes by count.
    expect(screen.getByRole('button', { name: /Send 1 reminder/ })).toBeInTheDocument()
  })

  it('bulk-marks the selected visits completed in one pass', async () => {
    bulkStatusMock.mockClear()
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [
        makeRow({ id: 'a1', patientId: 'p1', patientName: 'Mia Hayes' }),
        makeRow({ id: 'a2', patientId: 'p2', patientName: 'Liam Ross', startTime: new Date('2026-05-21T10:00:00Z') }),
      ],
      totals: { booked: 2, confirmed: 0, unconfirmed: 2 },
    }
    render(<AgendaView groups={[group]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    fireEvent.click(screen.getByLabelText('Select Mia Hayes'))
    fireEvent.click(screen.getByLabelText('Select Liam Ross'))
    fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }))
    await waitFor(() => expect(bulkStatusMock).toHaveBeenCalledWith(['a1', 'a2'], 'completed'))
  })

  it('bulk "Add follow-up" creates one per selected patient', async () => {
    bulkFollowupMock.mockClear().mockResolvedValue({ ok: true, created: 2 })
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [
        makeRow({ id: 'a1', patientId: 'p1', patientName: 'Mia Hayes' }),
        makeRow({ id: 'a2', patientId: 'p2', patientName: 'Liam Ross', startTime: new Date('2026-05-21T10:00:00Z') }),
      ],
      totals: { booked: 2, confirmed: 0, unconfirmed: 2 },
    }
    render(<AgendaView groups={[group]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    fireEvent.click(screen.getByLabelText('Select Mia Hayes'))
    fireEvent.click(screen.getByLabelText('Select Liam Ross'))
    fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }))

    expect(screen.getByText(/Follow-up for 2 patients/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Call about rebooking/), { target: { value: 'Rebook them' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }))

    await waitFor(() =>
      expect(bulkFollowupMock).toHaveBeenCalledWith(['p1', 'p2'], {
        title: 'Rebook them',
        dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('dedups a patient picked via two of their visits', async () => {
    bulkFollowupMock.mockClear().mockResolvedValue({ ok: true, created: 1 })
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [
        makeRow({ id: 'a1', patientId: 'p1', patientName: 'Mia Hayes' }),
        makeRow({ id: 'a2', patientId: 'p1', patientName: 'Mia Again', startTime: new Date('2026-05-21T10:00:00Z') }),
      ],
      totals: { booked: 2, confirmed: 0, unconfirmed: 2 },
    }
    render(<AgendaView groups={[group]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
    fireEvent.click(screen.getByLabelText('Select Mia Hayes'))
    fireEvent.click(screen.getByLabelText('Select Mia Again'))
    fireEvent.click(screen.getByRole('button', { name: 'Add follow-up' }))

    // Two visits, one patient → the composer counts a single patient.
    expect(screen.getByText(/Follow-up for 1 patient(?!s)/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Call about rebooking/), { target: { value: 'Ring Mia' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }))

    await waitFor(() =>
      expect(bulkFollowupMock).toHaveBeenCalledWith(['p1'], expect.objectContaining({ title: 'Ring Mia' })),
    )
  })

  it('renders saved views as reopen pills under /appointments', () => {
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [makeRow()],
      totals: { booked: 1, confirmed: 0, unconfirmed: 1 },
    }
    render(
      <AgendaView
        groups={[group]}
        meta={baseMeta}
        filters={baseFilters}
        orgName="Acme"
        savedViews={[{ id: 'v1', name: 'No-shows', query: 'attention=no_show' }]}
      />,
    )
    const link = screen.getByRole('link', { name: 'No-shows' })
    expect(link.getAttribute('href')).toBe('/appointments?attention=no_show')
  })

  // ── Design System v2 vocabulary ─────────────────────────────────────
  // These pin the v2 instrument-panel skin so a regression to the legacy
  // flat-white-card look fails loudly (DESIGN-SYSTEM.md Parts 2/5).
  describe('v2 skin', () => {
    const group = (): AppointmentDayGroup => ({
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [makeRow({ patientName: 'Mia Hayes', startTime: new Date('2026-05-21T09:00:00Z') })],
      totals: { booked: 1, confirmed: 0, unconfirmed: 1 },
    })

    it('renders agenda rows as etched v2-cards (no flat white card)', () => {
      const { container } = render(
        <AgendaView groups={[group()]} meta={baseMeta} filters={baseFilters} orgName="Acme" />,
      )
      const card = container.querySelector('li.v2-card')
      expect(card).not.toBeNull()
      // The legacy flat-white data surface must be gone (secondary buttons,
      // e.g. the EncodingLegend "Key", legitimately keep a white skin — so we
      // scope the negative check to the agenda row containers).
      expect(container.querySelector('li.bg-white')).toBeNull()
    })

    it('renders the time column in Geist Mono (font-mono-num)', () => {
      render(<AgendaView groups={[group()]} meta={baseMeta} filters={baseFilters} orgName="Acme" />)
      // 09:00 UTC formats to a wall-clock time in the test env; assert the
      // numeral cell carries the mono utility.
      const timeCell = document.querySelector('.font-mono-num')
      expect(timeCell).not.toBeNull()
    })

    it('puts a teal selection ring on a checked row (selection ≠ status)', () => {
      const { container } = render(
        <AgendaView groups={[group()]} meta={baseMeta} filters={baseFilters} orgName="Acme" />,
      )
      expect(container.querySelector('li.ring-teal-500\\/40')).toBeNull()
      fireEvent.click(screen.getByLabelText('Select Mia Hayes'))
      expect(container.querySelector('li.ring-teal-500\\/40')).not.toBeNull()
    })

    it('renders the filter bar as a v2-panel', () => {
      const { container } = render(
        <AgendaView groups={[group()]} meta={baseMeta} filters={baseFilters} orgName="Acme" />,
      )
      expect(container.querySelector('.v2-panel')).not.toBeNull()
    })
  })
})
