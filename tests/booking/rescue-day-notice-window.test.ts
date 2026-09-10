import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The public booking form's rescue button must not be suppressed by a scan
 * that disagrees with the picker.
 *
 * `/book` runs `firstBookableDayInWindow` to find the first day with an
 * opening, and the form renders "See <day>'s openings →" only when that day
 * DIFFERS from the one on screen. The picker fetches its slots through
 * `listBookingSlots`, which applies the clinic's "Earliest online booking"
 * notice window (default 2h) — but the scan did not.
 *
 * So on a weekday afternoon, between the last slot still outside the notice
 * window and closing time, the scan counted today's already-too-soon slots and
 * named TODAY as the first bookable day. Scanned day == selected day, so the
 * rescue button stayed hidden — and the visitor read "We're done seeing
 * patients for today" with no way forward, on the product's top conversion
 * path. (Found by the E2E run on DREAMCRM-7, whose booking spec had to walk
 * the day strip by hand to work around it.)
 *
 * The clinic timezone is UTC here so wall-clock hours are absolute instants
 * regardless of the runner's own zone.
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

import { firstBookableDayInWindow, hasBookableSlotsInWindow } from '@/lib/services/booking'

/** Open 09:00–17:00 every weekday, closed at the weekend. */
const WEEKDAY_HOURS: HoursMap = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
  sat: { closed: true },
  sun: { closed: true },
}

// A Tuesday, so "tomorrow" is also a weekday the clinic is open.
const TUESDAY = '2026-06-16'
const WEDNESDAY = '2026-06-17'
/** 15:30 clinic time — inside opening hours, but under 2h before the 17:00 close. */
const AFTERNOON = new Date(`${TUESDAY}T15:30:00.000Z`)

beforeEach(() => {
  state.hours = WEEKDAY_HOURS
  state.timezone = 'UTC'
  state.appointments = []
  state.chairCount = 1
  vi.useFakeTimers()
  vi.setSystemTime(AFTERNOON)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the scan is the same day the patient can actually book', () => {
  it('sanity: the clock is a weekday afternoon and the clinic is open today', () => {
    expect(new Date(AFTERNOON).getUTCDay()).toBe(2) // Tuesday
    expect(new Date(`${WEDNESDAY}T09:00:00.000Z`).getUTCDay()).toBe(3)
  })

  it('skips today when the notice window puts every remaining slot out of reach', async () => {
    // 15:30 + 2h notice = 17:30, past the 17:00 close.
    const day = await firstBookableDayInWindow('org_1', TUESDAY, 14, undefined, 2)
    expect(day).toBe(WEDNESDAY)
  })

  it('so the rescue button gets a day to offer instead of pointing at today', async () => {
    const selectedDay = TUESDAY
    const scanned = await firstBookableDayInWindow('org_1', selectedDay, 14, undefined, 2)
    // The form renders the button only when these differ.
    expect(scanned).not.toBe(selectedDay)
    expect(scanned).toBeTruthy()
  })

  it('still offers today when the notice window leaves room', async () => {
    vi.setSystemTime(new Date(`${TUESDAY}T11:00:00.000Z`)) // 11:00 + 2h = 13:00, well before close
    expect(await firstBookableDayInWindow('org_1', TUESDAY, 14, undefined, 2)).toBe(TUESDAY)
  })

  it('honours a longer notice window the same way', async () => {
    vi.setSystemTime(new Date(`${TUESDAY}T11:00:00.000Z`))
    // A 24h window pushes past Tuesday's close entirely.
    expect(await firstBookableDayInWindow('org_1', TUESDAY, 14, undefined, 24)).toBe(WEDNESDAY)
  })

  it('leaves staff paths (no notice window) unchanged — today still counts', async () => {
    // The staff scheduler books inside the notice window deliberately; omitting
    // the argument must keep the old behaviour.
    expect(await firstBookableDayInWindow('org_1', TUESDAY, 14)).toBe(TUESDAY)
  })

  it('skips the weekend to the next open day', async () => {
    const friday = '2026-06-19'
    const monday = '2026-06-22'
    vi.setSystemTime(new Date(`${friday}T15:30:00.000Z`))
    expect(new Date(`${friday}T09:00:00.000Z`).getUTCDay()).toBe(5)
    expect(await firstBookableDayInWindow('org_1', friday, 14, undefined, 2)).toBe(monday)
  })

  it('hasBookableSlotsInWindow forwards the notice window too', async () => {
    // One open day only, and the notice window closes it.
    state.hours = { ...WEEKDAY_HOURS, wed: { closed: true }, thu: { closed: true }, fri: { closed: true } }
    expect(await hasBookableSlotsInWindow('org_1', TUESDAY, 3, undefined, 2)).toBe(false)
    // Same window, no notice rule → today's remaining slots still count.
    expect(await hasBookableSlotsInWindow('org_1', TUESDAY, 3)).toBe(true)
  })
})
