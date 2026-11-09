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
