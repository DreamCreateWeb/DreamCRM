import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * rescheduleAppointmentAction's slot guard must check the MOVING VISIT'S REAL
 * LENGTH. It used to call getSlotsForDay with no duration, so the check
 * covered the leading 30-minute slot only — a 60-minute visit moved to 4:30
 * before a 5:00 close passed, and a crown landed on the next chair's
 * booking. Now the visit's own end time (or its type's catalog length) is
 * the 4th argument, the new row's end follows the same length, and the
 * patient notice goes through the Emails-hub `rescheduled` key.
 * getBookingSlotsAction gains the same exclusion + resolver so the drawer's
 * grid and the guard cannot disagree.
 */

let tenantCtx: { tenantType: string; role: string; organizationId: string } | null = null
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const slotCalls: Array<{ org: string; date: unknown; exclude?: string; duration?: number }> = []
let slotsForDayResult: { slots: Array<{ startIso: string; available: boolean }>; closedReason: string | null } = {
  slots: [],
  closedReason: null,
}
vi.mock('@/lib/services/booking', () => ({
  getSlotsForDay: vi.fn(async (org: string, date: unknown, exclude?: string, duration?: number) => {
    slotCalls.push({ org, date, exclude, duration })
    return slotsForDayResult
  }),
}))

const rescheduled: Array<Record<string, unknown>> = []
vi.mock('@/lib/services/appointments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/appointments')>('@/lib/services/appointments')
  return {
    ...actual,
    rescheduleAppointment: vi.fn(async (input: Record<string, unknown>) => {
      rescheduled.push(input)
      return 'appt_new'
    }),
    getAppointmentDetail: vi.fn(async () => null),
  }
})

const notices: Array<{ org: string; id: string }> = []
vi.mock('@/lib/services/booking-confirmation', () => ({
  sendBookingConfirmation: vi.fn(),
  sendRescheduleNotice: vi.fn(async (org: string, id: string) => {
    notices.push({ org, id })
    return { sent: true }
  }),
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({ name: 'Acme Dental', from: 'a@b.c', timeZone: 'America/Chicago' })),
}))
vi.mock('@/lib/services/reminder-automation', () => ({ sendReminderEmail: vi.fn(), sendReminderSms: vi.fn() }))
vi.mock('@/lib/services/patient-followups', () => ({ bulkCreateFollowups: vi.fn() }))
vi.mock('@/lib/services/providers', () => ({ listProviders: vi.fn(async () => []) }))
vi.mock('@/lib/services/patients', () => ({ searchPatientOptions: vi.fn(), getPatientOption: vi.fn() }))
vi.mock('@/lib/services/saved-views', () => ({ createSavedView: vi.fn(), deleteSavedView: vi.fn() }))

// The action's own reads, in order: the moving visit (start/end/type), then —
// only when the row has no end — the clinic's visit-type settings.
const selectQueue: unknown[][] = []
vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => selectQueue.shift() ?? []
    return obj
  }
  return { db: { select: () => chain() } }
})
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: { organizationId: 'organization_id', visitTypeSettings: 'visit_type_settings' } }))
vi.mock('@/lib/db/schema/clinic', () => ({
  appointment: { id: 'id', organizationId: 'organization_id', startTime: 'start_time', endTime: 'end_time', type: 'type' },
}))

import { getBookingSlotsAction, rescheduleAppointmentAction } from '@/app/(default)/appointments/actions'

const HOUR = 3_600_000
/** A future start, on the hour, so the mocked grid can carry it. */
function futureStart(): Date {
  const d = new Date(Date.now() + 3 * 24 * HOUR)
  d.setUTCHours(15, 0, 0, 0)
  return d
}

beforeEach(() => {
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1' }
  slotCalls.length = 0
  rescheduled.length = 0
  notices.length = 0
  selectQueue.length = 0
  slotsForDayResult = { slots: [], closedReason: null }
})

describe('rescheduleAppointmentAction — the guard checks the visit’s real length', () => {
  it('passes the moving visit’s own duration (from its end time) as the 4th argument, excluding itself', async () => {
    const start = futureStart()
    selectQueue.push([
      { startTime: new Date('2026-06-01T14:00:00Z'), endTime: new Date('2026-06-01T15:00:00Z'), type: 'crown' },
    ])
    slotsForDayResult = { slots: [{ startIso: start.toISOString(), available: true }], closedReason: null }

    const r = await rescheduleAppointmentAction({
      appointmentId: 'appt_old',
      newStartTime: start.toISOString(),
      notifyPatient: false,
    })
    expect(r.ok).toBe(true)
    expect(slotCalls).toHaveLength(1)
    expect(slotCalls[0].exclude).toBe('appt_old')
    expect(slotCalls[0].duration).toBe(60)
    // The new row's end follows the same 60 minutes the guard checked.
    expect(rescheduled[0].newEndTime).toEqual(new Date(start.getTime() + 60 * 60_000))
    // notifyPatient=false → no notice.
    expect(notices).toHaveLength(0)
  })

  it('falls back to the type’s catalog length when the row has no end time', async () => {
    const start = futureStart()
    selectQueue.push([{ startTime: new Date('2026-06-01T14:00:00Z'), endTime: null, type: 'cleaning' }])
    selectQueue.push([{ visitTypeSettings: null }]) // defaults → cleaning = 30
    slotsForDayResult = { slots: [{ startIso: start.toISOString(), available: true }], closedReason: null }

    const r = await rescheduleAppointmentAction({ appointmentId: 'appt_old', newStartTime: start.toISOString(), notifyPatient: false })
    expect(r.ok).toBe(true)
    expect(slotCalls[0].duration).toBe(30)
    expect(rescheduled[0].newEndTime).toEqual(new Date(start.getTime() + 30 * 60_000))
  })

  it('refuses when the full length does not fit (the 4:30-before-a-5:00-close case)', async () => {
    const start = futureStart()
    selectQueue.push([
      { startTime: new Date('2026-06-01T14:00:00Z'), endTime: new Date('2026-06-01T15:00:00Z'), type: 'crown' },
    ])
    // The duration-aware grid says the start is NOT available for 60 minutes.
    slotsForDayResult = { slots: [{ startIso: start.toISOString(), available: false }], closedReason: null }

    const r = await rescheduleAppointmentAction({ appointmentId: 'appt_old', newStartTime: start.toISOString(), notifyPatient: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/conflicts/i)
    expect(rescheduled).toHaveLength(0)
    expect(notices).toHaveLength(0)
  })

  it('sends the Emails-hub rescheduled notice for the NEW row when asked to notify', async () => {
    const start = futureStart()
    selectQueue.push([
      { startTime: new Date('2026-06-01T14:00:00Z'), endTime: new Date('2026-06-01T14:30:00Z'), type: 'cleaning' },
    ])
    slotsForDayResult = { slots: [{ startIso: start.toISOString(), available: true }], closedReason: null }

    const r = await rescheduleAppointmentAction({ appointmentId: 'appt_old', newStartTime: start.toISOString(), notifyPatient: true })
    expect(r.ok).toBe(true)
    expect(notices).toEqual([{ org: 'org_1', id: 'appt_new' }])
  })

  it('answers "not found" for a row outside the clinic before consulting the grid', async () => {
    const start = futureStart()
    selectQueue.push([])
    const r = await rescheduleAppointmentAction({ appointmentId: 'appt_other_org', newStartTime: start.toISOString(), notifyPatient: false })
    expect(r.ok).toBe(false)
    expect(slotCalls).toHaveLength(0)
  })
})

describe('getBookingSlotsAction — the reschedule drawer’s grid', () => {
  it('excludes the moving visit and resolves its length from the row when none is passed', async () => {
    selectQueue.push([
      { startTime: new Date('2026-06-01T14:00:00Z'), endTime: new Date('2026-06-01T15:00:00Z'), type: 'crown' },
    ])
    await getBookingSlotsAction('2026-07-01', undefined, 'appt_old')
    expect(slotCalls).toEqual([{ org: 'org_1', date: '2026-07-01', exclude: 'appt_old', duration: 60 }])
  })

  it('an explicit duration wins; no exclusion without an id (the new-booking path is unchanged)', async () => {
    await getBookingSlotsAction('2026-07-01', 45)
    expect(slotCalls).toEqual([{ org: 'org_1', date: '2026-07-01', exclude: undefined, duration: 45 }])
  })
})
