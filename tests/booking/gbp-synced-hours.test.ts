import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapGoogleHours } from '@/lib/services/gbp-sync'
import type { GoogleLocation } from '@/lib/zernio'

/**
 * Round-trip guard: hours mapped from a Google Business Profile (via
 * `mapGoogleHours`) MUST be consumable by the booking slot generator
 * (`getSlotsForDay`) UNCHANGED — a sync writes `clinic_profile.hours`, and
 * booking reads it the same way it reads a manually-edited value. If the mapped
 * shape ever drifts from what the booking grid expects, this test breaks.
 */

interface HoursMap {
  [day: string]: { open?: string | null; close?: string | null; closed?: boolean }
}
const state: { hours: HoursMap | null; timezone: string; appointments: unknown[] } = {
  hours: null,
  timezone: 'UTC',
  appointments: [],
}

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

import { getSlotsForDay, SLOT_MINUTES } from '@/lib/services/booking'

function dateKeyForWeekday(targetDow: number): string {
  const base = Date.UTC(2099, 5, 1)
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + i * 86_400_000)
    if (d.getUTCDay() === targetDow) return d.toISOString().slice(0, 10)
  }
  return '2099-06-01'
}
const MONDAY = dateKeyForWeekday(1)
const FRIDAY = dateKeyForWeekday(5)
const SATURDAY = dateKeyForWeekday(6)

const GOOGLE_LOC: GoogleLocation = {
  periods: [
    { day: 'mon', open: '09:00', close: '17:00' },
    { day: 'fri', open: '09:00', close: '15:00' },
  ],
  addressLines: ['1 Test St'],
  city: 'Testville',
  state: 'TX',
  postalCode: '00000',
  country: 'US',
  phone: '555-0000',
  categories: [],
}

beforeEach(() => {
  state.timezone = 'UTC'
  state.appointments = []
  vi.useRealTimers()
  // Write the EXACT shape a Google sync would persist into clinic_profile.hours.
  state.hours = mapGoogleHours(GOOGLE_LOC)
})

describe('getSlotsForDay consuming Google-synced hours', () => {
  it('generates a full grid for a Google-open weekday (Mon 09:00–17:00)', async () => {
    const { slots, closedReason } = await getSlotsForDay('org_1', MONDAY)
    expect(closedReason).toBeNull()
    // 09:00 → 17:00 = 8h = 16 thirty-minute slots.
    expect(slots).toHaveLength((8 * 60) / SLOT_MINUTES)
    expect(slots[0].startIso).toBe(`${MONDAY}T09:00:00.000Z`)
    expect(slots.every((s) => s.available)).toBe(true)
  })

  it('respects a Google short-day close (Fri 09:00–15:00 = 12 slots)', async () => {
    const { slots, closedReason } = await getSlotsForDay('org_1', FRIDAY)
    expect(closedReason).toBeNull()
    expect(slots).toHaveLength((6 * 60) / SLOT_MINUTES)
  })

  it('reads a day with no Google period as closed (null/null → day_closed)', async () => {
    const { slots, closedReason } = await getSlotsForDay('org_1', SATURDAY)
    expect(slots).toHaveLength(0)
    expect(closedReason).toBe('day_closed')
  })
})
