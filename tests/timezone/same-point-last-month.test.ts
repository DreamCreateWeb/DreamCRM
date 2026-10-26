import { describe, it, expect } from 'vitest'
import { clinicMonthStart, clinicSamePointLastMonth } from '@/lib/clinic-timezone'

/**
 * clinicSamePointLastMonth — the exclusive upper bound of the "New patients
 * MTD" comparison window. The old window spanned the WHOLE previous month,
 * so a partial month read as a shortfall for three weeks of every four.
 */
describe('clinicSamePointLastMonth', () => {
  const tz = 'America/Chicago'

  it('is last month’s start plus the span this month has run — the 10th 10 AM against the 10th 10 AM', () => {
    const now = new Date('2026-03-10T15:00:00Z') // Mar 10, 10:00 CDT
    const bound = clinicSamePointLastMonth(now, tz)
    const lastMonthStart = clinicMonthStart(now, tz, -1)
    const monthStart = clinicMonthStart(now, tz)
    expect(lastMonthStart.toISOString()).toBe('2026-02-01T06:00:00.000Z') // Feb 1 00:00 CST
    expect(bound.getTime()).toBe(lastMonthStart.getTime() + (now.getTime() - monthStart.getTime()))
    // Feb 10 at ~10 AM Chicago (Mar 8's DST shift is the one-hour wobble).
    expect(bound.toISOString().startsWith('2026-02-10T')).toBe(true)
    expect(bound.getTime()).toBeLessThan(monthStart.getTime())
  })

  it('on the 1st the window is empty rather than a sliver of the wrong month', () => {
    const now = new Date('2026-04-01T13:30:00Z') // Apr 1, 08:30 CDT
    const bound = clinicSamePointLastMonth(now, tz)
    const lastMonthStart = clinicMonthStart(now, tz, -1)
    expect(bound.getTime() - lastMonthStart.getTime()).toBe(8.5 * 60 * 60 * 1000)
  })

  it('caps at this month’s start: a 31st against a 28-day month compares the whole of February, never March', () => {
    const now = new Date('2026-03-31T20:00:00Z') // Mar 31, 15:00 CDT
    const bound = clinicSamePointLastMonth(now, tz)
    expect(bound.getTime()).toBe(clinicMonthStart(now, tz).getTime())
  })

  it('never exceeds this month’s start for any instant', () => {
    for (const iso of ['2026-01-15T00:00:00Z', '2026-05-30T23:59:00Z', '2026-12-31T05:59:00Z']) {
      const now = new Date(iso)
      expect(clinicSamePointLastMonth(now, tz).getTime()).toBeLessThanOrEqual(clinicMonthStart(now, tz).getTime())
    }
  })
})
