import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE EMPTY CHAIR (Phase 5, limb 2), service half.
 *
 * Pins the three things the pure module cannot see:
 *  - the window is read through the SINGLE home for what counts as an
 *    opening (getSlotsForDay), by clinic-local calendar day;
 *  - a day the clinic is CLOSED is left out, not reported as 100% open — a
 *    Sunday with no hours is a day off, and counting it would make every
 *    practice in the country look like it was failing every week;
 *  - a failed read says NOTHING. A schedule the machine could not see must
 *    never be reported as an empty one.
 */

const booking = vi.hoisted(() => ({
  /** dateKey → available/total, or null for "clinic closed". */
  byDay: new Map<string, { open: number; total: number } | null>(),
  throwOn: null as string | null,
  seen: [] as string[],
}))

vi.mock('@/lib/services/booking', () => ({
  getSlotsForDay: vi.fn(async (_org: string, dateKey: string) => {
    booking.seen.push(dateKey)
    if (booking.throwOn === dateKey) throw new Error('booking read down')
    const load = booking.byDay.get(dateKey)
    if (!load) return { slots: [], closedReason: 'day_closed' }
    return {
      slots: Array.from({ length: load.total }, (_, i) => ({
        startIso: `${dateKey}T00:00:00.000Z`,
        label: '9:00 AM',
        available: i < load.open,
      })),
      closedReason: null,
    }
  }),
}))

import { readWindowLoad, safeWindowLoad } from '@/lib/services/empty-chair'
import { FILL_WINDOW_START_DAYS, FILL_WINDOW_END_DAYS } from '@/lib/empty-chair'

const ORG = 'org_1'
const TZ = 'America/Chicago'
// Monday 2026-07-27, 10:00 Chicago.
const NOW = new Date('2026-07-27T15:00:00Z')

/** The clinic-local keys the window should cover from NOW. */
const WINDOW_KEYS = [
  '2026-07-30',
  '2026-07-31',
  '2026-08-01',
  '2026-08-02',
  '2026-08-03',
  '2026-08-04',
  '2026-08-05',
]

beforeEach(() => {
  booking.byDay = new Map()
  booking.throwOn = null
  booking.seen = []
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the window', () => {
  it('reads exactly the near window, by clinic-local calendar day', async () => {
    for (const k of WINDOW_KEYS) booking.byDay.set(k, { open: 8, total: 16 })
    const days = await readWindowLoad(ORG, TZ, NOW)
    expect(booking.seen).toEqual(WINDOW_KEYS)
    expect(days.map((d) => d.dateKey)).toEqual(WINDOW_KEYS)
    expect(days).toHaveLength(FILL_WINDOW_END_DAYS - FILL_WINDOW_START_DAYS + 1)
  })

  it('labels each day the way the practice says it', async () => {
    booking.byDay.set('2026-07-30', { open: 8, total: 16 })
    const [d] = await readWindowLoad(ORG, TZ, NOW)
    expect(d.label).toBe('Thursday')
  })

  it('LEAVES OUT the days the clinic is closed — a day off is not an empty chair', async () => {
    booking.byDay.set('2026-07-30', { open: 8, total: 16 })
    booking.byDay.set('2026-08-02', null) // Sunday, closed
    const days = await readWindowLoad(ORG, TZ, NOW)
    expect(days.map((d) => d.dateKey)).toEqual(['2026-07-30'])
  })

  it('counts openings and total from the SINGLE home for what an opening is', async () => {
    booking.byDay.set('2026-07-30', { open: 5, total: 16 })
    const [d] = await readWindowLoad(ORG, TZ, NOW)
    expect(d.open).toBe(5)
    expect(d.total).toBe(16)
  })

  it('reads the calendar day in the CLINIC’s zone, not the server’s', async () => {
    // 2026-07-28T02:00Z is Tuesday in UTC but still Monday evening in
    // Chicago, so the window opens on Thursday the 30th either way — the
    // give-away is which keys get read.
    for (const k of WINDOW_KEYS) booking.byDay.set(k, { open: 8, total: 16 })
    await readWindowLoad(ORG, TZ, new Date('2026-07-28T02:00:00Z'))
    expect(booking.seen[0]).toBe('2026-07-30')
  })
})

describe('a failed read says nothing', () => {
  it('readWindowLoad throws — the strict read', async () => {
    booking.byDay.set('2026-07-30', { open: 8, total: 16 })
    booking.throwOn = '2026-07-31'
    await expect(readWindowLoad(ORG, TZ, NOW)).rejects.toThrow()
  })

  it('safeWindowLoad returns null, and null is NOT an empty week', async () => {
    booking.throwOn = '2026-07-30'
    expect(await safeWindowLoad(ORG, TZ, NOW)).toBeNull()
  })

  it('a genuinely closed week returns an empty list, which is a different fact from null', async () => {
    expect(await safeWindowLoad(ORG, TZ, NOW)).toEqual([])
  })
})
