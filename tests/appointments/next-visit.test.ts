import { describe, it, expect } from 'vitest'
import {
  NEXT_VISIT_DEFAULT_MONTHS,
  addMonthsToDateKey,
  resolveRecallMonths,
  suggestNextVisitDateKey,
} from '@/lib/next-visit'

/**
 * The seed for "Book their next visit": the visit's CLINIC-LOCAL date plus
 * the recall ladder (patient → clinic → six months). Pure, so the whole
 * contract — the ladder, the `> 0` rung test, the month clamp, and the
 * timezone edge the server would otherwise get wrong — pins here.
 */
describe('resolveRecallMonths — the recall ladder', () => {
  it('prefers the patient’s own interval, then the clinic default, then six months', () => {
    expect(resolveRecallMonths(3, 4)).toBe(3)
    expect(resolveRecallMonths(null, 4)).toBe(4)
    expect(resolveRecallMonths(null, null)).toBe(NEXT_VISIT_DEFAULT_MONTHS)
    expect(resolveRecallMonths(undefined, undefined)).toBe(6)
  })

  it('treats 0 and negatives as "not set" (the ?? trap recall-status documents)', () => {
    expect(resolveRecallMonths(0, 4)).toBe(4)
    expect(resolveRecallMonths(0, 0)).toBe(6)
    expect(resolveRecallMonths(-2, null)).toBe(6)
    expect(resolveRecallMonths(Number.NaN, 9)).toBe(9)
  })
})

describe('addMonthsToDateKey', () => {
  it('adds calendar months across a year boundary', () => {
    expect(addMonthsToDateKey('2026-10-26', 6)).toBe('2027-04-26')
    expect(addMonthsToDateKey('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonthsToDateKey('2026-01-10', 12)).toBe('2027-01-10')
  })

  it('clamps the day to the target month instead of overflowing (Aug 31 + 6 → Feb 28)', () => {
    expect(addMonthsToDateKey('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonthsToDateKey('2027-08-31', 6)).toBe('2028-02-29') // leap year
    expect(addMonthsToDateKey('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToDateKey('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('refuses a non-key', () => {
    expect(() => addMonthsToDateKey('10/26/2026', 6)).toThrow(/YYYY-MM-DD/)
  })
})

describe('suggestNextVisitDateKey — counts from the clinic’s calendar day', () => {
  it('a 7:30 PM Central visit is still that day in Chicago, not tomorrow in UTC', () => {
    // 2026-10-26 19:30 America/Chicago = 2026-10-27T00:30Z — the UTC day has
    // already rolled. Six months from the CLINIC's day is Apr 26, not Apr 27.
    const start = new Date('2026-10-27T00:30:00Z')
    expect(suggestNextVisitDateKey(start, 'America/Chicago', { patientMonths: null, clinicMonths: null })).toBe('2027-04-26')
    // Read in UTC the same instant is the 27th — the bug this guards against.
    expect(suggestNextVisitDateKey(start, 'UTC', { patientMonths: null, clinicMonths: null })).toBe('2027-04-27')
  })

  it('rides the patient’s own interval over the clinic’s', () => {
    const start = new Date('2026-06-15T14:00:00Z')
    expect(suggestNextVisitDateKey(start, 'America/New_York', { patientMonths: 3, clinicMonths: 6 })).toBe('2026-09-15')
    expect(suggestNextVisitDateKey(start, 'America/New_York', { patientMonths: null, clinicMonths: 4 })).toBe('2026-10-15')
  })

  it('falls back to the default zone when the clinic has none', () => {
    const start = new Date('2026-06-15T14:00:00Z')
    expect(suggestNextVisitDateKey(start, null, { patientMonths: null, clinicMonths: null })).toBe('2026-12-15')
  })
})
