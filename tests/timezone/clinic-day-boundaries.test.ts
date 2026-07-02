import { describe, it, expect } from 'vitest'
import {
  clinicDayStart,
  clinicWeekStart,
  clinicMonthStart,
  resolveClinicTimeZone,
} from '@/lib/clinic-timezone'
import {
  clinicDayKey,
  formatClinicDayTime,
  formatClinicTime,
  formatClinicDayHeader,
} from '@/lib/format-datetime'

/**
 * The server runs in UTC; every clinic-facing day boundary and time string
 * must resolve against the clinic's IANA timezone. These pin the helpers that
 * the agenda windows, Overview today-window, and timeline/feed time renders
 * ride on — including the exact reported bug (1 PM Central rendering as 6 PM).
 */

describe('formatClinicDayTime / formatClinicTime', () => {
  // The reported bug: booked 1:00 PM Central (18:00 UTC), timeline showed 6:00 PM.
  const onePmCentral = new Date('2026-07-01T18:00:00Z')

  it('renders the clinic wall-clock, not UTC (the 6 PM-vs-1 PM bug)', () => {
    expect(formatClinicDayTime(onePmCentral, 'America/Chicago')).toBe('Wed, Jul 1, 1:00 PM')
    expect(formatClinicTime(onePmCentral, 'America/Chicago')).toBe('1:00 PM')
  })

  it('renders the clinic-local calendar day for late-evening visits', () => {
    // 8 PM Pacific July 1 = 03:00 UTC July 2 — the header must say July 1.
    const eveningPacific = new Date('2026-07-02T03:00:00Z')
    expect(formatClinicDayHeader(eveningPacific, 'America/Los_Angeles')).toBe('Wednesday, July 1')
  })
})

describe('clinicDayKey', () => {
  it('keys an instant by the clinic calendar day', () => {
    const lateEveningCentral = new Date('2026-05-21T00:30:00Z') // 7:30 PM CDT May 20
    expect(clinicDayKey(lateEveningCentral, 'America/Chicago')).toBe('2026-05-20')
    expect(clinicDayKey(lateEveningCentral, 'UTC')).toBe('2026-05-21')
  })
})

describe('clinicDayStart', () => {
  it('returns clinic-local midnight as an absolute instant', () => {
    const now = new Date('2026-07-01T18:00:00Z') // 1 PM CDT
    // Midnight CDT (UTC-5) on Jul 1 = 05:00 UTC.
    expect(clinicDayStart(now, 'America/Chicago').toISOString()).toBe('2026-07-01T05:00:00.000Z')
  })

  it('keeps a late-evening "now" on the clinic day (the UTC rollover case)', () => {
    const elevenPmCentral = new Date('2026-07-02T04:00:00Z') // 11 PM CDT Jul 1
    expect(clinicDayStart(elevenPmCentral, 'America/Chicago').toISOString()).toBe(
      '2026-07-01T05:00:00.000Z',
    )
  })

  it('offsets whole clinic days, crossing month boundaries', () => {
    const now = new Date('2026-07-01T18:00:00Z')
    expect(clinicDayStart(now, 'America/Chicago', 1).toISOString()).toBe('2026-07-02T05:00:00.000Z')
    expect(clinicDayStart(now, 'America/Chicago', -1).toISOString()).toBe('2026-06-30T05:00:00.000Z')
    expect(clinicDayStart(now, 'America/Chicago', -31).toISOString()).toBe('2026-05-31T05:00:00.000Z')
  })

  it('is DST-aware (spring-forward day starts at the right offset)', () => {
    // 2026-03-08 is the US spring-forward date. Noon CDT that day = 17:00 UTC;
    // local midnight that morning was still CST (UTC-6) = 06:00 UTC.
    const noonOnDstDay = new Date('2026-03-08T17:00:00Z')
    expect(clinicDayStart(noonOnDstDay, 'America/Chicago').toISOString()).toBe(
      '2026-03-08T06:00:00.000Z',
    )
    // The next local midnight is in CDT (UTC-5).
    expect(clinicDayStart(noonOnDstDay, 'America/Chicago', 1).toISOString()).toBe(
      '2026-03-09T05:00:00.000Z',
    )
  })
})

describe('clinicWeekStart / clinicMonthStart', () => {
  it('weekStart lands on the clinic-local Sunday midnight', () => {
    // Wed Jul 1 2026, 1 PM CDT → week started Sun Jun 28, midnight CDT.
    const now = new Date('2026-07-01T18:00:00Z')
    expect(clinicWeekStart(now, 'America/Chicago').toISOString()).toBe('2026-06-28T05:00:00.000Z')
  })

  it('weekStart respects the clinic-local weekday near the UTC rollover', () => {
    // 11 PM CDT Sat Jul 4 is already Sunday in UTC — the local week still
    // starts Sun Jun 28, not Jul 5.
    const lateSaturday = new Date('2026-07-05T04:00:00Z')
    expect(clinicWeekStart(lateSaturday, 'America/Chicago').toISOString()).toBe(
      '2026-06-28T05:00:00.000Z',
    )
  })

  it('monthStart is clinic-local first-of-month, with month offsets', () => {
    const now = new Date('2026-07-01T18:00:00Z')
    expect(clinicMonthStart(now, 'America/Chicago').toISOString()).toBe('2026-07-01T05:00:00.000Z')
    expect(clinicMonthStart(now, 'America/Chicago', -1).toISOString()).toBe(
      '2026-06-01T05:00:00.000Z',
    )
  })

  it('monthStart keeps a late-evening month-end on the old month', () => {
    // 11 PM CDT Jun 30 = 04:00 UTC Jul 1 — the current month is still June.
    const lateJune = new Date('2026-07-01T04:00:00Z')
    expect(clinicMonthStart(lateJune, 'America/Chicago').toISOString()).toBe(
      '2026-06-01T05:00:00.000Z',
    )
  })
})

describe('null-timezone fallback', () => {
  it('falls back to the clinic default zone', () => {
    const now = new Date('2026-07-01T18:00:00Z')
    expect(clinicDayStart(now, null).toISOString()).toBe(
      clinicDayStart(now, resolveClinicTimeZone(null)).toISOString(),
    )
  })
})
