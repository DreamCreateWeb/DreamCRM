/**
 * The reschedule panel renders the chair-aware SLOT GRID (the same chips the
 * booking drawer draws), seeded on the visit's own day with its own time
 * preselected, and a "Custom time" hatch for the off-grid start. Whatever is
 * submitted goes through `rescheduleAppointmentAction` — whose guard checks
 * the visit's real length (reschedule-action.test.ts) — so the hatch is not a
 * way around the guard, only around the grid.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/followups/followup-quick-add', () => ({ default: () => <div data-testid="followup" /> }))
vi.mock('@/components/tags/patient-tag-control', () => ({ default: () => <div data-testid="tags" /> }))
vi.mock('@/app/(default)/patients/send-intake-inline', () => ({ default: () => <div data-testid="intake" /> }))
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({ default: () => null }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/app/(default)/patients/actions', () => ({ sendReviewRequestForPatientAction: vi.fn() }))

const { rescheduleMock, slotsMock } = vi.hoisted(() => ({
  rescheduleMock: vi.fn(),
  slotsMock: vi.fn(),
}))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(),
  cancelAppointmentAction: vi.fn(),
  markNoShowAction: vi.fn(),
  markCompletedAction: vi.fn(),
  setArrivalStateAction: vi.fn(),
  addToWaitlistAction: vi.fn(),
  sendReminderAction: vi.fn(),
  rescheduleAppointmentAction: (input: unknown) => rescheduleMock(input),
  getBookingSlotsAction: (dateKey: string, duration?: number, exclude?: string) => slotsMock(dateKey, duration, exclude),
}))

import AppointmentDrawer from '@/app/(default)/appointments/appointment-drawer'

const HOUR = 3_600_000
/** The visit being moved: three days out, on the hour (a grid boundary). */
const VISIT_START = (() => {
  const d = new Date(Date.now() + 3 * 24 * HOUR)
  d.setMinutes(0, 0, 0)
  return d
})()
const VISIT_ISO = VISIT_START.toISOString()
const OTHER_ISO = new Date(VISIT_START.getTime() + 2 * HOUR).toISOString()

function detail() {
  const flags = {
    newPatient: false, birthdayThisWeek: false, hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false, unconfirmedNext48h: false, lapsedReturning: false,
    optedOut: false, reminderSentRecently: false, bookedJustNow: false, rescheduled: false,
  }
  return {
    id: 'a1', patientId: 'pat_1', patientName: 'Mia Hayes', patientLifecycle: 'active',
    startTime: VISIT_ISO, endTime: new Date(VISIT_START.getTime() + HOUR).toISOString(),
    durationMinutes: 60, type: 'crown', status: 'confirmed', source: 'manual', notes: null,
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
  }
}

/** The visit's own local day as the drawer seeds it. */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function openReschedule() {
  render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
  await screen.findByText('Mia Hayes')
  fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
  await screen.findByRole('dialog', { name: 'Reschedule appointment' })
}

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => detail() })) as unknown as typeof fetch
  rescheduleMock.mockReset().mockResolvedValue({ ok: true, newId: 'appt_new' })
  slotsMock.mockReset().mockResolvedValue([
    { startIso: VISIT_ISO, label: '9:00 AM', available: true },
    { startIso: OTHER_ISO, label: '11:00 AM', available: true },
    { startIso: new Date(VISIT_START.getTime() + 4 * HOUR).toISOString(), label: '1:00 PM', available: false },
  ])
})

describe('RescheduleSubDrawer — real open slots', () => {
  it('asks for the visit’s own day with the visit excluded, and preselects its current time', async () => {
    await openReschedule()
    await waitFor(() => expect(slotsMock).toHaveBeenCalledWith(localKey(VISIT_START), undefined, 'a1'))
    const keep = await screen.findByRole('button', { name: '9:00 AM' })
    expect(keep).toHaveAttribute('aria-pressed', 'true')
    // Taken slots are not offered; the hatch always is; the length is said.
    expect(screen.queryByRole('button', { name: '1:00 PM' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Custom time' })).toBeTruthy()
    expect(screen.getByText(/open for 60 min/)).toBeTruthy()
  })

  it('picking a chip submits that slot’s instant', async () => {
    await openReschedule()
    fireEvent.click(await screen.findByRole('button', { name: '11:00 AM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reschedule' }))
    await waitFor(() =>
      expect(rescheduleMock).toHaveBeenCalledWith({ appointmentId: 'a1', newStartTime: OTHER_ISO, notifyPatient: true }),
    )
  })

  it('"Custom time" reveals a time input and submits date + typed time — still through the action', async () => {
    await openReschedule()
    await screen.findByRole('button', { name: '9:00 AM' })
    fireEvent.click(screen.getByRole('button', { name: 'Custom time' }))
    const input = screen.getByLabelText('Custom time') as HTMLInputElement
    fireEvent.change(input, { target: { value: '14:15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reschedule' }))
    const expected = new Date(`${localKey(VISIT_START)}T14:15:00`).toISOString()
    await waitFor(() =>
      expect(rescheduleMock).toHaveBeenCalledWith({ appointmentId: 'a1', newStartTime: expected, notifyPatient: true }),
    )
  })

  it('changing the day reloads the grid and drops a selection that is no longer open', async () => {
    await openReschedule()
    await screen.findByRole('button', { name: '9:00 AM' })
    slotsMock.mockResolvedValueOnce([{ startIso: OTHER_ISO, label: '11:00 AM', available: true }])
    const nextDay = new Date(VISIT_START.getTime() + 24 * HOUR)
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: localKey(nextDay) } })
    await waitFor(() => expect(slotsMock).toHaveBeenLastCalledWith(localKey(nextDay), undefined, 'a1'))
    await waitFor(() => expect(screen.queryByRole('button', { name: '9:00 AM' })).toBeNull())
    // Nothing is selected now — submitting asks for a pick rather than sending the stale time.
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reschedule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Pick an open time/)
    expect(rescheduleMock).not.toHaveBeenCalled()
  })

  it('the server’s refusal shows in the panel, which stays open', async () => {
    rescheduleMock.mockResolvedValue({ ok: false, error: 'That slot conflicts with an existing appointment.' })
    await openReschedule()
    fireEvent.click(await screen.findByRole('button', { name: '11:00 AM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reschedule' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/conflicts/)
    expect(screen.getByRole('dialog', { name: 'Reschedule appointment' })).toBeTruthy()
  })

  it('a grid that cannot load still offers the custom-time hatch', async () => {
    slotsMock.mockRejectedValue(new Error('network'))
    await openReschedule()
    expect(await screen.findByText(/Could not load open times/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use a custom time' }))
    expect(screen.getByLabelText('Custom time')).toBeTruthy()
  })
})
