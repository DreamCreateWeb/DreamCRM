import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ML-51 — a stated closure beats the weekly grid at the ONE slot engine, so
 * the public site, the portal, the reschedule guard and the 14-day scan all
 * agree: no slot on a closed day, a named reason, the day after untouched.
 */
const state: {
  hours: Record<string, { open?: string; close?: string; closed?: boolean }>
  label: string
  closedKeys: Set<string>
  throws: boolean
} = { hours: {}, label: 'Thanksgiving', closedKeys: new Set(), throws: false }

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  return {
    db: {
      select: () => ({
        from: (t: unknown) => ({
          where: () => ({
            limit: async () => (t === clinicProfile ? [{ hours: state.hours, timezone: 'UTC', chairCount: 1 }] : []),
            then: (resolve: (v: unknown) => void) => resolve([]),
          }),
        }),
      }),
    },
  }
})
vi.mock('@/lib/services/closures', () => ({
  closureOnDay: vi.fn(async (_org: string, key: string) => {
    if (state.throws) throw new Error('db down')
    return state.closedKeys.has(key) ? { id: 'c1', startsOn: key, endsOn: key, label: state.label } : null
  }),
}))

import { firstBookableDayInWindow, getAvailableSlots, getSlotsForDay, hasBookableSlotsInWindow } from '@/lib/services/booking'
import { emptySlotsCopy } from '@/app/site/[slug]/book/book-form'

function key(offset: number): string {
  return new Date(Date.UTC(2099, 5, 1 + offset)).toISOString().slice(0, 10)
}

beforeEach(() => {
  state.hours = Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: '09:00', close: '17:00' }]),
  )
  state.label = 'Thanksgiving'
  state.closedKeys = new Set()
  state.throws = false
})

describe('getSlotsForDay on a closure day', () => {
  it('offers no slot and says why, with the closure named', async () => {
    state.closedKeys.add(key(0))
    const res = await getSlotsForDay('org_1', key(0))
    expect(res.slots).toEqual([])
    expect(res.closedReason).toBe('closure')
    expect(res.closureLabel).toBe('Thanksgiving')
    expect(await getAvailableSlots('org_1', key(0))).toEqual([])
  })

  it('leaves the next day open', async () => {
    state.closedKeys.add(key(0))
    const next = await getSlotsForDay('org_1', key(1))
    expect(next.closedReason).toBeNull()
    expect(next.slots.length).toBeGreaterThan(0)
  })

  it('a Date is converted to the clinic-local day before the lookup', async () => {
    state.closedKeys.add('2099-06-01')
    const res = await getSlotsForDay('org_1', new Date('2099-06-01T15:00:00Z'))
    expect(res.closedReason).toBe('closure')
  })

  it('a failed closure read fails OPEN — a degraded slot list beats a dead booking page', async () => {
    state.throws = true
    const res = await getSlotsForDay('org_1', key(0))
    expect(res.slots.length).toBeGreaterThan(0)
  })
})

describe('the window scan skips closed days', () => {
  it('firstBookableDayInWindow steps over a closure run', async () => {
    for (const o of [0, 1, 2]) state.closedKeys.add(key(o))
    expect(await firstBookableDayInWindow('org_1', key(0), 14)).toBe(key(3))
  })

  it('a window entirely inside a closure has nothing bookable', async () => {
    for (let o = 0; o < 14; o++) state.closedKeys.add(key(o))
    expect(await hasBookableSlotsInWindow('org_1', key(0), 14)).toBe(false)
  })
})

describe('the picker copy', () => {
  it('a closure reads as a closed day, never "every slot is taken"', () => {
    expect(emptySlotsCopy([], 'closure')).toBe("We're closed this day. Try another day.")
  })
})
