/**
 * MARK A CLEANING DONE AND BOOK THE NEXT ONE RIGHT THERE. A completed visit
 * with nothing on the books after it gets a "Book their next visit" door in
 * the drawer's footer, seeded on the patient's recall day; marking a visit
 * completed keeps the drawer open when that door is about to matter; and the
 * booking form honours the seed. The recall engine is untouched — this is a
 * door, not a due date.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/followups/followup-quick-add', () => ({ default: () => <div data-testid="followup" /> }))
vi.mock('@/components/tags/patient-tag-control', () => ({ default: () => <div data-testid="tags" /> }))
vi.mock('@/app/(default)/patients/send-intake-inline', () => ({ default: () => <div data-testid="intake" /> }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/app/(default)/patients/actions', () => ({ sendReviewRequestForPatientAction: vi.fn() }))

// The booking form as a sentinel that prints what it was seeded with.
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({
  default: ({ patientId, defaultType, defaultDate }: { patientId: string; defaultType?: string | null; defaultDate?: string | null }) => (
    <div data-testid="booking-form">
      book:{patientId}:{defaultType ?? '-'}:{defaultDate ?? '-'}
    </div>
  ),
}))

const { markCompletedMock } = vi.hoisted(() => ({ markCompletedMock: vi.fn() }))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(),
  cancelAppointmentAction: vi.fn(),
  markNoShowAction: vi.fn(),
  markCompletedAction: (id: string) => markCompletedMock(id),
  setArrivalStateAction: vi.fn(),
  addToWaitlistAction: vi.fn(),
  sendReminderAction: vi.fn(),
  rescheduleAppointmentAction: vi.fn(),
  getBookingSlotsAction: vi.fn(async () => []),
}))

import AppointmentDrawer from '@/app/(default)/appointments/appointment-drawer'

const HOUR = 3_600_000

function detail(over: Record<string, unknown>) {
  const flags = {
    newPatient: false, birthdayThisWeek: false, hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false, unconfirmedNext48h: false, lapsedReturning: false,
    optedOut: false, reminderSentRecently: false, bookedJustNow: false, rescheduled: false,
  }
  return {
    id: 'a1', patientId: 'pat_1', patientName: 'Mia Hayes', patientLifecycle: 'active',
    startTime: new Date(Date.now() - 2 * HOUR).toISOString(), endTime: null,
    durationMinutes: 30, type: 'cleaning', status: 'completed', source: 'manual', notes: null,
    providerId: null, providerName: null, locationName: null,
    confirmedAt: null, cancelledAt: null, reminderLastSentAt: null,
    createdAt: '2026-06-01T10:00:00.000Z', flags, agingLevel: 'none', needsRebooking: false,
    nextVisitBooked: false, nextVisitDateKey: '2027-04-26', tags: [],
    patient: {
      id: 'pat_1', fullName: 'Mia Hayes', email: 'mia@example.com', phone: '555', dateOfBirth: null,
      lifecycle: 'active', hasPortalAccount: false, outstandingBalanceCents: 0,
      lifetimeValueCents: 0, lastVisitAt: null, totalBookings: 3,
    },
    reminders: [], intakeAttached: null, cancelNotice: 'email',
    ...over,
  }
}

function mockFetchSequence(...payloads: Array<Record<string, unknown>>) {
  const queue = [...payloads]
  global.fetch = vi.fn(async () => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]
    return { ok: true, json: async () => next }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  markCompletedMock.mockReset()
})

describe('AppointmentDrawer — the completed footer', () => {
  it('offers "Book their next visit" when nothing is booked after a completed visit, seeded on the recall day', async () => {
    mockFetchSequence(detail({ nextVisitBooked: false, nextVisitDateKey: '2027-04-26' }))
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    // Request review stays the primary; the door is the secondary beside it.
    expect(screen.getByRole('button', { name: 'Request review' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Book their next visit' }))
    expect(screen.getByTestId('booking-form').textContent).toBe('book:pat_1:cleaning:2027-04-26')
  })

  it('shows no door when the next visit is already on the books', async () => {
    mockFetchSequence(detail({ nextVisitBooked: true }))
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    expect(screen.queryByRole('button', { name: 'Book their next visit' })).toBeNull()
  })

  it('shows no door on an open visit, whatever the flag says', async () => {
    mockFetchSequence(detail({ status: 'confirmed', nextVisitBooked: false, startTime: new Date(Date.now() + 48 * HOUR).toISOString() }))
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    expect(screen.queryByRole('button', { name: 'Book their next visit' })).toBeNull()
  })

  it('a cancelled visit’s Rebook keeps the drawer’s own default day (no recall seed)', async () => {
    mockFetchSequence(detail({ status: 'cancelled', nextVisitBooked: false }))
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByRole('button', { name: 'Rebook patient' }))
    expect(screen.getByTestId('booking-form').textContent).toBe('book:pat_1:cleaning:-')
  })
})

describe('AppointmentDrawer — Mark completed', () => {
  it('stays open and surfaces the door when nothing is booked after the visit', async () => {
    const onClose = vi.fn()
    mockFetchSequence(
      detail({ status: 'confirmed', nextVisitBooked: false }), // past-but-open → "Mark completed"
      detail({ status: 'completed', nextVisitBooked: false, nextVisitDateKey: '2027-04-26' }),
    )
    markCompletedMock.mockResolvedValue({
      ok: true, reviewSent: false, patientId: 'pat_1', visitType: 'cleaning', nextVisitBooked: false, nextVisitDateKey: '2027-04-26',
    })
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={onClose} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }))
    await waitFor(() => expect(markCompletedMock).toHaveBeenCalledWith('a1'))
    expect(await screen.findByRole('button', { name: 'Book their next visit' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/Nothing is booked after this one yet/)).toBeTruthy()
  })

  it('closes as before when the next visit is already booked', async () => {
    const onClose = vi.fn()
    mockFetchSequence(detail({ status: 'confirmed', nextVisitBooked: true }))
    markCompletedMock.mockResolvedValue({
      ok: true, reviewSent: true, patientId: 'pat_1', visitType: 'cleaning', nextVisitBooked: true, nextVisitDateKey: null,
    })
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={onClose} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.getByText('Marked completed — review request sent.')).toBeTruthy()
  })

  it('an action that THROWS (a redeploy under the tab) reports instead of spinning forever', async () => {
    const onClose = vi.fn()
    mockFetchSequence(detail({ status: 'confirmed' }))
    markCompletedMock.mockRejectedValue(new Error('Failed to find Server Action "x". This request might be from an older or newer deployment.'))
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={onClose} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Refresh to keep working/)
    expect(onClose).not.toHaveBeenCalled()
  })
})
