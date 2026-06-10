import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * bookMyVisitAction — the portal's booking write. Server-side gates under
 * test: tenant, the clinic's booking feature flag, the allowed-types
 * restriction (wrong-type self-booking is the documented schedule-buster),
 * min-notice window, slot race guard, and the guardian/dependent scope.
 */

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  organizationId: string
  patientId: string | null
  userName: string
  userEmail: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const settings = {
  features: { booking: true, reschedule: true, messages: true, family: true } as Record<string, boolean>,
  booking: { allowedTypes: ['cleaning', 'checkup', 'consultation'], minNoticeHours: 2 },
  reschedule: { minNoticeHours: 24 },
}
vi.mock('@/lib/services/portal-settings', () => ({
  getPortalSettings: vi.fn(async () => settings),
}))

const accessibleIds = ['pat_1', 'pat_kid']
vi.mock('@/lib/services/patient-portal', () => ({
  getAccessiblePatientIds: vi.fn(async () => accessibleIds),
  getVisitForPatients: vi.fn(async () => null),
  sendMessageFromPatient: vi.fn(),
}))

vi.mock('@/lib/services/appointments', () => ({
  confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}))

// Slot availability gates the insert (race-condition guard). Default: available.
const slotAvailableMock = vi.fn(async () => true)
vi.mock('@/lib/services/booking', () => ({
  isSlotAvailable: (...a: unknown[]) => slotAvailableMock(...(a as [])),
  getSlotsForDay: vi.fn(async () => ({ slots: [], closedReason: null })),
  SLOT_MINUTES: 30,
}))

vi.mock('@/lib/services/pms', () => ({ queueAppointmentWriteBack: vi.fn(async () => {}) }))
const sendBookingConfirmation = vi.fn(async () => {})
vi.mock('@/lib/services/booking-confirmation', () => ({
  sendBookingConfirmation: (...a: unknown[]) => sendBookingConfirmation(...(a as [])),
}))

const inserts: unknown[] = []

vi.mock('@/lib/db', async () => {
  const { appointment } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      insert: (table: unknown) => ({
        values: async (vals: unknown) => {
          if (table === appointment) inserts.push(vals)
        },
      }),
      // Patient-name lookup for the agenda title.
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ firstName: 'Jane', lastName: 'Doe' }],
          }),
        }),
      }),
    },
  }
})

import { bookMyVisitAction } from '@/app/(portal)/patient/actions'

beforeEach(() => {
  inserts.length = 0
  slotAvailableMock.mockReset()
  slotAvailableMock.mockResolvedValue(true)
  sendBookingConfirmation.mockClear()
  settings.features.booking = true
  settings.booking.allowedTypes = ['cleaning', 'checkup', 'consultation']
  settings.booking.minNoticeHours = 2
  tenantCtx = {
    tenantType: 'patient',
    organizationId: 'org_1',
    patientId: 'pat_1',
    userName: 'Jane Doe',
    userEmail: 'jane@example.com',
  }
})

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function future(ms = 86_400_000) {
  return new Date(Date.now() + ms).toISOString()
}

describe('bookMyVisitAction', () => {
  it('throws when not a patient tenant', async () => {
    tenantCtx = { tenantType: 'clinic', organizationId: 'org_1', patientId: null, userName: 'X', userEmail: 'x@x.com' }
    await expect(bookMyVisitAction(form({ startTime: future(), type: 'checkup' }))).rejects.toThrow(/patient/i)
  })

  it('rejects when the clinic toggled booking off', async () => {
    settings.features.booking = false
    const r = await bookMyVisitAction(form({ startTime: future(), type: 'checkup' }))
    expect(r.ok).toBe(false)
    expect(inserts).toHaveLength(0)
  })

  it('rejects a visit type the clinic does not allow online', async () => {
    const r = await bookMyVisitAction(form({ startTime: future(), type: 'root_canal' }))
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/can’t be booked online/i)
    expect(inserts).toHaveLength(0)
  })

  it('rejects a missing/malformed startTime', async () => {
    const r1 = await bookMyVisitAction(form({ type: 'checkup' }))
    expect(r1.ok).toBe(false)
    const r2 = await bookMyVisitAction(form({ type: 'checkup', startTime: 'garbage' }))
    expect(r2.ok).toBe(false)
    expect(inserts).toHaveLength(0)
  })

  it('rejects a slot inside the min-notice window', async () => {
    // minNoticeHours=2 → a slot 30 minutes out is too soon.
    const r = await bookMyVisitAction(form({ startTime: future(30 * 60_000), type: 'checkup' }))
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/too soon/i)
    expect(inserts).toHaveLength(0)
  })

  it('rejects when the slot was just taken (race guard)', async () => {
    slotAvailableMock.mockResolvedValue(false)
    const r = await bookMyVisitAction(form({ startTime: future(), type: 'checkup' }))
    expect(r).toMatchObject({ ok: false })
    expect(inserts).toHaveLength(0)
  })

  it('rejects booking for a patient outside the family scope', async () => {
    const r = await bookMyVisitAction(
      form({ startTime: future(), type: 'checkup', forPatientId: 'pat_stranger' }),
    )
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/family/i)
    expect(inserts).toHaveLength(0)
  })

  it('books for self on the happy path — org-scoped row, portal source, comfort note in notes', async () => {
    const r = await bookMyVisitAction(
      form({ startTime: future(), type: 'cleaning', notes: 'Sensitive teeth', comfort: 'Nervous about needles' }),
    )
    expect(r).toEqual({ ok: true })
    expect(inserts).toHaveLength(1)
    const vals = inserts[0] as {
      organizationId: string
      patientId: string
      type: string
      status: string
      notes: string | null
      title: string
      source: string
      startTime: Date
      endTime: Date
    }
    expect(vals.organizationId).toBe('org_1')
    expect(vals.patientId).toBe('pat_1')
    expect(vals.type).toBe('cleaning')
    expect(vals.status).toBe('scheduled')
    expect(vals.notes).toContain('Sensitive teeth')
    expect(vals.notes).toContain('Comfort note: Nervous about needles')
    expect(vals.title).toMatch(/Cleaning/)
    expect(vals.source).toBe('portal')
    expect(vals.endTime.getTime() - vals.startTime.getTime()).toBe(30 * 60 * 1000)
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'pat_1', appointmentType: 'cleaning' }),
    )
  })

  it('books for a linked dependent — the row carries the dependent patientId', async () => {
    const r = await bookMyVisitAction(
      form({ startTime: future(), type: 'cleaning', forPatientId: 'pat_kid' }),
    )
    expect(r).toEqual({ ok: true })
    const vals = inserts[0] as { patientId: string }
    expect(vals.patientId).toBe('pat_kid')
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'pat_kid' }),
    )
  })
})
