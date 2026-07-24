import { describe, it, expect } from 'vitest'
import { todaysHoursLabel, hoursEntryDisplay } from '@/lib/clinic-site-helpers'

const KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** The clinic-local weekday key for a tz, computed the same way the helper
 *  does — so the expectation tracks the real "now" without flaking. */
function localKey(tz: string): string {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date())
  return wd.slice(0, 3).toLowerCase()
}

function closedAllWeek() {
  return Object.fromEntries(KEY.map((k) => [k, { closed: true }])) as Record<
    string,
    { open?: string; close?: string; closed?: boolean }
  >
}

describe('todaysHoursLabel', () => {
  it('returns "Closed today" for null/garbage hours', () => {
    expect(todaysHoursLabel(null)).toBe('Closed today')
    expect(todaysHoursLabel(undefined)).toBe('Closed today')
    // @ts-expect-error — exercising the defensive guard
    expect(todaysHoursLabel('nope')).toBe('Closed today')
  })

  it('picks the clinic-local weekday when a timezone is passed', () => {
    const tz = 'America/Chicago'
    const today = localKey(tz)
    const hours = closedAllWeek()
    hours[today] = { open: '08:00', close: '17:00' }
    expect(todaysHoursLabel(hours, tz)).toBe('Open today · 8:00 AM – 5:00 PM')
  })

  it('reads the clinic-local day, not the server day (different tz → different pick)', () => {
    // Only mark the OTHER day's slot open; the clinic-local day stays closed.
    const tz = 'America/Los_Angeles'
    const today = localKey(tz)
    const hours = closedAllWeek()
    const notToday = KEY[(KEY.indexOf(today) + 1) % 7]
    hours[notToday] = { open: '08:00', close: '17:00' }
    expect(todaysHoursLabel(hours, tz)).toBe('Closed today')
  })

  it('falls back to "Hours by appointment" when open/close are missing', () => {
    const tz = 'America/New_York'
    const today = localKey(tz)
    const hours = closedAllWeek()
    hours[today] = {} // open, but no times set
    expect(todaysHoursLabel(hours, tz)).toBe('Hours by appointment')
  })

  it('still works (no throw) without a timezone', () => {
    expect(typeof todaysHoursLabel(closedAllWeek())).toBe('string')
  })

  it('does not throw on a bad timezone string', () => {
    expect(() => todaysHoursLabel(closedAllWeek(), 'Not/AZone')).not.toThrow()
  })
})

describe('todaysHoursLabel — by appointment', () => {
  const KEY2 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  function closed() {
    return Object.fromEntries(KEY2.map((k) => [k, { closed: true }])) as Record<string, { open?: string; close?: string; closed?: boolean; byAppointment?: boolean }>
  }
  function todayKey(tz: string) {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date()).slice(0, 3).toLowerCase()
  }
  it('says "By appointment today" for a by-appointment day', () => {
    const tz = 'America/Chicago'
    const hours = closed()
    hours[todayKey(tz)] = { byAppointment: true }
    expect(todaysHoursLabel(hours, tz)).toBe('By appointment today')
  })
})

describe('hoursEntryDisplay', () => {
  it('closed → Closed (also for null/undefined)', () => {
    expect(hoursEntryDisplay({ closed: true })).toBe('Closed')
    expect(hoursEntryDisplay(null)).toBe('Closed')
    expect(hoursEntryDisplay(undefined)).toBe('Closed')
  })
  it('by-appointment → By appointment only', () => {
    expect(hoursEntryDisplay({ byAppointment: true })).toBe('By appointment only')
  })
  it('a timed day → the 12h range', () => {
    expect(hoursEntryDisplay({ open: '08:00', close: '17:00' })).toBe('8:00 AM – 5:00 PM')
  })
  it('open but no times → em dash', () => {
    expect(hoursEntryDisplay({})).toBe('—')
  })
  it('closed wins over by-appointment', () => {
    expect(hoursEntryDisplay({ closed: true, byAppointment: true })).toBe('Closed')
  })
})
