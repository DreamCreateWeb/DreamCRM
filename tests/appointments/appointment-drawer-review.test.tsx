/**
 * Appointment drawer → "Request review". A completed visit leads with a
 * Request-review primary (the natural post-visit step) instead of the
 * nonsensical "Send reminder email"; clicking it calls the guarded
 * review-request action with the patient id and flashes the result. A still-open
 * visit does NOT show it. Heavy children are mocked to markers so the test
 * isolates the drawer's own action wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/followups/followup-quick-add', () => ({ default: () => <div data-testid="followup" /> }))
vi.mock('@/components/tags/patient-tag-control', () => ({ default: () => <div data-testid="tags" /> }))
vi.mock('@/app/(default)/patients/send-intake-inline', () => ({ default: () => <div data-testid="intake" /> }))
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({ default: () => null }))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(),
  cancelAppointmentAction: vi.fn(),
  markNoShowAction: vi.fn(),
  markCompletedAction: vi.fn(),
  rescheduleAppointmentAction: vi.fn(),
  sendReminderAction: vi.fn(),
}))

const sendReviewRequestForPatientAction = vi.fn(
  async (_id: string): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
)
vi.mock('@/app/(default)/patients/actions', () => ({
  sendReviewRequestForPatientAction: (id: string) => sendReviewRequestForPatientAction(id),
}))

import AppointmentDrawer from '@/app/(default)/appointments/appointment-drawer'

function detailFor(status: string) {
  const flags = {
    newPatient: false, birthdayThisWeek: false, hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false, unconfirmedNext48h: false, lapsedReturning: false,
    optedOut: false, reminderSentRecently: false, bookedJustNow: false, rescheduled: false,
  }
  return {
    id: 'a1', patientId: 'pat_1', patientName: 'Mia Hayes', patientLifecycle: 'active',
    startTime: '2026-06-15T14:30:00.000Z', endTime: '2026-06-15T15:00:00.000Z',
    durationMinutes: 30, type: 'cleaning', status, source: 'manual', notes: null,
    providerId: null, providerName: 'Dr. Reyes', locationName: null,
    confirmedAt: null, cancelledAt: null, reminderLastSentAt: null,
    createdAt: '2026-06-01T10:00:00.000Z', flags, agingLevel: 'none', needsRebooking: false,
    tags: [],
    patient: {
      id: 'pat_1', fullName: 'Mia Hayes', email: 'mia@example.com', phone: '555', dateOfBirth: null,
      lifecycle: 'active', hasPortalAccount: false, outstandingBalanceCents: 0,
      lifetimeValueCents: 0, lastVisitAt: null, totalBookings: 3,
    },
    reminders: [],
    intakeAttached: null,
  }
}

function mockFetch(status: string) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => detailFor(status) })) as unknown as typeof fetch
}

beforeEach(() => {
  sendReviewRequestForPatientAction.mockClear().mockResolvedValue({ ok: true })
})

describe('AppointmentDrawer — Request review', () => {
  it('a completed visit leads with Request review and sends it', async () => {
    mockFetch('completed')
    render(<AppointmentDrawer appointmentId="a1" onClose={vi.fn()} />)
    await screen.findByText('Mia Hayes')

    expect(screen.getByRole('button', { name: 'Request review' })).toBeTruthy()
    // The post-visit primary REPLACES the (nonsensical) reminder verb.
    expect(screen.queryByRole('button', { name: 'Send reminder email' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Request review' }))
    await waitFor(() => expect(sendReviewRequestForPatientAction).toHaveBeenCalledWith('pat_1'))
    await waitFor(() => expect(screen.getByText('Review request sent.')).toBeTruthy())
  })

  it('surfaces the guard message when the request can’t be sent', async () => {
    sendReviewRequestForPatientAction.mockResolvedValue({ ok: false, error: 'Patient has opted out of marketing email' })
    mockFetch('completed')
    render(<AppointmentDrawer appointmentId="a1" onClose={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByRole('button', { name: 'Request review' }))
    await waitFor(() => expect(screen.getByText(/opted out/)).toBeTruthy())
  })

  it('does NOT show Request review on a still-open (confirmed) visit', async () => {
    mockFetch('confirmed')
    render(<AppointmentDrawer appointmentId="a1" onClose={vi.fn()} />)
    await screen.findByText('Mia Hayes')
    expect(screen.queryByRole('button', { name: 'Request review' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send reminder email' })).toBeTruthy()
  })
})
