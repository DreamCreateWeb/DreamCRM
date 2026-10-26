/**
 * The cancel dialog says what the cancel will actually SEND. The old copy —
 * "The patient will not be notified automatically." — was false in the common
 * case: cancelAppointment emails the patient a cancellation note with a
 * rebook link whenever an email is on file and the clinic's cancellation
 * email is on (its default). The detail now carries `cancelNotice`, derived
 * from exactly those two facts, and the dialog reads one of three true lines.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'
import { cancelNoticeFor, cancelNoticeMessage } from '@/lib/cancel-actor'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/followups/followup-quick-add', () => ({ default: () => <div data-testid="followup" /> }))
vi.mock('@/components/tags/patient-tag-control', () => ({ default: () => <div data-testid="tags" /> }))
vi.mock('@/app/(default)/patients/send-intake-inline', () => ({ default: () => <div data-testid="intake" /> }))
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({ default: () => null }))

// Capture what the dialog is asked to say; answer "no" so nothing cancels.
const confirmCalls: Array<{ title?: string; message?: unknown }> = []
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => async (opts: { title?: string; message?: unknown }) => {
    confirmCalls.push(opts)
    return false
  },
}))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(),
  cancelAppointmentAction: vi.fn(),
  markNoShowAction: vi.fn(),
  markCompletedAction: vi.fn(),
  rescheduleAppointmentAction: vi.fn(),
  sendReminderAction: vi.fn(),
  addToWaitlistAction: vi.fn(),
  setArrivalStateAction: vi.fn(),
}))
vi.mock('@/app/(default)/patients/actions', () => ({ sendReviewRequestForPatientAction: vi.fn() }))

import AppointmentDrawer from '@/app/(default)/appointments/appointment-drawer'

function detailFor(cancelNotice: 'email' | 'no_email' | 'email_off') {
  const flags = {
    newPatient: false, birthdayThisWeek: false, hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false, unconfirmedNext48h: false, lapsedReturning: false,
    optedOut: false, reminderSentRecently: false, bookedJustNow: false, rescheduled: false,
  }
  return {
    id: 'a1', patientId: 'pat_1', patientName: 'Mia Hayes', patientLifecycle: 'active',
    startTime: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(), endTime: null,
    durationMinutes: 30, type: 'cleaning', status: 'confirmed', source: 'manual', notes: null,
    providerId: null, providerName: 'Dr. Reyes', locationName: null,
    confirmedAt: null, cancelledAt: null, reminderLastSentAt: null,
    createdAt: '2026-06-01T10:00:00.000Z', flags, agingLevel: 'none', needsRebooking: false,
    tags: [],
    patient: {
      id: 'pat_1', fullName: 'Mia Hayes', email: cancelNotice === 'no_email' ? null : 'mia@example.com', phone: '555', dateOfBirth: null,
      lifecycle: 'active', hasPortalAccount: false, outstandingBalanceCents: 0,
      lifetimeValueCents: 0, lastVisitAt: null, totalBookings: 3,
    },
    reminders: [],
    intakeAttached: null,
    cancelNotice,
  }
}

function mockFetch(cancelNotice: 'email' | 'no_email' | 'email_off') {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => detailFor(cancelNotice) })) as unknown as typeof fetch
}

beforeEach(() => {
  confirmCalls.length = 0
})

describe('cancelNoticeFor — the two facts the service branches on', () => {
  it('email on file + automation on → email', () => {
    expect(cancelNoticeFor({ patientEmail: 'mia@example.com', cancellationEmailOn: true })).toBe('email')
  })
  it('no email → no_email, whatever the switch says', () => {
    expect(cancelNoticeFor({ patientEmail: null, cancellationEmailOn: true })).toBe('no_email')
    expect(cancelNoticeFor({ patientEmail: '   ', cancellationEmailOn: false })).toBe('no_email')
  })
  it('email on file but the automation off → email_off', () => {
    expect(cancelNoticeFor({ patientEmail: 'mia@example.com', cancellationEmailOn: false })).toBe('email_off')
  })
  it('each state has its own true sentence', () => {
    expect(cancelNoticeMessage('email', 'Mia')).toBe('We’ll email Mia that it’s cancelled, with a link to rebook.')
    expect(cancelNoticeMessage('no_email', 'Mia')).toBe('Mia has no email on file — nobody will be told automatically.')
    expect(cancelNoticeMessage('email_off', 'Mia')).toBe('Your cancellation email is off, so nobody will be told automatically.')
    // Never a dangling "will not be notified".
    for (const n of ['email', 'no_email', 'email_off'] as const) {
      expect(cancelNoticeMessage(n, 'Mia')).not.toMatch(/will not be notified/)
    }
  })
})

describe('AppointmentDrawer — the cancel dialog tells the truth', () => {
  for (const notice of ['email', 'no_email', 'email_off'] as const) {
    it(`reads the ${notice} line`, async () => {
      mockFetch(notice)
      render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
      await screen.findByText('Mia Hayes')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }))
      await waitFor(() => expect(confirmCalls).toHaveLength(1))
      expect(confirmCalls[0].title).toBe('Cancel this appointment?')
      expect(confirmCalls[0].message).toBe(cancelNoticeMessage(notice, 'Mia'))
    })
  }
})
