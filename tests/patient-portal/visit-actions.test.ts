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
// Capture the duration the booking flow passes to the slot race-guard so we can
// assert the visit-type duration is threaded through (wave 2).
const isSlotAvailableMock = vi.fn(async () => true)
vi.mock('@/lib/services/booking', async () => {
  const { db } = await import('@/lib/db')
  const { appointment } = await import('@/lib/db/schema/clinic')
  return {
    getSlotsForDay: vi.fn(async () => ({
      slots: openSlotIso ? [{ startIso: openSlotIso, label: '9:00 AM', available: true }] : [],
      closedReason: null,
    })),
    isSlotAvailable: (...a: unknown[]) => isSlotAvailableMock(...(a as [])),
    // Route the atomic-book insert through the same db mock so the existing
    // appointment-insert assertions keep working.
    insertAppointmentIfSlotFree: async (_o: string, _s: Date, _d: unknown, values: unknown) => {
      await db.insert(appointment).values(values as never)
      return true
    },
    SLOT_MINUTES: 30,
  }
})

vi.mock('@/lib/services/pms', () => ({ queueAppointmentWriteBack: vi.fn(async () => {}) }))
const sendBookingConfirmation = vi.fn(async () => {})
vi.mock('@/lib/services/booking-confirmation', () => ({
  sendBookingConfirmation: (...a: unknown[]) => sendBookingConfirmation(...(a as [])),
}))
const notifyOrgMembers = vi.fn(async () => {})
vi.mock('@/lib/services/notifications', () => ({
  notifyOrgMembers: (...a: unknown[]) => notifyOrgMembers(...(a as [])),
}))
// Configurable clinic visit-type catalog for the duration-threading test +
// captured appointment inserts so we can assert the computed endTime.
let visitTypeSettings: unknown = null
const insertedAppointments: Array<Record<string, unknown>> = []
// patientDisplayName + bookMyVisitAction read the patient row for the
// notification copy / agenda title; bookMyVisitAction also reads the clinic's
// visit-type settings (dispatch by selected columns).
vi.mock('@/lib/db', () => ({
  db: {
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            cols && 'visitTypeSettings' in cols
              ? [{ visitTypeSettings }]
              : [{ firstName: 'Mia', lastName: 'Hayes' }],
        }),
      }),
    }),
    insert: () => ({
      values: async (vals: Record<string, unknown>) => {
        insertedAppointments.push(vals)
      },
    }),
  },
  schema: {},
}))

import {
  confirmMyVisitAction,
  cancelMyVisitAction,
  rescheduleMyVisitAction,
  bookMyVisitAction,
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
  settings.features.booking = true
  settings.booking.allowedTypes = ['cleaning', 'root_canal']
  settings.booking.minNoticeHours = 2
  visitTypeSettings = null
  insertedAppointments.length = 0
  isSlotAvailableMock.mockClear()
  isSlotAvailableMock.mockResolvedValue(true)
  confirmAppointment.mockClear()
  cancelAppointment.mockClear()
  rescheduleAppointment.mockClear()
  sendBookingConfirmation.mockClear()
  notifyOrgMembers.mockClear()
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
  it('moves the visit when the target slot is open, preserving duration, emails the new time, and notifies staff', async () => {
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
    // Front desk gets pinged (owner/admin only) so a patient change isn't missed.
    expect(notifyOrgMembers).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({ type: 'portal_reschedule' }),
      // The acting portal patient is excluded from their own staff ping.
      { roles: ['owner', 'admin'], excludeEmail: 'mia@example.com' },
    )
  })

  it('refuses a NEW slot inside the clinic min-notice window even when the old slot is far off', async () => {
    // Old visit is 72h out (passes the old-slot gate), but the chosen new time
    // is only 2h away — under the 24h reschedule notice. Must reject.
    const tooSoon = new Date(Date.now() + 2 * HOUR)
    tooSoon.setUTCMinutes(0, 0, 0)
    openSlotIso = tooSoon.toISOString() // even if it were "open", notice wins
    const r = await rescheduleMyVisitAction('appt_1', tooSoon.toISOString())
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/at least 24 hours|call/i)
    expect(rescheduleAppointment).not.toHaveBeenCalled()
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

describe('bookMyVisitAction — visit-type duration threading (wave 2)', () => {
  function bookForm(fields: Record<string, string>) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
  }

  it('computes endTime from the visit-type duration (not a hardcoded 30 min)', async () => {
    visitTypeSettings = [
      { id: 'root_canal', label: 'Root canal', durationMinutes: 60, bookablePortal: true },
    ]
    const start = new Date(Date.now() + 48 * HOUR)
    start.setUTCMinutes(0, 0, 0)
    const r = await bookMyVisitAction(bookForm({ type: 'root_canal', startTime: start.toISOString() }))
    expect(r).toEqual({ ok: true })
    const appt = insertedAppointments[0]
    expect(appt).toBeDefined()
    const durationMs = new Date(appt.endTime as Date).getTime() - new Date(appt.startTime as Date).getTime()
    expect(durationMs).toBe(60 * 60_000)
  })

  it('passes the resolved duration to the slot race-guard', async () => {
    visitTypeSettings = [
      { id: 'root_canal', label: 'Root canal', durationMinutes: 60, bookablePortal: true },
    ]
    const start = new Date(Date.now() + 48 * HOUR)
    start.setUTCMinutes(0, 0, 0)
    await bookMyVisitAction(bookForm({ type: 'root_canal', startTime: start.toISOString() }))
    // isSlotAvailable(orgId, startTime, durationMinutes)
    expect(isSlotAvailableMock).toHaveBeenCalledWith('org_1', expect.any(Date), 60)
  })

  it('falls back to a single 30-min slot when the visit type is unknown', async () => {
    visitTypeSettings = null // no catalog → visitTypeDuration returns 30
    settings.booking.allowedTypes = ['cleaning']
    const start = new Date(Date.now() + 48 * HOUR)
    start.setUTCMinutes(0, 0, 0)
    const r = await bookMyVisitAction(bookForm({ type: 'cleaning', startTime: start.toISOString() }))
    expect(r).toEqual({ ok: true })
    const appt = insertedAppointments[0]
    const durationMs = new Date(appt.endTime as Date).getTime() - new Date(appt.startTime as Date).getTime()
    expect(durationMs).toBe(30 * 60_000)
  })

  it('rejects a visit type the clinic has not made portal-bookable', async () => {
    settings.booking.allowedTypes = ['cleaning']
    const start = new Date(Date.now() + 48 * HOUR).toISOString()
    const r = await bookMyVisitAction(bookForm({ type: 'root_canal', startTime: start }))
    expect(r).toMatchObject({ ok: false })
    expect(insertedAppointments).toHaveLength(0)
  })
})
