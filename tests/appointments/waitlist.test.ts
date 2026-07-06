import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Fast-pass waitlist mechanics:
 *  - addToWaitlist: one ACTIVE entry per patient (second add updates), tenant-scoped
 *  - offerFreedSlot: min-notice guard, demo-org short-circuit, earlier-only +
 *    has-email candidate filter, offer rows + emails out
 *  - claimOffer: first-click-wins through the advisory-lock insert, idempotent
 *    re-click, expiry, sibling offers flip to lost, old linked visit released
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: unknown; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.orderBy = async () => state.selectQueue.shift() ?? []
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ table, values })
        },
      }),
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table, set })
          },
        }),
      }),
    },
    schema: {
      appointmentWaitlist: {
        _name: 'appointment_waitlist',
        id: 'id', organizationId: 'org', patientId: 'patientId', appointmentId: 'appointmentId',
        visitType: 'visitType', providerId: 'providerId', status: 'status', source: 'source',
        createdAt: 'createdAt', fulfilledAt: 'fulfilledAt',
      },
      appointmentWaitlistOffer: {
        _name: 'appointment_waitlist_offer',
        id: 'id', organizationId: 'org', waitlistId: 'waitlistId', patientId: 'patientId',
        slotStart: 'slotStart', slotEnd: 'slotEnd', providerId: 'providerId', visitType: 'visitType',
        freedByAppointmentId: 'freedByAppointmentId', token: 'token', status: 'status', sentAt: 'sentAt',
      },
      appointment: {
        _name: 'appointment',
        id: 'id', organizationId: 'org', patientId: 'patientId', providerId: 'providerId',
        startTime: 'startTime', endTime: 'endTime', type: 'type', status: 'status',
      },
      patient: { _name: 'patient', id: 'id', organizationId: 'org', firstName: 'firstName', lastName: 'lastName', email: 'email' },
      clinicProvider: { _name: 'clinic_provider', id: 'id', displayName: 'displayName' },
      clinicProfile: { _name: 'clinic_profile', organizationId: 'org', displayName: 'displayName', brandColor: 'brandColor', logoUrl: 'logoUrl', phone: 'phone', timezone: 'timezone' },
      organization: { _name: 'organization', id: 'id', slug: 'slug', name: 'name', isDemo: 'isDemo' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  or: vi.fn(() => ({ _: 'or' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  gt: vi.fn(() => ({ _: 'gt' })),
  asc: vi.fn((x) => x),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
}))

const { deliverMock } = vi.hoisted(() => ({ deliverMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  authEmailShell: vi.fn(() => '<html>offer</html>'),
}))

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Dream Dental <acme-dental-demo@dreamcreatestudio.com>',
    replyTo: 'front@dreamdental.com',
    name: 'Dream Dental',
    timeZone: 'America/Chicago',
    gmail: null,
  })),
}))

const { insertIfFreeMock } = vi.hoisted(() => ({ insertIfFreeMock: vi.fn(async () => true) }))
vi.mock('@/lib/services/booking', () => ({ insertAppointmentIfSlotFree: insertIfFreeMock }))

const { queueStatusMock, queueCommLogMock, queueWriteBackMock } = vi.hoisted(() => ({
  queueStatusMock: vi.fn(async () => undefined),
  queueCommLogMock: vi.fn(async () => undefined),
  queueWriteBackMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/pms', () => ({
  queueAppointmentStatusWriteBack: queueStatusMock,
  queueCommLogWriteBack: queueCommLogMock,
  queueAppointmentWriteBack: queueWriteBackMock,
}))

const { sendBookingConfirmationMock } = vi.hoisted(() => ({
  sendBookingConfirmationMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/booking-confirmation', () => ({ sendBookingConfirmation: sendBookingConfirmationMock }))

const { notifyOrgMembersMock } = vi.hoisted(() => ({ notifyOrgMembersMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyOrgMembersMock }))

import {
  addToWaitlist,
  offerFreedSlot,
  claimOffer,
} from '@/lib/services/appointment-waitlist'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
  insertIfFreeMock.mockResolvedValue(true)
})

function insertsInto(name: string) {
  return state.inserts.filter((i) => (i.table as { _name: string })._name === name)
}
function updatesOf(name: string) {
  return state.updates.filter((u) => (u.table as { _name: string })._name === name)
}

describe('addToWaitlist', () => {
  it('creates a new active entry for an org patient', async () => {
    state.selectQueue.push([{ id: 'pat_1' }]) // tenant-scoped patient check
    state.selectQueue.push([]) // no existing active entry
    const r = await addToWaitlist('org_1', { patientId: 'pat_1', visitType: 'cleaning' })
    expect(r.updated).toBe(false)
    const rows = insertsInto('appointment_waitlist')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.values).toMatchObject({ organizationId: 'org_1', patientId: 'pat_1', visitType: 'cleaning' })
  })

  it('updates the existing active entry instead of stacking a duplicate', async () => {
    state.selectQueue.push([{ id: 'pat_1' }])
    state.selectQueue.push([{ id: 'wait_1' }]) // existing active entry
    const r = await addToWaitlist('org_1', { patientId: 'pat_1', visitType: 'checkup', appointmentId: 'appt_9' })
    expect(r).toEqual({ id: 'wait_1', updated: true })
    expect(insertsInto('appointment_waitlist')).toHaveLength(0)
    expect(updatesOf('appointment_waitlist')[0]!.set).toMatchObject({ visitType: 'checkup', appointmentId: 'appt_9' })
  })

  it('rejects a patient outside the org (tenant scoping)', async () => {
    state.selectQueue.push([]) // patient lookup misses
    await expect(addToWaitlist('org_1', { patientId: 'pat_other_org' })).rejects.toThrow('Patient not found')
  })
})

describe('offerFreedSlot', () => {
  const slot = (startInMs: number) => ({
    start: new Date(Date.now() + startInMs),
    end: new Date(Date.now() + startInMs + 45 * 60 * 1000),
    providerId: 'prov_1',
    visitType: 'cleaning',
    freedByAppointmentId: 'appt_freed',
    excludePatientId: 'pat_cancelling',
  })

  it('skips slots inside the 2-hour notice window (nobody can make it)', async () => {
    const sent = await offerFreedSlot('org_1', slot(1 * HOUR))
    expect(sent).toBe(0)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(state.inserts).toHaveLength(0)
  })

  it('never offers/emails in the demo org', async () => {
    state.selectQueue.push([{ isDemo: true }]) // org lookup
    const sent = await offerFreedSlot('org_demo', slot(2 * DAY))
    expect(sent).toBe(0)
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('offers only to earlier-than-linked-visit candidates with an email', async () => {
    state.selectQueue.push([{ isDemo: false }]) // org lookup
    // entries query (orderBy-terminated)
    state.selectQueue.push([
      // eligible: linked visit LATER than the slot
      { id: 'wl_1', patientId: 'pat_1', appointmentId: 'appt_1', firstName: 'Mia', email: 'mia@example.com', currentVisitAt: new Date(Date.now() + 10 * DAY) },
      // ineligible: linked visit is already EARLIER than the slot
      { id: 'wl_2', patientId: 'pat_2', appointmentId: 'appt_2', firstName: 'Noah', email: 'noah@example.com', currentVisitAt: new Date(Date.now() + 1 * DAY) },
      // ineligible: no email on file (email is the only channel today)
      { id: 'wl_3', patientId: 'pat_3', appointmentId: null, firstName: 'Ava', email: null, currentVisitAt: null },
      // eligible: no linked visit (wants any opening)
      { id: 'wl_4', patientId: 'pat_4', appointmentId: null, firstName: 'Liam', email: 'liam@example.com', currentVisitAt: null },
    ])
    const sent = await offerFreedSlot('org_1', slot(2 * DAY))
    expect(sent).toBe(2)
    expect(deliverMock).toHaveBeenCalledTimes(2)
    const offers = insertsInto('appointment_waitlist_offer')
    expect(offers).toHaveLength(2)
    expect(offers.map((o) => o.values.waitlistId)).toEqual(['wl_1', 'wl_4'])
    // Token is the auth for /w/[token] — must carry the wo_ prefix.
    for (const o of offers) expect(String(o.values.token)).toMatch(/^wo_/)
  })

  it('still counts the offer row when a single email fails (best-effort)', async () => {
    state.selectQueue.push([{ isDemo: false }])
    state.selectQueue.push([
      { id: 'wl_1', patientId: 'pat_1', appointmentId: null, firstName: 'Mia', email: 'mia@example.com', currentVisitAt: null },
    ])
    deliverMock.mockRejectedValueOnce(new Error('smtp boom'))
    const sent = await offerFreedSlot('org_1', slot(2 * DAY))
    expect(sent).toBe(0) // nothing SENT…
    expect(insertsInto('appointment_waitlist_offer')).toHaveLength(1) // …but the offer row exists
  })
})

describe('claimOffer', () => {
  const FUTURE_SLOT = new Date(Date.now() + 2 * DAY)

  const pendingOffer = (over: Record<string, unknown> = {}) => ({
    id: 'off_1',
    organizationId: 'org_1',
    waitlistId: 'wl_1',
    patientId: 'pat_1',
    slotStart: FUTURE_SLOT,
    slotEnd: new Date(FUTURE_SLOT.getTime() + 45 * 60 * 1000),
    providerId: 'prov_1',
    visitType: 'cleaning',
    freedByAppointmentId: 'appt_freed',
    token: 'wo_tok',
    status: 'pending',
    ...over,
  })

  it('404s an unknown token', async () => {
    state.selectQueue.push([]) // token lookup misses
    expect(await claimOffer('wo_nope')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('is idempotent on re-click of an already-claimed offer', async () => {
    state.selectQueue.push([pendingOffer({ status: 'claimed' })])
    expect(await claimOffer('wo_tok')).toEqual({ ok: true })
    expect(insertIfFreeMock).not.toHaveBeenCalled()
  })

  it('reports lost when a sibling already won', async () => {
    state.selectQueue.push([pendingOffer({ status: 'lost' })])
    expect(await claimOffer('wo_tok')).toEqual({ ok: false, reason: 'taken' })
  })

  it('expires a pending offer whose slot already started', async () => {
    state.selectQueue.push([pendingOffer({ slotStart: new Date(Date.now() - HOUR) })])
    expect(await claimOffer('wo_tok')).toEqual({ ok: false, reason: 'expired' })
    expect(updatesOf('appointment_waitlist_offer')[0]!.set).toMatchObject({ status: 'expired' })
  })

  it('loses the race when the slot was rebooked out from under the offer', async () => {
    state.selectQueue.push([pendingOffer()])
    state.selectQueue.push([{ id: 'wl_1', appointmentId: null }]) // entry
    insertIfFreeMock.mockResolvedValueOnce(false) // advisory-lock insert says taken
    expect(await claimOffer('wo_tok')).toEqual({ ok: false, reason: 'taken' })
    expect(updatesOf('appointment_waitlist_offer')[0]!.set).toMatchObject({ status: 'lost' })
  })

  it('books confirmed, fulfills the entry, flips siblings to lost, releases the old visit', async () => {
    state.selectQueue.push([pendingOffer()])
    state.selectQueue.push([{ id: 'wl_1', appointmentId: 'appt_old' }]) // entry w/ linked visit
    // old appt lookup — starts <2h out so the follow-on offerFreedSlot no-ops
    // deterministically inside this test.
    state.selectQueue.push([
      { startTime: new Date(Date.now() + HOUR), endTime: null, providerId: 'prov_1', type: 'cleaning', status: 'confirmed' },
    ])
    state.selectQueue.push([{ firstName: 'Mia', lastName: 'Hayes' }]) // staff-notify patient lookup

    expect(await claimOffer('wo_tok')).toEqual({ ok: true })

    // Booked through the race-guarded insert, already confirmed (the click IS the confirmation).
    expect(insertIfFreeMock).toHaveBeenCalledTimes(1)
    const inserted = (insertIfFreeMock.mock.calls[0] as unknown[])[3] as Record<string, unknown>
    expect(inserted).toMatchObject({
      patientId: 'pat_1',
      status: 'confirmed',
      confirmedVia: 'email',
      source: 'waitlist',
      rescheduledFromAppointmentId: 'appt_old',
    })

    const offerUpdates = updatesOf('appointment_waitlist_offer').map((u) => u.set.status)
    expect(offerUpdates).toContain('claimed')
    expect(offerUpdates).toContain('lost') // siblings for the same freed slot
    expect(updatesOf('appointment_waitlist')[0]!.set).toMatchObject({ status: 'fulfilled' })

    // Old linked visit released + PMS told; patient + staff informed.
    expect(updatesOf('appointment')[0]!.set).toMatchObject({ status: 'cancelled' })
    expect(queueStatusMock).toHaveBeenCalledWith('org_1', 'appt_old', 'cancelled')
    expect(queueWriteBackMock).toHaveBeenCalled()
    expect(sendBookingConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', patientId: 'pat_1' }),
    )
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({ type: 'waitlist_claimed', title: expect.stringContaining('Mia Hayes') }),
      { roles: ['owner', 'admin'], excludeEmail: null },
    )
    expect(queueCommLogMock).toHaveBeenCalled()
  })
})
