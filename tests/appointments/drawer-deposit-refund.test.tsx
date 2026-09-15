/**
 * The appointment drawer's booking-deposit pill, after a Stripe refund
 * (DREAMCRM-32, found by the batch invariant sweep).
 *
 * `booking_deposit.status` deliberately STAYS 'paid' after a refund — the
 * reconciliation list under Payments → Online needs the row, because the front
 * desk has already posted that money to the PMS ledger. So a pill that reads
 * only `status` told them "$50 deposit paid · credited toward this visit; post
 * it to your PMS ledger" about money that had already gone back.
 *
 * Three states, the same three the row on Payments → Online has always shown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
vi.mock('@/app/(default)/patients/actions', () => ({
  sendReviewRequestForPatientAction: vi.fn(async () => ({ ok: true })),
}))

import AppointmentDrawer from '@/app/(default)/appointments/appointment-drawer'

function detailWithDeposit(
  deposit: { amountCents: number; status: string; refundedAmountCents: number } | null,
) {
  const flags = {
    newPatient: false, birthdayThisWeek: false, hasOutstandingBalance: false,
    missingIntakeBeforeAppt: false, unconfirmedNext48h: false, lapsedReturning: false,
    optedOut: false, reminderSentRecently: false, bookedJustNow: false, rescheduled: false,
  }
  return {
    id: 'a1', patientId: 'pat_1', patientName: 'Mia Hayes', patientLifecycle: 'active',
    startTime: '2026-06-15T14:30:00.000Z', endTime: '2026-06-15T15:00:00.000Z',
    durationMinutes: 30, type: 'cleaning', status: 'scheduled', source: 'website', notes: null,
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
    deposit,
  }
}

function mockFetch(deposit: Parameters<typeof detailWithDeposit>[0]) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => detailWithDeposit(deposit),
  })) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function renderDrawer() {
  render(<ToastProvider><AppointmentDrawer appointmentId="a1" onClose={vi.fn()} /></ToastProvider>)
  await screen.findByText('Mia Hayes')
}

describe('AppointmentDrawer — booking deposit after a refund', () => {
  it('an untouched deposit still reads as money down', async () => {
    mockFetch({ amountCents: 5_000, status: 'paid', refundedAmountCents: 0 })
    await renderDrawer()
    expect(screen.getByText(/\$50 deposit paid/)).toBeTruthy()
  })

  it('a fully refunded deposit does NOT say "paid" — the status column still does', async () => {
    mockFetch({ amountCents: 5_000, status: 'paid', refundedAmountCents: 5_000 })
    await renderDrawer()
    expect(screen.queryByText(/deposit paid/)).toBeNull()
    expect(screen.getByText(/\$50 deposit refunded/)).toBeTruthy()
  })

  it('a partly refunded deposit says what is actually left toward the visit', async () => {
    mockFetch({ amountCents: 5_000, status: 'paid', refundedAmountCents: 2_000 })
    await renderDrawer()
    expect(screen.queryByText(/deposit paid/)).toBeNull()
    expect(screen.getByText(/\$30 deposit left/)).toBeTruthy()
    expect(screen.getByText(/\$20 refunded/)).toBeTruthy()
  })

  it('a deposit that was never completed is untouched by any of this', async () => {
    mockFetch({ amountCents: 5_000, status: 'pending', refundedAmountCents: 0 })
    await renderDrawer()
    expect(screen.getByText(/\$50 deposit pending/)).toBeTruthy()
  })

  it('no deposit, no pill', async () => {
    mockFetch(null)
    await renderDrawer()
    expect(screen.queryByText(/deposit/i)).toBeNull()
  })
})
