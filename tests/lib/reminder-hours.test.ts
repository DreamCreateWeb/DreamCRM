import { describe, it, expect } from 'vitest'
import {
  JUST_BOOKED_GRACE_HOURS,
  JUST_BOOKED_MS,
  SEND_WINDOW_END_HOUR,
  SEND_WINDOW_START_HOUR,
  bookedTooRecently,
  bornInsideTouch,
  confirmationCoversBooking,
  formatHour12,
  isInsideSendWindow,
  nextWindowOpen,
} from '@/lib/reminder-hours'
import { clinicLocalHour } from '@/lib/clinic-timezone'

/**
 * lib/reminder-hours.ts — the two silent rules under the reminder engine and
 * the SMS transport. Rule 1 is graded on the CLINIC's clock across the US
 * zones and both DST edges of 2026 (spring-forward Mar 8, fall-back Nov 1);
 * rule 2 on the booking-vs-touch arithmetic.
 */

const H = 60 * 60 * 1000

describe('isInsideSendWindow — 8 AM inclusive to 8 PM exclusive, on the clinic’s clock', () => {
  it.each<[string, string, boolean, string]>([
    ['2026-06-10T12:00:00Z', 'America/New_York', true, '8:00 AM EDT — the first allowed minute'],
    ['2026-06-10T11:59:00Z', 'America/New_York', false, '7:59 AM EDT'],
    ['2026-06-10T23:59:00Z', 'America/New_York', true, '7:59 PM EDT'],
    ['2026-06-11T00:00:00Z', 'America/New_York', false, '8:00 PM EDT — closed on the hour'],
    ['2026-06-10T12:00:00Z', 'America/Los_Angeles', false, '5:00 AM PDT — the same instant, a different clock'],
    ['2026-06-10T15:00:00Z', 'America/Los_Angeles', true, '8:00 AM PDT'],
    ['2026-06-11T04:10:00Z', 'America/Chicago', false, '11:10 PM CDT — the 23:10 reminder the finding named'],
    ['2026-06-10T18:00:00Z', 'Pacific/Honolulu', true, '8:00 AM HST'],
    ['2026-01-10T13:00:00Z', 'America/New_York', true, '8:00 AM EST — the winter offset'],
    ['2026-01-10T12:59:00Z', 'America/New_York', false, '7:59 AM EST'],
    ['2026-07-10T15:00:00Z', 'America/Phoenix', true, '8:00 AM MST — Arizona never springs forward'],
    ['2026-03-08T12:00:00Z', 'America/New_York', true, '8:00 AM EDT on spring-forward Sunday'],
    ['2026-03-08T11:59:00Z', 'America/New_York', false, '7:59 AM EDT on spring-forward Sunday'],
    ['2026-11-01T13:00:00Z', 'America/New_York', true, '8:00 AM EST on fall-back Sunday'],
    ['2026-11-01T12:59:00Z', 'America/New_York', false, '7:59 AM EST on fall-back Sunday'],
    ['2026-11-01T01:00:00Z', 'America/New_York', false, '9:00 PM EDT, the evening before fall-back'],
  ])('%s in %s → %s (%s)', (iso, tz, expected) => {
    expect(isInsideSendWindow(new Date(iso), tz)).toBe(expected)
  })

  it('a missing timezone reads the platform default (Eastern)', () => {
    expect(isInsideSendWindow(new Date('2026-06-10T12:00:00Z'), null)).toBe(true)
    expect(isInsideSendWindow(new Date('2026-06-10T11:00:00Z'), undefined)).toBe(false)
  })

  it('an unparseable stored timezone never throws out of a cron loop — it reads the default', () => {
    expect(isInsideSendWindow(new Date('2026-06-10T12:00:00Z'), 'Not/AZone')).toBe(true)
    expect(() => nextWindowOpen(new Date('2026-06-10T03:00:00Z'), 'Not/AZone')).not.toThrow()
  })

  it('takes a custom window', () => {
    const office = { startHour: 9, endHour: 17 }
    expect(isInsideSendWindow(new Date('2026-06-10T13:00:00Z'), 'America/New_York', office)).toBe(true)
    expect(isInsideSendWindow(new Date('2026-06-10T12:00:00Z'), 'America/New_York', office)).toBe(false)
  })
})

describe('nextWindowOpen — the earliest allowed instant at or after now', () => {
  it('inside the window it is now itself', () => {
    const now = new Date('2026-06-10T15:00:00Z')
    expect(nextWindowOpen(now, 'America/New_York')).toBe(now)
  })

  it.each<[string, string, string, string]>([
    ['2026-06-10T09:00:00Z', 'America/New_York', '2026-06-10T12:00:00.000Z', '5 AM EDT → 8 AM EDT the same morning'],
    ['2026-06-11T01:00:00Z', 'America/New_York', '2026-06-11T12:00:00.000Z', '9 PM EDT → 8 AM EDT tomorrow'],
    ['2026-06-10T03:00:00Z', 'America/Los_Angeles', '2026-06-10T15:00:00.000Z', '8 PM PDT June 9 → 8 AM PDT June 10'],
    [
      '2026-03-08T07:30:00Z',
      'America/New_York',
      '2026-03-08T12:00:00.000Z',
      'spring-forward Sunday, 3:30 AM EDT → 8 AM EDT (midnight + 8 elapsed hours would read 9 AM)',
    ],
    [
      '2026-03-08T02:00:00Z',
      'America/New_York',
      '2026-03-08T12:00:00.000Z',
      'the evening before spring-forward, 9 PM EST → 8 AM EDT',
    ],
    [
      '2026-11-01T04:30:00Z',
      'America/New_York',
      '2026-11-01T13:00:00.000Z',
      'fall-back Sunday, 12:30 AM EDT → 8 AM EST (midnight + 8 elapsed hours would read 7 AM)',
    ],
    [
      '2026-11-01T01:00:00Z',
      'America/New_York',
      '2026-11-01T13:00:00.000Z',
      'the evening before fall-back, 9 PM EDT → 8 AM EST',
    ],
  ])('%s in %s → %s (%s)', (iso, tz, expectedIso) => {
    const open = nextWindowOpen(new Date(iso), tz)
    expect(open.toISOString()).toBe(expectedIso)
    // And it reads 8:00 on the clinic's wall, inside the window, whatever the offset did overnight.
    expect(clinicLocalHour(open, tz)).toBe(SEND_WINDOW_START_HOUR)
    expect(isInsideSendWindow(open, tz)).toBe(true)
  })
})

describe('the just-booked rule', () => {
  const NOW = new Date('2026-06-10T12:00:00Z')
  const ago = (h: number) => new Date(NOW.getTime() - h * H)
  const ahead = (h: number) => new Date(NOW.getTime() + h * H)

  it('the constants: a 2-hour grace, and the agenda glyph is its 1-hour display twin', () => {
    expect(JUST_BOOKED_GRACE_HOURS).toBe(2)
    expect(JUST_BOOKED_MS).toBe(H)
  })

  it('within the grace every touch waits — nothing follows the confirmation', () => {
    expect(bookedTooRecently({ createdAt: ago(0.5), startTime: ahead(70), now: NOW, offsetHours: 72 })).toBe(true)
    expect(bookedTooRecently({ createdAt: ago(1.99), startTime: ahead(30), now: NOW, offsetHours: 24 })).toBe(true)
  })

  it('after the grace, only the touch the visit was born inside stays covered', () => {
    // 23h out at booking: the 24h window was already open — the confirmation WAS that touch.
    expect(bookedTooRecently({ createdAt: ago(3), startTime: ahead(20), now: NOW, offsetHours: 24 })).toBe(true)
    // 70h out at booking: the 24h window opened 46 hours later — the visit's own touch.
    expect(bookedTooRecently({ createdAt: ago(50), startTime: ahead(20), now: NOW, offsetHours: 24 })).toBe(false)
    // 6h out at booking this morning: the 4h touch opened after the booking.
    expect(bookedTooRecently({ createdAt: ago(3), startTime: ahead(3), now: NOW, offsetHours: 4 })).toBe(false)
  })

  it('exactly two hours on, the grace is over', () => {
    expect(bookedTooRecently({ createdAt: ago(2), startTime: ahead(80), now: NOW, offsetHours: 72 })).toBe(false)
  })

  it('bornInsideTouch: open at booking means lead ≤ offset, the boundary included', () => {
    expect(bornInsideTouch(ago(2), ahead(22), 24)).toBe(true) // 24h lead exactly
    expect(bornInsideTouch(ago(2), ahead(23), 24)).toBe(false) // 25h lead
    expect(bornInsideTouch(ago(0), ahead(1), 4)).toBe(true)
  })

  it('an unknown createdAt never claims the rule (a legacy row, a slim fixture)', () => {
    expect(bookedTooRecently({ createdAt: null, startTime: ahead(20), now: NOW, offsetHours: 24 })).toBe(false)
    expect(bookedTooRecently({ createdAt: undefined, startTime: ahead(20), now: NOW, offsetHours: 24 })).toBe(false)
    expect(bornInsideTouch(null, ahead(20), 24)).toBe(false)
  })
})

describe('confirmationCoversBooking — the honest proxy for "a confirmation went out"', () => {
  it.each<[string | null, string | null, boolean, string]>([
    ['booking_widget', 'sam@example.com', true, 'the public widget confirmed it'],
    ['manual', 'sam@example.com', true, 'the front desk booked it — the desk path confirms too'],
    [null, 'sam@example.com', true, 'an unsourced row the platform wrote'],
    ['pms', 'sam@example.com', false, 'booked in the practice system — we confirmed nothing'],
    ['pms_import', 'sam@example.com', false, 'a backfilled PMS row'],
    ['booking_widget', null, false, 'no address of their own — the confirmation returned early'],
    ['booking_widget', '   ', false, 'a blank address is no address'],
  ])('source %s, email %s → %s (%s)', (source, patientEmail, expected) => {
    expect(confirmationCoversBooking({ source, patientEmail })).toBe(expected)
  })
})

describe('the words the gate is quoted by', () => {
  it('formatHour12', () => {
    expect(formatHour12(8)).toBe('8 AM')
    expect(formatHour12(20)).toBe('8 PM')
    expect(formatHour12(0)).toBe('12 AM')
    expect(formatHour12(12)).toBe('12 PM')
    expect(formatHour12(23)).toBe('11 PM')
  })

  it('the window the settings sentence and the transport refusal both read', () => {
    expect(SEND_WINDOW_START_HOUR).toBe(8)
    expect(SEND_WINDOW_END_HOUR).toBe(20)
  })
})
