import { describe, it, expect } from 'vitest'
import { openNowLabel, todayHoursLine, resolveSiteWeek, weekFromProfileHours } from '@/lib/site-hours'

const hours = {
  mon: { open: '08:00', close: '17:00' },
  tue: { open: '08:00', close: '17:00' },
  fri: { open: '08:00', close: '12:00' },
}
const week = weekFromProfileHours(hours)

describe('openNowLabel', () => {
  it('is open mid-day in the clinic zone, not the server zone', () => {
    // Mon 2026-11-09 18:00Z = 12 PM Central
    expect(openNowLabel(week, null, new Date('2026-11-09T18:00:00Z'), 'America/Chicago')).toBe('Open now · closes 5 PM')
  })
  it('after close points at tomorrow', () => {
    // 23:30Z = 5:30 PM Central
    expect(openNowLabel(week, null, new Date('2026-11-09T23:30:00Z'), 'America/Chicago')).toBe('Closed now · opens tomorrow 8 AM')
  })
  it('before opening says today', () => {
    expect(openNowLabel(week, null, new Date('2026-11-09T12:00:00Z'), 'America/Chicago')).toBe('Closed now · opens today at 8 AM')
  })
  it('a day with no hours points at the next open weekday', () => {
    expect(openNowLabel(week, null, new Date('2026-11-14T18:00:00Z'), 'America/Chicago')).toBe('Closed today · opens Monday 8 AM')
  })
  it('a closure date closes the day', () => {
    expect(openNowLabel(week, [{ date: '2026-11-09' }], new Date('2026-11-09T18:00:00Z'), 'America/Chicago')).toBe(
      'Closed today · opens tomorrow 8 AM',
    )
  })
  it('a labelled closure names itself and points at the next open day', () => {
    expect(openNowLabel(week, [{ date: '2026-11-09', label: 'Thanksgiving' }], new Date('2026-11-09T18:00:00Z'), 'America/Chicago')).toBe(
      'Closed for Thanksgiving · opens tomorrow 8 AM',
    )
  })
  it('a multi-day closure skips every closed day when naming the next open one', () => {
    // Fri Nov 13 closed through Mon Nov 16 (a long weekend) → Tuesday.
    const days = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map((date) => ({ date, label: 'Retreat' }))
    expect(openNowLabel(week, days, new Date('2026-11-13T18:00:00Z'), 'America/Chicago')).toBe('Closed for Retreat · opens Tuesday 8 AM')
  })
  it('the closure date is the CLINIC day: 9:30 PM Central Nov 8 is not yet Nov 9', () => {
    // 03:30Z on the 9th = 9:30 PM CST on the 8th (a Sunday: no hours).
    const label = openNowLabel(week, [{ date: '2026-11-09', label: 'Retreat' }], new Date('2026-11-09T03:30:00Z'), 'America/Chicago')
    expect(label).toMatch(/^Closed today · opens Tuesday 8 AM$/)
  })
  it('todayHoursLine says the closure', () => {
    expect(todayHoursLine(week, new Date('2026-11-09T18:00:00Z'), 'America/Chicago', [{ date: '2026-11-09', label: 'Thanksgiving' }])).toBe(
      'Today · Closed for Thanksgiving',
    )
  })
  it('is DST safe (spring forward 2026-03-08 in New York)', () => {
    expect(openNowLabel(week, null, new Date('2026-03-09T12:30:00Z'), 'America/New_York')).toBe('Open now · closes 5 PM')
    expect(openNowLabel(week, null, new Date('2026-03-09T11:30:00Z'), 'America/New_York')).toBe('Closed now · opens today at 8 AM')
  })
  it('says nothing without hours; a bad zone falls back', () => {
    expect(openNowLabel(null, null, new Date(), 'UTC')).toBeNull()
    expect(openNowLabel(week, null, new Date('2026-11-09T18:00:00Z'), 'Not/AZone')).toBeTruthy()
  })
})

describe('GBP hours win', () => {
  it('prefers synced periods when present', () => {
    const w = resolveSiteWeek(hours, [{ day: 'mon', open: '10:00', close: '14:00' }])
    expect(openNowLabel(w, null, new Date('2026-11-09T18:00:00Z'), 'America/Chicago')).toBe('Open now · closes 2 PM')
    expect(resolveSiteWeek(hours, [])).toEqual(week)
  })
  it('todayHoursLine reads the clinic-local day', () => {
    expect(todayHoursLine(week, new Date('2026-11-09T18:00:00Z'), 'America/Chicago')).toBe('Today · 8 AM – 5 PM')
    expect(todayHoursLine(week, new Date('2026-11-14T18:00:00Z'), 'America/Chicago')).toBe('Today · Closed')
  })
})
