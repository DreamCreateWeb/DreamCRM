import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(default)/patients/actions', () => ({
  archivePatientAction: vi.fn(),
  updatePatientAction: vi.fn(),
  addPatientNoteAction: vi.fn(),
  deletePatientNoteAction: vi.fn(),
  openPatientThreadAction: vi.fn(),
  sendIntakeRequestAction: vi.fn(async () => ({ ok: true, sentTo: 'mia@example.com' })),
  sendReviewRequestForPatientAction: vi.fn(async () => ({ ok: true })),
}))

import PatientDetail from '@/app/(default)/patients/[id]/patient-detail'
import type { PatientHeader } from '@/lib/services/patients'
import type { TimelineEvent, TimelineCounts } from '@/lib/services/patient-timeline'

function header(overrides: Partial<PatientHeader> = {}): PatientHeader {
  return {
    id: 'pat_1',
    firstName: 'Mia',
    lastName: 'Hayes',
    fullName: 'Mia Hayes',
    email: 'mia@example.com',
    phone: '555-0100',
    dateOfBirth: '1990-04-15',
    ageYears: 36,
    addressLine1: '12 Linden Ave',
    city: 'Brooklyn',
    state: 'NY',
    postalCode: '11201',
    insuranceProvider: 'Delta Dental',
    insurancePolicyNumber: 'POL-12345',
    insuranceGroupNumber: 'GRP-1',
    notes: null,
    source: 'booking',
    lifecycle: 'active',
    firstSeenAt: new Date('2025-08-10T00:00:00Z'),
    lastActivityAt: new Date('2026-05-01T00:00:00Z'),
    hasPortalAccount: true,
    guardianPatientId: null,
    recallIntervalMonths: null,
    flags: {
      newPatient: false,
      birthdayThisWeek: false,
      hasOutstandingBalance: false,
      missingIntakeBeforeAppt: false,
      unconfirmedNext48h: false,
      lapsed: false,
      optedOut: false,
    },
    outstandingBalanceCents: 0,
    balanceAsOf: new Date('2026-05-01T00:00:00Z'),
    shopSpendCents: 24000,
    lastVisitAt: new Date('2026-04-01T00:00:00Z'),
    nextVisitAt: new Date('2026-06-10T09:00:00Z'),
    nextVisitType: 'cleaning',
    totalBookings: 4,
    ...overrides,
  }
}

const emptyCounts: TimelineCounts = { all: 0, appointments: 0, messages: 0, forms: 0, billing: 0, notes: 0 }

describe('PatientDetail header', () => {
  it('renders the patient name, age, and lifecycle pill', () => {
    render(<PatientDetail header={header()} timeline={[]} counts={emptyCounts} notes={[]} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mia Hayes' })).toBeInTheDocument()
    expect(screen.getByText('36 yrs')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders the primary CTA buttons in the header', () => {
    render(<PatientDetail header={header()} timeline={[]} counts={emptyCounts} notes={[]} />)
    // "Send message" is a form-submit button (server action resolves the
    // patient's thread + redirects to /messages?thread=<id>), not a bare link.
    expect(screen.getByRole('button', { name: /Send message/i })).toBeInTheDocument()
    // "Book appointment" opens an in-place drawer (not a navigation link).
    expect(screen.getByRole('button', { name: /Book appointment/i })).toBeInTheDocument()
    // "Send intake" is now a button that fires the send-intake server action
    // (was a dead link to /intake-forms that didn't send anything).
    expect(screen.getByRole('button', { name: /Send intake/i })).toBeInTheDocument()
    // "Request review" fires the review-send server action — previously the
    // only entry point was the /reviews dashboard's Ready-to-ask list.
    expect(screen.getByRole('button', { name: /Request review/i })).toBeInTheDocument()
  })

  it('shows shop-purchase spend and next-visit stats', () => {
    render(<PatientDetail header={header()} timeline={[]} counts={emptyCounts} notes={[]} />)
    // Shop purchases stat ($240 from shopSpendCents 24000).
    expect(screen.getByText('$240')).toBeInTheDocument()
    expect(screen.getByText('Shop purchases')).toBeInTheDocument()
    // Next visit type capitalized via CSS, raw text is 'cleaning'
    expect(screen.getByText('cleaning')).toBeInTheDocument()
  })

  it('shows "No PMS balance on file" when the balance is null, never a fake $0', () => {
    render(<PatientDetail header={header({ outstandingBalanceCents: null })} timeline={[]} counts={emptyCounts} notes={[]} />)
    expect(screen.getByText(/No PMS balance on file/i)).toBeInTheDocument()
  })

  it('renders the Nothing-pending state when no flags are set', () => {
    render(<PatientDetail header={header()} timeline={[]} counts={emptyCounts} notes={[]} />)
    expect(screen.getByText(/Nothing pending/i)).toBeInTheDocument()
  })

  it('renders Needs-attention items when flags trigger them', () => {
    render(
      <PatientDetail
        header={header({
          outstandingBalanceCents: 45000,
          flags: {
            newPatient: false,
            birthdayThisWeek: false,
            hasOutstandingBalance: true,
            missingIntakeBeforeAppt: true,
            unconfirmedNext48h: true,
            lapsed: false,
            optedOut: false,
          },
        })}
        timeline={[]}
        counts={emptyCounts}
        notes={[]}
      />,
    )
    expect(screen.getByText(/Needs attention/i)).toBeInTheDocument()
    expect(screen.getByText(/Upcoming appointment is unconfirmed/)).toBeInTheDocument()
    expect(screen.getByText(/Missing intake form before next visit/)).toBeInTheDocument()
    expect(screen.getByText(/balance on file/)).toBeInTheDocument()
  })
})

describe('PatientDetail timeline', () => {
  const event = (overrides: Partial<TimelineEvent>): TimelineEvent => ({
    id: 'e_1',
    kind: 'appointment',
    occurredAt: new Date('2026-05-10T09:00:00Z'),
    title: 'cleaning',
    subtitle: 'Mon, May 10, 9:00 AM',
    status: 'confirmed',
    direction: null,
    href: '/appointments',
    body: null,
    agingDays: null,
    ...overrides,
  })

  it('renders the empty-state when no events match', () => {
    render(<PatientDetail header={header()} timeline={[]} counts={emptyCounts} notes={[]} />)
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument()
  })

  it('renders a row per event with status pill', () => {
    // Use header with no nextVisit so "cleaning" only appears in the timeline
    const h = header({ nextVisitAt: null, nextVisitType: null })
    const timeline = [
      event({ id: 'a_1', kind: 'appointment', title: 'cleaning', status: 'confirmed' }),
      event({ id: 'm_1', kind: 'message', title: 'Sarah sent a message', body: 'Running 5 min late!', direction: 'in', status: null }),
    ]
    render(
      <PatientDetail
        header={h}
        timeline={timeline}
        counts={{ all: 2, appointments: 1, messages: 1, forms: 0, billing: 0, notes: 0 }}
        notes={[]}
      />,
    )
    expect(screen.getByText('cleaning')).toBeInTheDocument()
    expect(screen.getByText('Sarah sent a message')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('From patient')).toBeInTheDocument()
    expect(screen.getByText('Running 5 min late!')).toBeInTheDocument()
  })

  it('filters timeline when a pill is clicked', () => {
    const h = header({ nextVisitAt: null, nextVisitType: null })
    const timeline = [
      event({ id: 'a_1', kind: 'appointment', title: 'extraction', status: 'completed' }),
      event({ id: 'n_1', kind: 'note', title: 'Note', body: 'prefers mornings', status: null, href: null }),
    ]
    render(
      <PatientDetail
        header={h}
        timeline={timeline}
        counts={{ all: 2, appointments: 1, messages: 0, forms: 0, billing: 0, notes: 1 }}
        notes={[]}
      />,
    )
    expect(screen.getByText('prefers mornings')).toBeInTheDocument()
    // Click "Appointments" filter — note should disappear
    fireEvent.click(screen.getByRole('button', { name: /Appointments/i }))
    expect(screen.queryByText('prefers mornings')).not.toBeInTheDocument()
    expect(screen.getByText('extraction')).toBeInTheDocument()
  })

  it('shows count badges on filter pills', () => {
    render(
      <PatientDetail
        header={header()}
        timeline={[]}
        counts={{ all: 7, appointments: 4, messages: 2, forms: 1, billing: 0, notes: 0 }}
        notes={[]}
      />,
    )
    const all = screen.getByRole('button', { name: /^All ?7?$/ })
    expect(all).toHaveTextContent('7')
  })
})
