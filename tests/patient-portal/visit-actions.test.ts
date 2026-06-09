import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Patient-side visit lifecycle actions: confirm / cancel / reschedule.
 * The guards under test are the ones that protect the clinic's schedule:
 * visit scoping (self + dependents only), status gates, the reschedule
 * feature flag, and the min-notice window ("call us" inside the cutoff).
 */

const tenantCtx = {
  tenantType: 'patient' as 'patient' | 'clinic',
  organizationId: 'org_1',
  patientId: 'pat_1' as string | null,
  userName: 'Mia',
  userEmail: 'mia@example.com',
}

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => tenantCtx),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const settings = {
  features: { booking: true, reschedule: true, messages: true, family: true } as Record<string, boolean>,
  booking: { allowedTypes: ['cleaning'], minNoticeHours: 2 },
  reschedule: { minNoticeHours: 24 },
}
vi.mock('@/lib/services/portal-settings', () => ({
  getPortalSettings: vi.fn(async () => settings),
}))

const HOUR = 3_600_000

// The visit returned by the scoped lookup; null = not found / not yours.
let visit: {
  id: string
  patientId: string
  type: string
  status: string
  startTime: Date
} | null = null

vi.mock('@/lib/services/patient-portal', () => ({
  getAccessiblePatientIds: vi.fn(async () => ['pat_1', 'pat_kid']),
  getVisitForPatients: vi.fn(async () => visit),
  sendMessageFromPatient: vi.fn(),
}))

const confirmAppointment = vi.fn(async () => {})
const cancelAppointment = vi.fn(async () => {})
const rescheduleAppointment = vi.fn(async () => 'appt_new')
vi.mock('@/lib/services/appointments', () => ({
  confirmAppointment: (...a: unknown[]) => confirmAppointment(...(a as [])),
  cancelAppointment: (...a: unknown[]) => cancelAppointment(...(a as [])),
  rescheduleAppointment: (...a: unknown[]) => rescheduleAppointment(...(a as [])),
}))

// Reschedule target-slot guard. Default: the chosen slot is open.
let openSlotIso: string | null = null
vi.mock('@/lib/services/booking', () => ({
  getSlotsForDay: vi.fn(async () => ({
    slots: openSlotIso ? [{ startIso: openSlotIso, label: '9:00 AM', available: true }] : [],
    closedReason: null,
  })),
  isSlotAvailable: vi.fn(async () => true),
  SLOT_MINUTES: 30,
}))

vi.mock('@/lib/services/pms', () => ({ queueAppointmentWriteBack: vi.fn(async () => {}) }))
const sendBookingConfirmation = vi.fn(async () => {})
vi.mock('@/lib/services/booking-confirmation', () => ({
  sendBookingConfirmation: (...a: unknown[]) => sendBookingConfirmation(...(a as [])),
}))
vi.mock('@/lib/db', () => ({ db: {} }))

import {
  confirmMyVisitAction,
  cancelMyVisitAction,
  rescheduleMyVisitAction,
} from '@/app/(portal)/patient/actions'

beforeEach(() => {
  tenantCtx.tenantType = 'patient'
  tenantCtx.patientId = 'pat_1'
  settings.features.reschedule = true
  settings.reschedule.minNoticeHours = 24
  visit = {
    id: 'appt_1',
    patientId: 'pat_1',
    type: 'cleaning',
    status: 'scheduled',
    startTime: new Date(Date.now() + 72 * HOUR),
  }
  openSlotIso = null
  confirmAppointment.mockClear()
  cancelAppointment.mockClear()
  rescheduleAppointment.mockClear()
  sendBookingConfirmation.mockClear()
})

describe('confirmMyVisitAction', () => {
  it('confirms a scheduled visit via the shared service with the portal source', async () => {
    const r = await confirmMyVisitAction('appt_1')
    expect(r).toEqual({ ok: true })
    expect(confirmAppointment).toHaveBeenCalledWith('org_1', 'appt_1', 'portal')
  })

  it('rejects a visit outside the accessible patient set', async () => {
    visit = null // scoped lookup found nothing
    const r = await confirmMyVisitAction('appt_other')
    expect(r).toMatchObject({ ok: false })
    expect(confirmAppointment).not.toHaveBeenCalled()
  })

  it('rejects when the visit is already confirmed', async () => {
    visit!.status = 'confirmed'
    const r = await confirmMyVisitAction('appt_1')
    expect(r).toMatchObject({ ok: false })
    expect(confirmAppointment).not.toHaveBeenCalled()
  })
})

describe('cancelMyVisitAction', () => {
  it('cancels outside the notice window', async () => {
    const r = await cancelMyVisitAction('appt_1')
    expect(r).toEqual({ ok: true })
    expect(cancelAppointment).toHaveBeenCalledWith('org_1', 'appt_1')
  })

  it('refuses inside the notice window and points at the phone', async () => {
    visit!.startTime = new Date(Date.now() + 6 * HOUR) // < 24h cutoff
    const r = await cancelMyVisitAction('appt_1')
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/call/i)
    expect(cancelAppointment).not.toHaveBeenCalled()
  })

  it('refuses when the clinic toggled self-serve changes off', async () => {
    settings.features.reschedule = false
    const r = await cancelMyVisitAction('appt_1')
    expect(r).toMatchObject({ ok: false })
    expect(cancelAppointment).not.toHaveBeenCalled()
  })

  it('refuses terminal-state visits', async () => {
    visit!.status = 'completed'
    const r = await cancelMyVisitAction('appt_1')
    expect(r).toMatchObject({ ok: false })
    expect(cancelAppointment).not.toHaveBeenCalled()
  })
})

describe('rescheduleMyVisitAction', () => {
  it('moves the visit when the target slot is open, preserving duration, and emails the new time', async () => {
    const target = new Date(Date.now() + 96 * HOUR)
    target.setUTCMinutes(0, 0, 0)
    openSlotIso = target.toISOString()
    const r = await rescheduleMyVisitAction('appt_1', target.toISOString())
    expect(r).toEqual({ ok: true })
    expect(rescheduleAppointment).toHaveBeenCalledWith({
      organizationId: 'org_1',
      appointmentId: 'appt_1',
      newStartTime: target,
      newEndTime: null, // null = service preserves the original duration
    })
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'pat_1', appointmentType: 'cleaning' }),
    )
  })

  it('refuses inside the notice window', async () => {
    visit!.startTime = new Date(Date.now() + 2 * HOUR)
    const r = await rescheduleMyVisitAction('appt_1', new Date(Date.now() + 96 * HOUR).toISOString())
    expect(r).toMatchObject({ ok: false })
    expect(rescheduleAppointment).not.toHaveBeenCalled()
  })

  it('refuses when the target slot is taken', async () => {
    openSlotIso = null // no open slots returned
    const r = await rescheduleMyVisitAction('appt_1', new Date(Date.now() + 96 * HOUR).toISOString())
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/just taken/i)
    expect(rescheduleAppointment).not.toHaveBeenCalled()
  })

  it('refuses a past target time', async () => {
    const r = await rescheduleMyVisitAction('appt_1', new Date(Date.now() - HOUR).toISOString())
    expect(r).toMatchObject({ ok: false })
    expect(rescheduleAppointment).not.toHaveBeenCalled()
  })

  it('refuses when the feature is off', async () => {
    settings.features.reschedule = false
    const r = await rescheduleMyVisitAction('appt_1', new Date(Date.now() + 96 * HOUR).toISOString())
    expect(r).toMatchObject({ ok: false })
    expect(rescheduleAppointment).not.toHaveBeenCalled()
  })
})
