import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Chair-aware slot availability. A slot is only "taken" once the number of
 * overlapping (non-cancelled / non-no-show) appointments reaches the clinic's
 * chair count. chairCount null/1 preserves the original single-chair behavior.
 */

interface HoursMap {
  [day: string]: { open?: string | null; close?: string | null; closed?: boolean }
}

const state: {
  hours: HoursMap | null
  timezone: string
  chairCount: number | null
  appointments: Array<{ startTime: Date; endTime?: Date | null; status: string }>
} = { hours: null, timezone: 'UTC', chairCount: null, appointments: [] }

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { appointment } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      select: (cols?: Record<string, unknown>) => {
        // The hours/profile query selects a `hours` column; the appointment
        // query selects `startTime`. Disambiguate the same way the service does.
        const isProfileQuery = !!cols && Object.prototype.hasOwnProperty.call(cols, 'hours')
        return {
          from: (t: unknown) => ({
            where: () => ({
              limit: async () =>
                t === clinicProfile && isProfileQuery
                  ? [{ hours: state.hours, timezone: state.timezone, chairCount: state.chairCount }]
                  : t === appointment
                    ? state.appointments
                    : [],
              then: (resolve: (v: unknown) => void) => {
                if (t === appointment) resolve(state.appointments)
                else resolve([])
              },
            }),
          }),
        }
      },
    },
  }
})

import { getAvailableSlots, isSlotAvailable } from '@/lib/services/booking'

// A future Monday date-key (UTC math; service derives weekday in UTC here).
function mondayKey(): string {
  const base = Date.UTC(2099, 5, 1)
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + i * 86_400_000)
    if (d.getUTCDay() === 1) return d.toISOString().slice(0, 10)
  }
  return '2099-06-01'
}
const MONDAY = mondayKey()

function setHoursMon9to5() {
  state.hours = { mon: { open: '09:00', close: '17:00' } }
}

/** Build an appointment covering the 9:00–9:30 slot on MONDAY. */
function apptAt9(status = 'scheduled') {
  return {
    startTime: new Date(`${MONDAY}T09:00:00.000Z`),
    endTime: new Date(`${MONDAY}T09:30:00.000Z`),
    status,
  }
}

beforeEach(() => {
  state.hours = null
  state.timezone = 'UTC'
  state.chairCount = null
  state.appointments = []
  vi.useRealTimers()
})

function slotAvailable(slots: Awaited<ReturnType<typeof getAvailableSlots>>, iso: string): boolean | undefined {
  return slots.find((s) => s.startIso === iso)?.available
}

const SLOT_9 = `${MONDAY}T09:00:00.000Z`

describe('chair-aware availability', () => {
  it('single chair (null chairCount): one overlapping appt blocks the slot', async () => {
    setHoursMon9to5()
    state.chairCount = null // → treated as 1
    state.appointments = [apptAt9()]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slotAvailable(slots, SLOT_9)).toBe(false)
  })

  it('single chair (explicit 1): one overlapping appt blocks the slot', async () => {
    setHoursMon9to5()
    state.chairCount = 1
    state.appointments = [apptAt9()]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slotAvailable(slots, SLOT_9)).toBe(false)
  })

  it('3 chairs: 2 overlapping appts still leave the slot open', async () => {
    setHoursMon9to5()
    state.chairCount = 3
    state.appointments = [apptAt9(), apptAt9()]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slotAvailable(slots, SLOT_9)).toBe(true)
  })

  it('3 chairs: 3 overlapping appts fill the slot (blocked)', async () => {
    setHoursMon9to5()
    state.chairCount = 3
    state.appointments = [apptAt9(), apptAt9(), apptAt9()]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slotAvailable(slots, SLOT_9)).toBe(false)
  })

  it('3 chairs: a 4th booking attempt sees the slot as unavailable', async () => {
    setHoursMon9to5()
    state.chairCount = 3
    state.appointments = [apptAt9(), apptAt9(), apptAt9()]
    const ok = await isSlotAvailable('org_1', new Date(SLOT_9))
    expect(ok).toBe(false)
  })

  it('3 chairs: cancelled / no-show appts do NOT count toward the chair limit', async () => {
    setHoursMon9to5()
    state.chairCount = 3
    // 3 rows but 2 are cancelled/no-show → only 1 real overlap.
    state.appointments = [apptAt9('scheduled'), apptAt9('cancelled'), apptAt9('no_show')]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slotAvailable(slots, SLOT_9)).toBe(true)
  })

  it('duration spans multiple slots: a 60-min visit checks the whole window', async () => {
    setHoursMon9to5()
    state.chairCount = 1
    // Existing 9:30–10:00 appt. A 30-min booking at 9:00 is fine, but a 60-min
    // booking at 9:00 overlaps the 9:30 appt and is blocked (single chair).
    state.appointments = [
      { startTime: new Date(`${MONDAY}T09:30:00.000Z`), endTime: new Date(`${MONDAY}T10:00:00.000Z`), status: 'scheduled' },
    ]
    const at9_30min = await getAvailableSlots('org_1', MONDAY, undefined, 30)
    expect(slotAvailable(at9_30min, SLOT_9)).toBe(true)
    const at9_60min = await getAvailableSlots('org_1', MONDAY, undefined, 60)
    expect(slotAvailable(at9_60min, SLOT_9)).toBe(false)
  })

  it('chairCount is clamped to 1..20 (0 → 1, huge → 20)', async () => {
    setHoursMon9to5()
    state.chairCount = 0 // invalid → 1
    state.appointments = [apptAt9()]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slotAvailable(slots, SLOT_9)).toBe(false)
  })
})
