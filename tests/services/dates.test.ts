import { describe, it, expect } from 'vitest'
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  ageFromDob,
  isBirthdayThisWeek,
  isBirthdayThisMonth,
  LAPSED_DEFAULT_MONTHS,
  lapsedCutoff,
} from '@/lib/dates'

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

describe('isBirthdayThisWeek', () => {
  const today = new Date(2026, 5, 17) // Jun 17
  it('true within the next 6 days, false outside', () => {
    expect(isBirthdayThisWeek('1990-06-17', today)).toBe(true) // today
    expect(isBirthdayThisWeek('1990-06-23', today)).toBe(true) // +6
    expect(isBirthdayThisWeek('1990-06-24', today)).toBe(false) // +7
    expect(isBirthdayThisWeek('1990-06-16', today)).toBe(false) // yesterday
  })
  it('handles the Dec→Jan rollover', () => {
    const nye = new Date(2026, 11, 29) // Dec 29
    expect(isBirthdayThisWeek('1990-01-02', nye)).toBe(true)
  })
  it('null/malformed → false', () => {
    expect(isBirthdayThisWeek(null, today)).toBe(false)
    expect(isBirthdayThisWeek('xx', today)).toBe(false)
  })
})

describe('isBirthdayThisMonth', () => {
  it('matches the current month only', () => {
    const today = new Date(2026, 5, 1) // June
    expect(isBirthdayThisMonth('1990-06-30', today)).toBe(true)
    expect(isBirthdayThisMonth('1990-07-01', today)).toBe(false)
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
