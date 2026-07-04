import { describe, it, expect } from 'vitest'
import {
  generateDemoSlots,
  isSlotAvailable,
  googleCalendarLink,
  groupSlotsByDay,
  type DemoSlotConfig,
} from '@/lib/prospect-booking'
import { resolveProspectingConfig, PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

/**
 * Demo self-booking availability — the tz-correct slot grid (weekdays only,
 * lead time, no double-booking) and the add-to-calendar link. This is the
 * close accelerator's brain: a prospect picks a real, open time.
 */

const CFG: DemoSlotConfig = {
  hostTimeZone: 'America/New_York',
  days: 7,
  startHour: 9,
  endHour: 17,
  slotMinutes: 60,
  leadHours: 12,
  durationMin: 30,
}

// Wednesday, July 1 2026, 12:00 UTC (08:00 EDT).
const NOW = new Date('2026-07-01T12:00:00Z')

function hostHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(d))
}
function hostWeekday(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d)
}

describe('generateDemoSlots', () => {
  const slots = generateDemoSlots(NOW, CFG)

  it('only offers weekday business hours', () => {
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(['Sat', 'Sun']).not.toContain(hostWeekday(s))
      expect(hostHour(s)).toBeGreaterThanOrEqual(9)
      expect(hostHour(s)).toBeLessThanOrEqual(16) // last start fits the 30-min demo before 17:00
    }
  })

  it('honors the lead time (nothing sooner than now + leadHours)', () => {
    const earliest = NOW.getTime() + CFG.leadHours * 60 * 60 * 1000
    for (const s of slots) expect(s.getTime()).toBeGreaterThanOrEqual(earliest)
  })

  it('is sorted ascending', () => {
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime()).toBeGreaterThan(slots[i - 1].getTime())
    }
  })

  it('excludes already-booked slots (no double-booking)', () => {
    const taken = slots[0]
    const rest = generateDemoSlots(NOW, CFG, [taken])
    expect(rest.some((s) => s.getTime() === taken.getTime())).toBe(false)
    expect(rest.length).toBe(slots.length - 1)
  })
})

describe('isSlotAvailable', () => {
  it('accepts an offered slot and rejects an off-grid or booked one', () => {
    const slots = generateDemoSlots(NOW, CFG)
    expect(isSlotAvailable(slots[2], NOW, CFG)).toBe(true)
    expect(isSlotAvailable(slots[2], NOW, CFG, [slots[2]])).toBe(false) // booked
    expect(isSlotAvailable(new Date('2026-07-04T14:00:00Z'), NOW, CFG)).toBe(false) // Saturday
    expect(isSlotAvailable(new Date(NOW.getTime() + 60_000), NOW, CFG)).toBe(false) // inside lead time
  })
})

describe('googleCalendarLink', () => {
  it('builds a template URL with UTC start/end stamps', () => {
    const url = googleCalendarLink({
      title: 'Dream Create demo — Smile Dental',
      start: new Date('2026-07-08T18:00:00Z'),
      durationMin: 30,
      details: 'see you then',
    })
    expect(url).toContain('calendar.google.com/calendar/render')
    expect(url).toContain('action=TEMPLATE')
    expect(url).toContain('dates=20260708T180000Z%2F20260708T183000Z')
  })
})

describe('groupSlotsByDay', () => {
  it('buckets slots by their host-local calendar day', () => {
    const slots = generateDemoSlots(NOW, CFG)
    const groups = groupSlotsByDay(slots, 'America/New_York')
    expect(groups.length).toBeGreaterThan(1)
    // Every slot in a group shares that group's day key.
    for (const g of groups) {
      for (const s of g.slots) {
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(s)
        expect(key).toBe(g.dayKey)
      }
    }
  })
})

describe('resolveProspectingConfig — booking block', () => {
  it('fills booking defaults for an empty/legacy config (no backfill)', () => {
    expect(resolveProspectingConfig({}).booking).toEqual(PROSPECTING_DEFAULTS.booking)
    expect(resolveProspectingConfig(null).booking.enabled).toBe(false)
  })
  it('merges a partial booking block over defaults', () => {
    const c = resolveProspectingConfig({ booking: { enabled: true, startHour: 10 } })
    expect(c.booking.enabled).toBe(true)
    expect(c.booking.startHour).toBe(10)
    expect(c.booking.hostTimeZone).toBe(PROSPECTING_DEFAULTS.booking.hostTimeZone)
  })
})
