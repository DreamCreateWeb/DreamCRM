import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(async () => ({ ok: true })),
  bulkSendRemindersAction: vi.fn(async () => ({ attempted: 0, sent: 0, skipped: 0, errors: [] })),
}))
vi.mock('@/app/(default)/appointments/appointment-drawer', () => ({
  default: () => null,
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

  it('shows the inline Confirm button only on scheduled rows', () => {
    const group: AppointmentDayGroup = {
      date: new Date('2026-05-21T00:00:00Z'),
      label: 'Wed May 21',
      rows: [
        makeRow({ id: 'a1', status: 'confirmed' }),
        makeRow({ id: 'a2', patientName: 'Liam Brooks', status: 'scheduled' }),
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
})
