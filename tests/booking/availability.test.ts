import { describe, it, expect, vi, beforeEach } from 'vitest'

interface HoursMap {
  [day: string]: { open?: string | null; close?: string | null; closed?: boolean }
}

const state: {
  hours: HoursMap | null
  appointments: Array<{ startTime: Date; endTime?: Date | null; status: string }>
} = { hours: null, appointments: [] }

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
                  ? [{ hours: state.hours }]
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

import { getAvailableSlots, isSlotAvailable, SLOT_MINUTES } from '@/lib/services/booking'

beforeEach(() => {
  state.hours = null
  state.appointments = []
  vi.useRealTimers()
})

const FUTURE = new Date('2099-06-15T00:00:00.000Z') // Monday 2099-06-15 — use far-future so no `now` filtering interferes

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
    const sunday = new Date('2099-06-14T12:00:00.000Z') // Sunday
    // Adjust to local Sunday in case of TZ shifts in test env
    sunday.setDate(sunday.getDate())
    while (sunday.getDay() !== 0) sunday.setDate(sunday.getDate() + 1)
    const slots = await getAvailableSlots('org_1', sunday)
    expect(slots).toEqual([])
  })

  it('returns no slots when hours record is missing entirely', async () => {
    state.hours = null
    const slots = await getAvailableSlots('org_1', FUTURE)
    expect(slots).toEqual([])
  })

  it('returns 30-min slots within the open window when no appointments are booked', async () => {
    setMon9to5()
    // Pick a Monday in 2099 so "now" filtering never applies.
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const slots = await getAvailableSlots('org_1', monday)
    // 9am to 5pm = 8 hours = 16 30-min slots
    expect(slots).toHaveLength(16)
    expect(slots[0].label).toMatch(/9:00 AM/)
    expect(slots[slots.length - 1].label).toMatch(/4:30 PM/)
    expect(slots.every((s) => s.available)).toBe(true)
  })

  it('marks slots taken when an appointment overlaps', async () => {
    setMon9to5()
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const tenAM = new Date(monday)
    tenAM.setHours(10, 0, 0, 0)
    state.appointments = [
      { startTime: tenAM, endTime: new Date(tenAM.getTime() + 30 * 60_000), status: 'scheduled' },
    ]
    const slots = await getAvailableSlots('org_1', monday)
    const tenAMSlot = slots.find((s) => s.label === '10:00 AM')
    expect(tenAMSlot?.available).toBe(false)
  })

  it('does NOT block a slot when the overlapping appointment is cancelled', async () => {
    setMon9to5()
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const tenAM = new Date(monday)
    tenAM.setHours(10, 0, 0, 0)
    state.appointments = [
      { startTime: tenAM, endTime: new Date(tenAM.getTime() + 30 * 60_000), status: 'cancelled' },
    ]
    const slots = await getAvailableSlots('org_1', monday)
    expect(slots.find((s) => s.label === '10:00 AM')?.available).toBe(true)
  })

  it('does NOT block a slot when the appointment was a no-show', async () => {
    setMon9to5()
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const tenAM = new Date(monday)
    tenAM.setHours(10, 0, 0, 0)
    state.appointments = [
      { startTime: tenAM, endTime: null, status: 'no_show' },
    ]
    const slots = await getAvailableSlots('org_1', monday)
    expect(slots.find((s) => s.label === '10:00 AM')?.available).toBe(true)
  })

  it('blocks every 30-min slot that overlaps a longer (60-min) appointment', async () => {
    setMon9to5()
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const tenAM = new Date(monday)
    tenAM.setHours(10, 0, 0, 0)
    state.appointments = [
      { startTime: tenAM, endTime: new Date(tenAM.getTime() + 60 * 60_000), status: 'scheduled' },
    ]
    const slots = await getAvailableSlots('org_1', monday)
    expect(slots.find((s) => s.label === '10:00 AM')?.available).toBe(false)
    expect(slots.find((s) => s.label === '10:30 AM')?.available).toBe(false)
    // 11:00 AM is free again
    expect(slots.find((s) => s.label === '11:00 AM')?.available).toBe(true)
  })

  it('filters slots in the past (slot start < now)', async () => {
    setMon9to5()
    // Make "now" be 2pm on the monday so anything before that drops
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const twoPM = new Date(monday)
    twoPM.setHours(14, 0, 0, 0)
    vi.useFakeTimers()
    vi.setSystemTime(twoPM)
    const slots = await getAvailableSlots('org_1', monday)
    // 9:00 AM → 1:30 PM should all be filtered. 2:00 PM onward remain.
    expect(slots.every((s) => !s.label.startsWith('9:00 AM'))).toBe(true)
    expect(slots[0].label).toMatch(/2:00 PM/)
  })
})

describe('isSlotAvailable', () => {
  it('returns true when the slot is in the open grid + free', async () => {
    setMon9to5()
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const target = new Date(monday)
    target.setHours(10, 0, 0, 0)
    expect(await isSlotAvailable('org_1', target)).toBe(true)
  })

  it('returns false when the slot is already taken', async () => {
    setMon9to5()
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const target = new Date(monday)
    target.setHours(10, 0, 0, 0)
    state.appointments = [
      { startTime: target, endTime: new Date(target.getTime() + 30 * 60_000), status: 'scheduled' },
    ]
    expect(await isSlotAvailable('org_1', target)).toBe(false)
  })

  it('returns false for a time outside the open window', async () => {
    setMon9to5()
    const monday = new Date(FUTURE)
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1)
    const target = new Date(monday)
    target.setHours(7, 0, 0, 0) // before 9am open
    expect(await isSlotAvailable('org_1', target)).toBe(false)
  })

  it('SLOT_MINUTES is 30 (sanity check for downstream callers)', () => {
    expect(SLOT_MINUTES).toBe(30)
  })
})
