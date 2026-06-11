import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * createInternalAppointmentAction — the front-desk booking action. Covers the
 * walk-in bypass (skips future-time + slot guards) and the normal path's
 * duration-aware slot check.
 */

let tenantCtx: { tenantType: string; role: string; organizationId: string } | null = null
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Track slot-grid calls so we can assert the walk-in path never consults it.
const slotCalls: Array<{ org: string; date: unknown; duration?: number }> = []
let slotsForDayResult: { slots: Array<{ startIso: string; available: boolean }>; closedReason: string | null } = {
  slots: [],
  closedReason: null,
}
vi.mock('@/lib/services/booking', () => ({
  getSlotsForDay: vi.fn(async (org: string, date: unknown, _ex: unknown, duration?: number) => {
    slotCalls.push({ org, date, duration })
    return slotsForDayResult
  }),
}))

const created: Array<Record<string, unknown>> = []
vi.mock('@/lib/services/appointments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/appointments')>('@/lib/services/appointments')
  return {
    ...actual,
    createInternalAppointment: vi.fn(async (input: Record<string, unknown>) => {
      created.push(input)
      return 'appt_new'
    }),
    getAppointmentDetail: vi.fn(async () => null),
  }
})

let confirmationSends = 0
vi.mock('@/lib/services/booking-confirmation', () => ({
  sendBookingConfirmation: vi.fn(async () => {
    confirmationSends += 1
  }),
}))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))

// Visit-type settings db read inside the action → return null (defaults).
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ visitTypeSettings: null }] }) }) }),
  },
}))
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: 'clinic_profile' }))
vi.mock('@/lib/services/providers', () => ({ listProviders: vi.fn(async () => []) }))

import { createInternalAppointmentAction } from '@/app/(default)/appointments/actions'

beforeEach(() => {
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1' }
  slotCalls.length = 0
  created.length = 0
  confirmationSends = 0
  slotsForDayResult = { slots: [], closedReason: null }
})

describe('createInternalAppointmentAction — walk-in bypass', () => {
  it('walk-in skips the slot grid + future-time guard and allows a past time', async () => {
    const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1h ago
    const r = await createInternalAppointmentAction({
      patientId: 'pat_1',
      startTime: pastTime,
      type: 'cleaning',
      allowPast: true,
    })
    expect(r.ok).toBe(true)
    // Never consulted the slot grid.
    expect(slotCalls).toHaveLength(0)
    // Created with the past start time (recording reality).
    expect(created).toHaveLength(1)
    // Walk-ins don't fire the "you're booked" confirmation email.
    expect(confirmationSends).toBe(0)
  })

  it('non-walk-in rejects a past time before touching the slot grid', async () => {
    const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const r = await createInternalAppointmentAction({ patientId: 'pat_1', startTime: pastTime, type: 'cleaning' })
    expect(r.ok).toBe(false)
    expect(created).toHaveLength(0)
  })

  it('non-walk-in consults the slot grid with the resolved duration and books when available', async () => {
    const future = new Date(Date.now() + 3 * 86_400_000)
    future.setUTCHours(15, 0, 0, 0)
    const iso = future.toISOString()
    slotsForDayResult = { slots: [{ startIso: iso, available: true }], closedReason: null }
    const r = await createInternalAppointmentAction({ patientId: 'pat_1', startTime: iso, type: 'cleaning' })
    expect(r.ok).toBe(true)
    expect(slotCalls).toHaveLength(1)
    // cleaning resolves to the 30-min default duration.
    expect(slotCalls[0].duration).toBe(30)
    expect(confirmationSends).toBe(1)
  })

  it('non-walk-in returns a chair-conflict error when the slot is full', async () => {
    const future = new Date(Date.now() + 3 * 86_400_000)
    future.setUTCHours(15, 0, 0, 0)
    const iso = future.toISOString()
    slotsForDayResult = { slots: [{ startIso: iso, available: false }], closedReason: null }
    const r = await createInternalAppointmentAction({ patientId: 'pat_1', startTime: iso, type: 'cleaning' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/chair|booked|available/i)
  })

  it('rejects a non-clinic tenant', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'org_p' }
    await expect(
      createInternalAppointmentAction({ patientId: 'pat_1', startTime: new Date(Date.now() + 86_400_000).toISOString() }),
    ).rejects.toThrow(/clinic/i)
  })
})
