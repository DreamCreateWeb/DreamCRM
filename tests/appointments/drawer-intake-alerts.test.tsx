/**
 * Appointment drawer → the Intake section's medical alerts (ML-27): the
 * cached pre-visit alerts for the patient's newest intake render as a list
 * under "Heads-up from their intake form", with a door to the submission
 * when it is not the one attached to this visit. No alerts → no block, and
 * the Intake section still follows the door. Heavy children mocked to
 * markers, as in appointment-drawer-review.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/followups/followup-quick-add', () => ({ default: () => <div data-testid="followup" /> }))
vi.mock('@/components/tags/patient-tag-control', () => ({ default: () => <div data-testid="tags" /> }))
vi.mock('@/app/(default)/patients/send-intake-inline', () => ({ default: () => <div data-testid="intake" /> }))
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({ default: () => null }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(),
  cancelAppointmentAction: vi.fn(),
  markNoShowAction: vi.fn(),
  markCompletedAction: vi.fn(),
  rescheduleAppointmentAction: vi.fn(),
  sendReminderAction: vi.fn(),
}))
vi.mock('@/app/(default)/patients/actions', () => ({ sendReviewRequestForPatientAction: vi.fn(async () => ({ ok: true })) }))

import AppointmentDrawer from '@/app/(default)/appointments/appointment-drawer'

function detail(over: Record<string, unknown> = {}) {
  const flags = {
    newPatient: false, birthdayThisWeek: false, hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false, unconfirmedNext48h: false, lapsedReturning: false,
    optedOut: false, reminderSentRecently: false, bookedJustNow: false, rescheduled: false,
  }
  return {
    id: 'a1', patientId: 'pat_1', patientName: 'Mia Hayes', patientLifecycle: 'active',
    startTime: '2026-06-15T14:30:00.000Z', endTime: '2026-06-15T15:00:00.000Z',
    durationMinutes: 30, type: 'cleaning', status: 'confirmed', source: 'manual', notes: null,
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
    intakeOpen: true,
    cancelNotice: 'email',
    ...over,
  }
}

function mockFetch(d: unknown) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => d })) as unknown as typeof fetch
}

describe('AppointmentDrawer — the Intake section’s medical alerts', () => {
  it('lists every alert, first in the glyph cluster, with a door to the submission the alerts came from', async () => {
    mockFetch(detail({
      intakeAlerts: { submissionId: 'sub_intake', alerts: ['Allergic to penicillin', 'Takes warfarin (blood thinner)'] },
      intakeAttached: { id: 'sub_consent', formTitle: 'Sedation consent', submittedAt: '2026-06-10T10:00:00.000Z' },
    }))
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
    await screen.findByText('Mia Hayes')

    expect(screen.getByText('Heads-up from their intake form')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Medical alerts from the intake form' })
    expect(list).toHaveTextContent('Allergic to penicillin')
    expect(list).toHaveTextContent('Takes warfarin (blood thinner)')
    // The alerts came from a different submission than the one attached → a door to the answers.
    expect(screen.getByRole('link', { name: 'check the answers' })).toHaveAttribute('href', '/intake-forms/submissions/sub_intake')
    // The registry glyph rides the cluster too.
    expect(screen.getAllByLabelText('Medical alert on the intake form').length).toBeGreaterThanOrEqual(1)
  })

  it('no cached alerts → no heads-up block, and the section still only shows while the door is open', async () => {
    mockFetch(detail({ intakeAlerts: null }))
    render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
    await screen.findByText('Mia Hayes')
    expect(screen.queryByText('Heads-up from their intake form')).toBeNull()
    expect(screen.queryByLabelText('Medical alert on the intake form')).toBeNull()
    expect(screen.getByText(/No intake on file for this patient yet/)).toBeInTheDocument()
  })
})
