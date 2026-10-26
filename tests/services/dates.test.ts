import { describe, it, expect } from 'vitest'
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  ageFromDob,
  isBirthdayThisWeek,
  isBirthdayWithinDays,
  isBirthdayThisMonth,
  birthdayMonthOf,
  LAPSED_DEFAULT_MONTHS,
  lapsedCutoff,
} from '@/lib/dates'
import { clinicDayKey } from '@/lib/format-datetime'

describe('date boundaries', () => {
  const d = new Date(2026, 5, 17, 14, 30, 15) // Wed Jun 17 2026 14:30:15 local
  it('startOfDay / endOfDay zero + max the clock', () => {
    expect(startOfDay(d).getHours()).toBe(0)
    expect(startOfDay(d).getMinutes()).toBe(0)
    expect(endOfDay(d).getHours()).toBe(23)
    expect(endOfDay(d).getMilliseconds()).toBe(999)
  })
  it('startOfWeek lands on the preceding Sunday at midnight', () => {
    const w = startOfWeek(d)
    expect(w.getDay()).toBe(0)
    expect(w.getHours()).toBe(0)
    expect(w.getDate()).toBe(14) // Sun Jun 14
  })
  it('startOfMonth / endOfMonth bracket the month', () => {
    expect(startOfMonth(d).getDate()).toBe(1)
    expect(endOfMonth(d).getDate()).toBe(30) // June has 30 days
    expect(endOfMonth(d).getHours()).toBe(23)
  })
})

describe('ageFromDob', () => {
  const today = new Date(2026, 5, 17)
  it('computes whole years, accounting for not-yet-had birthday', () => {
    expect(ageFromDob('2000-01-01', today)).toBe(26)
    expect(ageFromDob('2000-12-31', today)).toBe(25) // birthday later this year
  })
  it('returns null for missing / malformed', () => {
    expect(ageFromDob(null, today)).toBeNull()
    expect(ageFromDob('not-a-date', today)).toBeNull()
  })
})

// The birthday helpers take the CLINIC's calendar day (`YYYY-MM-DD`, from
// clinicDayKey) rather than a server instant — the prod clock is UTC, so a
// Date-based "today" was already tomorrow from ~7 PM Central (CLAUDE.md
// timezone rule 2).
describe('isBirthdayThisWeek', () => {
  const today = '2026-06-17' // Jun 17
  it('true within the next 6 days, false outside', () => {
    expect(isBirthdayThisWeek('1990-06-17', today)).toBe(true) // today
    expect(isBirthdayThisWeek('1990-06-23', today)).toBe(true) // +6
    expect(isBirthdayThisWeek('1990-06-24', today)).toBe(false) // +7
    expect(isBirthdayThisWeek('1990-06-16', today)).toBe(false) // yesterday
  })
  it('handles the Dec→Jan rollover', () => {
    expect(isBirthdayThisWeek('1990-01-02', '2026-12-29')).toBe(true)
  })
  it('null/malformed → false', () => {
    expect(isBirthdayThisWeek(null, today)).toBe(false)
    expect(isBirthdayThisWeek('xx', today)).toBe(false)
    expect(isBirthdayThisWeek('1990-06-17', 'not-a-day')).toBe(false)
  })
  it('isBirthdayWithinDays is the general form (the week is 6 days out)', () => {
    expect(isBirthdayWithinDays('1990-06-30', today, 13)).toBe(true)
    expect(isBirthdayWithinDays('1990-06-30', today, 12)).toBe(false)
  })
})

describe('isBirthdayThisMonth / birthdayMonthOf', () => {
  it('matches the current month only', () => {
    const today = '2026-06-01' // June
    expect(isBirthdayThisMonth('1990-06-30', today)).toBe(true)
    expect(isBirthdayThisMonth('1990-07-01', today)).toBe(false)
    expect(birthdayMonthOf(today)).toBe('06')
    expect(birthdayMonthOf('garbage')).toBe('')
  })
})

describe('the clinic calendar, not the server clock', () => {
  // 2026-10-31 at 23:30 UTC is still Oct 31 18:30 in Chicago: a Nov 1 birthday
  // is NOT "this month" there (the UTC server's getMonth() said it was) and IS
  // "this week" (6 days out, tomorrow).
  const instant = new Date('2026-10-31T23:30:00Z')
  const chicagoToday = clinicDayKey(instant, 'America/Chicago')
  it('resolves the clinic day from the instant', () => {
    expect(chicagoToday).toBe('2026-10-31')
    expect(clinicDayKey(instant, 'UTC')).toBe('2026-10-31')
    expect(clinicDayKey(new Date('2026-11-01T01:30:00Z'), 'America/Chicago')).toBe('2026-10-31')
  })
  it('a Nov 1 birthday at 6:30 PM Central on Oct 31 is this WEEK, not this MONTH', () => {
    const lateEvening = clinicDayKey(new Date('2026-11-01T01:30:00Z'), 'America/Chicago') // still Oct 31 there
    expect(isBirthdayThisMonth('1988-11-01', lateEvening)).toBe(false)
    expect(isBirthdayThisWeek('1988-11-01', lateEvening)).toBe(true)
    // The UTC server's own calendar had already flipped — the old bug.
    const utcDay = clinicDayKey(new Date('2026-11-01T01:30:00Z'), 'UTC')
    expect(isBirthdayThisMonth('1988-11-01', utcDay)).toBe(true)
  })
})

describe('lapsedCutoff', () => {
  const now = new Date(2026, 5, 17)
  const monthsBack = (n: number) => now.getTime() - n * 30 * 24 * 60 * 60 * 1000
  it('defaults to 18 months (the proactive dental standard)', () => {
    expect(LAPSED_DEFAULT_MONTHS).toBe(18)
    expect(lapsedCutoff(now, null).getTime()).toBe(monthsBack(18))
    expect(lapsedCutoff(now, 0).getTime()).toBe(monthsBack(18)) // 0/invalid → default
  })
  it('honors a clinic-configured value', () => {
    expect(lapsedCutoff(now, 12).getTime()).toBe(monthsBack(12))
    expect(lapsedCutoff(now, 24).getTime()).toBe(monthsBack(24))
  })
})
