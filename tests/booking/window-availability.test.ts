import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for hasBookableSlotsInWindow — the window scan that drives the public
 * booking widget's prominent "call us" fallback when the ENTIRE bookable window
 * is closed/full (vs. a single empty day). The clinic timezone is UTC so the
 * wall-clock hours == absolute instants regardless of the runner's own zone.
 */

interface HoursMap {
  [day: string]: { open?: string | null; close?: string | null; closed?: boolean }
}

const state: {
  hours: HoursMap | null
  timezone: string
  appointments: Array<{ startTime: Date; endTime?: Date | null; status: string }>
  chairCount: number | null
} = { hours: null, timezone: 'UTC', appointments: [], chairCount: 1 }

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

import { hasBookableSlotsInWindow } from '@/lib/services/booking'

// A far-future window so "now" never filters out the early days.
const FUTURE_MONDAY = (() => {
  const base = Date.UTC(2099, 5, 1) // 2099-06-01
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + i * 86_400_000)
    if (d.getUTCDay() === 1) return d.toISOString().slice(0, 10)
  }
  return '2099-06-01'
})()

beforeEach(() => {
  state.hours = null
  state.timezone = 'UTC'
  state.appointments = []
  state.chairCount = 1
})

describe('hasBookableSlotsInWindow', () => {
  it('returns false when every day in the window is closed', async () => {
    state.hours = {
      sun: { closed: true },
      mon: { closed: true },
      tue: { closed: true },
      wed: { closed: true },
      thu: { closed: true },
      fri: { closed: true },
      sat: { closed: true },
    }
    expect(await hasBookableSlotsInWindow('org_1', FUTURE_MONDAY, 14)).toBe(false)
  })

  it('returns true when at least one day in the window has an opening', async () => {
    // Only Wednesday is open — the scan should find it within the 14-day window.
    state.hours = { wed: { open: '09:00', close: '17:00' } }
    expect(await hasBookableSlotsInWindow('org_1', FUTURE_MONDAY, 14)).toBe(true)
  })

  it('returns false when open days are fully booked (single chair)', async () => {
    state.hours = { mon: { open: '09:00', close: '10:00' } } // two 30-min slots
    state.chairCount = 1
    // Block the whole Monday window across the next two weeks. Easiest: an
    // all-day appointment on each Monday in range. We approximate by blocking a
    // wide span around each candidate Monday — but since only Mondays are open,
    // booking 09:00–10:00 on the two Mondays in the window fills them.
    const m1 = new Date(`${FUTURE_MONDAY}T09:00:00.000Z`)
    const m2 = new Date(m1.getTime() + 7 * 86_400_000)
    state.appointments = [
      { startTime: m1, endTime: new Date(m1.getTime() + 60 * 60_000), status: 'scheduled' },
      { startTime: m2, endTime: new Date(m2.getTime() + 60 * 60_000), status: 'scheduled' },
    ]
    expect(await hasBookableSlotsInWindow('org_1', FUTURE_MONDAY, 14)).toBe(false)
  })

  it('respects a multi-chair clinic — a booked slot with a free chair is still bookable', async () => {
    state.hours = { mon: { open: '09:00', close: '10:00' } }
    state.chairCount = 2
    const m1 = new Date(`${FUTURE_MONDAY}T09:00:00.000Z`)
    // One appointment fills 1 of 2 chairs → still bookable.
    state.appointments = [
      { startTime: m1, endTime: new Date(m1.getTime() + 60 * 60_000), status: 'scheduled' },
    ]
    expect(await hasBookableSlotsInWindow('org_1', FUTURE_MONDAY, 14)).toBe(true)
  })

  it('returns false for a malformed date key', async () => {
    state.hours = { mon: { open: '09:00', close: '17:00' } }
    expect(await hasBookableSlotsInWindow('org_1', 'not-a-date', 14)).toBe(false)
  })
})
