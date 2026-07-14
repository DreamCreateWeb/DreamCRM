import { describe, it, expect, vi, beforeEach } from 'vitest'

interface HoursMap {
  [day: string]: { open?: string | null; close?: string | null; closed?: boolean }
}

// The clinic timezone drives the grid. Most tests run with `UTC` so the
// wall-clock hours == the absolute instants (deterministic regardless of the
// test runner's own zone); a dedicated test exercises a real non-UTC zone.
const state: {
  hours: HoursMap | null
  timezone: string
  appointments: Array<{ startTime: Date; endTime?: Date | null; status: string }>
} = { hours: null, timezone: 'UTC', appointments: [] }

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { appointment } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      select: (cols?: Record<string, unknown>) => {
        const isHoursQuery = !!cols && Object.prototype.hasOwnProperty.call(cols, 'hours')
        return {
          from: (t: unknown) => ({
            where: () => ({
              limit: async () =>
                t === clinicProfile && isHoursQuery
                  ? [{ hours: state.hours, timezone: state.timezone }]
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

import { getAvailableSlots, getSlotsForDay, isSlotAvailable, SLOT_MINUTES } from '@/lib/services/booking'

// A future date string with the given weekday (0=Sun…6=Sat). Computed with UTC
// math so it matches the service's day-of-week derivation regardless of TZ.
function dateKeyForWeekday(targetDow: number): string {
  const base = Date.UTC(2099, 5, 1) // 2099-06-01
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + i * 86_400_000)
    if (d.getUTCDay() === targetDow) return d.toISOString().slice(0, 10)
  }
  return '2099-06-01'
}
const MONDAY = dateKeyForWeekday(1)
const SUNDAY = dateKeyForWeekday(0)

beforeEach(() => {
  state.hours = null
  state.timezone = 'UTC'
  state.appointments = []
  vi.useRealTimers()
})

function setMon9to5() {
  state.hours = {
    mon: { open: '09:00', close: '17:00' },
    tue: { open: '09:00', close: '17:00' },
    sun: { closed: true },
  }
}

describe('getAvailableSlots', () => {
  it('returns no slots when the day is closed', async () => {
    setMon9to5()
    expect(await getAvailableSlots('org_1', SUNDAY)).toEqual([])
  })

  it('returns no slots when hours record is missing entirely', async () => {
    state.hours = null
    expect(await getAvailableSlots('org_1', MONDAY)).toEqual([])
  })

  it('returns 30-min slots within the open window when no appointments are booked', async () => {
    setMon9to5()
    const slots = await getAvailableSlots('org_1', MONDAY)
    // 9am to 5pm = 8 hours = 16 30-min slots
    expect(slots).toHaveLength(16)
    expect(slots[0].label).toMatch(/9:00\s?AM/)
    expect(slots[slots.length - 1].label).toMatch(/4:30\s?PM/)
    expect(slots.every((s) => s.available)).toBe(true)
    // First slot is the absolute instant for 09:00 in the clinic zone (UTC here).
    expect(slots[0].startIso).toBe(`${MONDAY}T09:00:00.000Z`)
  })

  it('marks slots taken when an appointment overlaps', async () => {
    setMon9to5()
    state.appointments = [
      { startTime: new Date(`${MONDAY}T10:00:00Z`), endTime: new Date(`${MONDAY}T10:30:00Z`), status: 'scheduled' },
    ]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slots.find((s) => s.startIso === `${MONDAY}T10:00:00.000Z`)?.available).toBe(false)
  })

  it('does NOT block a slot when the overlapping appointment is cancelled', async () => {
    setMon9to5()
    state.appointments = [
      { startTime: new Date(`${MONDAY}T10:00:00Z`), endTime: new Date(`${MONDAY}T10:30:00Z`), status: 'cancelled' },
    ]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slots.find((s) => s.startIso === `${MONDAY}T10:00:00.000Z`)?.available).toBe(true)
  })

  it('does NOT block a slot when the appointment was a no-show', async () => {
    setMon9to5()
    state.appointments = [{ startTime: new Date(`${MONDAY}T10:00:00Z`), endTime: null, status: 'no_show' }]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slots.find((s) => s.startIso === `${MONDAY}T10:00:00.000Z`)?.available).toBe(true)
  })

  it('blocks every 30-min slot that overlaps a longer (60-min) appointment', async () => {
    setMon9to5()
    state.appointments = [
      { startTime: new Date(`${MONDAY}T10:00:00Z`), endTime: new Date(`${MONDAY}T11:00:00Z`), status: 'scheduled' },
    ]
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slots.find((s) => s.startIso === `${MONDAY}T10:00:00.000Z`)?.available).toBe(false)
    expect(slots.find((s) => s.startIso === `${MONDAY}T10:30:00.000Z`)?.available).toBe(false)
    expect(slots.find((s) => s.startIso === `${MONDAY}T11:00:00.000Z`)?.available).toBe(true)
  })

  it('filters slots in the past (slot start < now)', async () => {
    setMon9to5()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${MONDAY}T14:00:00Z`)) // 2pm UTC
    const slots = await getAvailableSlots('org_1', MONDAY)
    // 9:00 AM → 1:30 PM filtered; 2:00 PM onward remain.
    expect(slots.every((s) => new Date(s.startIso).getTime() >= Date.parse(`${MONDAY}T14:00:00Z`))).toBe(true)
    expect(slots[0].startIso).toBe(`${MONDAY}T14:00:00.000Z`)
  })
})

describe('timezone-aware grid (non-UTC clinic)', () => {
  it('generates the open window at the clinic wall-clock, not the server (UTC)', async () => {
    // Clinic open 9–5 Eastern. In June that's EDT (UTC-4), so 9:00 AM ET is
    // 13:00 UTC — NOT 09:00 UTC. This is the bug the timezone fix closes.
    state.timezone = 'America/New_York'
    state.hours = { mon: { open: '09:00', close: '17:00' } }
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slots).toHaveLength(16)
    expect(slots[0].startIso).toBe(`${MONDAY}T13:00:00.000Z`) // 9 AM EDT
    expect(slots[0].label).toMatch(/9:00\s?AM/) // labelled in the clinic zone
    expect(slots[slots.length - 1].startIso).toBe(`${MONDAY}T20:30:00.000Z`) // 4:30 PM EDT
  })

  it('resolves a Date input to the clinic-local calendar day', async () => {
    // 03:00 UTC on Tuesday is still MONDAY night in Eastern → must use Monday's hours.
    state.timezone = 'America/New_York'
    state.hours = { mon: { open: '09:00', close: '17:00' }, tue: { closed: true } }
    const tuesday0300Z = new Date(`${dateKeyForWeekday(2)}T03:00:00Z`)
    const slots = await getAvailableSlots('org_1', tuesday0300Z)
    expect(slots.length).toBeGreaterThan(0) // Monday is open, not Tuesday's closed
    expect(slots[0].startIso).toBe(`${MONDAY}T13:00:00.000Z`)
  })
})

describe('isSlotAvailable', () => {
  it('returns true when the slot is in the open grid + free', async () => {
    setMon9to5()
    expect(await isSlotAvailable('org_1', new Date(`${MONDAY}T10:00:00Z`))).toBe(true)
  })

  it('returns false when the slot is already taken', async () => {
    setMon9to5()
    const target = new Date(`${MONDAY}T10:00:00Z`)
    state.appointments = [{ startTime: target, endTime: new Date(`${MONDAY}T10:30:00Z`), status: 'scheduled' }]
    expect(await isSlotAvailable('org_1', target)).toBe(false)
  })

  it('returns false for a time outside the open window', async () => {
    setMon9to5()
    expect(await isSlotAvailable('org_1', new Date(`${MONDAY}T07:00:00Z`))).toBe(false) // before 9am
  })

  it('SLOT_MINUTES is 30 (sanity check for downstream callers)', () => {
    expect(SLOT_MINUTES).toBe(30)
  })
})

describe('getSlotsForDay (rich empty-state reasons)', () => {
  it('reports closedReason="day_closed" on a day with hours.closed=true', async () => {
    setMon9to5()
    const result = await getSlotsForDay('org_1', SUNDAY)
    expect(result.slots).toEqual([])
    expect(result.closedReason).toBe('day_closed')
  })

  it('reports closedReason="day_closed" when hours has no entry for that day', async () => {
    state.hours = { mon: { open: '09:00', close: '17:00' } }
    const result = await getSlotsForDay('org_1', dateKeyForWeekday(2)) // Tuesday — no entry
    expect(result.slots).toEqual([])
    expect(result.closedReason).toBe('day_closed')
  })

  it('reports closedReason="past_closing" when clinic was open today but all slots are past', async () => {
    setMon9to5()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${MONDAY}T18:30:00Z`)) // after the 17:00 close
    const result = await getSlotsForDay('org_1', MONDAY)
    expect(result.slots).toEqual([])
    expect(result.closedReason).toBe('past_closing')
  })

  it('reports closedReason=null when slots are non-empty', async () => {
    setMon9to5()
    const result = await getSlotsForDay('org_1', MONDAY)
    expect(result.slots.length).toBeGreaterThan(0)
    expect(result.closedReason).toBeNull()
  })

  it('reports closedReason="invalid_hours" on malformed hour strings', async () => {
    state.hours = { mon: { open: 'not-a-time', close: '17:00' } }
    const result = await getSlotsForDay('org_1', MONDAY)
    expect(result.slots).toEqual([])
    expect(result.closedReason).toBe('invalid_hours')
  })
})

describe('getAvailableSlots back-compat wrapper', () => {
  it('returns the same slot array that getSlotsForDay returns', async () => {
    setMon9to5()
    const wrapper = await getAvailableSlots('org_1', MONDAY)
    const rich = await getSlotsForDay('org_1', MONDAY)
    expect(wrapper).toEqual(rich.slots)
  })
})

describe('patient-facing notice window (minNoticeHours)', () => {
  // Pin "now" to 08:00 on the Monday being queried so the window math is
  // deterministic: with 9–5 hours, no notice leaves 9:00 first; a 4h notice
  // (cutoff 12:00) makes 12:00 the first bookable start.
  function pinMondayMorning() {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${MONDAY}T08:00:00.000Z`))
  }

  it('filters slots inside now+N hours when minNoticeHours is passed', async () => {
    setMon9to5()
    pinMondayMorning()
    const slots = await getAvailableSlots('org_1', MONDAY, undefined, undefined, 4)
    expect(slots[0]?.startIso).toBe(`${MONDAY}T12:00:00.000Z`)
    vi.useRealTimers()
  })

  it('omitting the param keeps the staff behavior (walk-ins bookable now)', async () => {
    setMon9to5()
    pinMondayMorning()
    const slots = await getAvailableSlots('org_1', MONDAY)
    expect(slots[0]?.startIso).toBe(`${MONDAY}T09:00:00.000Z`)
    vi.useRealTimers()
  })

  it('zero / junk notice values behave like no window', async () => {
    setMon9to5()
    pinMondayMorning()
    const zero = await getAvailableSlots('org_1', MONDAY, undefined, undefined, 0)
    const nan = await getAvailableSlots('org_1', MONDAY, undefined, undefined, Number.NaN)
    expect(zero[0]?.startIso).toBe(`${MONDAY}T09:00:00.000Z`)
    expect(nan[0]?.startIso).toBe(`${MONDAY}T09:00:00.000Z`)
    vi.useRealTimers()
  })

  it('isSlotAvailable rejects a too-soon slot only when the window is passed', async () => {
    setMon9to5()
    pinMondayMorning()
    const nineAm = new Date(`${MONDAY}T09:00:00.000Z`)
    expect(await isSlotAvailable('org_1', nineAm)).toBe(true)
    expect(await isSlotAvailable('org_1', nineAm, undefined, undefined, 4)).toBe(false)
    vi.useRealTimers()
  })
})
