import { describe, it, expect } from 'vitest'
import {
  addDaysToKey,
  closureOn,
  commonHolidayPresets,
  digestClosureNotes,
  expandClosureDays,
  formatClosureRange,
  holidayPresets,
  isClosedOn,
  isValidDayKey,
  nextClosure,
  parseClosureInput,
  upcomingClosureLine,
} from '@/lib/closures'
import { parseGbpSpecialClosures } from '@/lib/gbp-listing'

const THANKS = { id: 'c1', startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' }

describe('isClosedOn — a closure is a clinic-local DAY, compared by key', () => {
  it('covers both ends of the range and nothing outside it', () => {
    expect(isClosedOn('2026-11-25', [THANKS])).toBe(false)
    expect(isClosedOn('2026-11-26', [THANKS])).toBe(true)
    expect(isClosedOn('2026-11-27', [THANKS])).toBe(true)
    expect(isClosedOn('2026-11-28', [THANKS])).toBe(false)
    expect(isClosedOn('2026-11-26', null)).toBe(false)
    expect(closureOn('2026-11-27', [THANKS])?.label).toBe('Thanksgiving')
  })
})

describe('day keys', () => {
  it('validates real calendar days only', () => {
    expect(isValidDayKey('2026-02-28')).toBe(true)
    expect(isValidDayKey('2026-02-30')).toBe(false)
    expect(isValidDayKey('2026-2-3')).toBe(false)
    expect(isValidDayKey(20261126)).toBe(false)
  })
  it('steps across month and year ends', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('expands ranges into per-day entries clipped to the window', () => {
    expect(expandClosureDays([THANKS], '2026-11-27', '2026-12-01')).toEqual([{ date: '2026-11-27', label: 'Thanksgiving' }])
    expect(expandClosureDays([THANKS], '2026-11-01', '2026-12-31').map((d) => d.date)).toEqual(['2026-11-26', '2026-11-27'])
  })
})

describe('the US holiday presets (computed, never stored until tapped)', () => {
  const from2026 = holidayPresets('2026-11-09')
  const byKey = Object.fromEntries(from2026.map((p) => [p.key, p]))
  it('2026: Thanksgiving is Thu–Fri Nov 26–27, Christmas Dec 25', () => {
    expect(byKey['thanksgiving-2026']).toMatchObject({ startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' })
    expect(byKey['christmas-2026']).toMatchObject({ startsOn: '2026-12-25', endsOn: '2026-12-25' })
    expect(byKey['veterans-day-2026'].startsOn).toBe('2026-11-11')
  })
  it('2027: the floating holidays land on the right Mondays', () => {
    expect(byKey['new-years-day-2027'].startsOn).toBe('2027-01-01')
    expect(byKey['mlk-day-2027'].startsOn).toBe('2027-01-18')
    expect(byKey['presidents-day-2027'].startsOn).toBe('2027-02-15')
    expect(byKey['memorial-day-2027'].startsOn).toBe('2027-05-31')
    expect(byKey['labor-day-2027'].startsOn).toBe('2027-09-06')
    expect(byKey['columbus-day-2027'].startsOn).toBe('2027-10-11')
  })
  it('2027 Thanksgiving is Nov 25–26 (asked from a year earlier)', () => {
    const early = holidayPresets('2027-01-02')
    expect(early.find((p) => p.key === 'thanksgiving-2027')).toMatchObject({ startsOn: '2027-11-25', endsOn: '2027-11-26' })
  })
  it('spans exactly the next 12 months, soonest first, nothing past or beyond', () => {
    expect(from2026[0].key).toBe('veterans-day-2026')
    expect(from2026.some((p) => p.startsOn < '2026-11-09')).toBe(false)
    expect(from2026.some((p) => p.startsOn >= '2027-11-09')).toBe(false)
    expect(from2026.map((p) => p.startsOn)).toEqual([...from2026.map((p) => p.startsOn)].sort())
  })
  it('a holiday that is under way still offers itself', () => {
    expect(holidayPresets('2026-11-27').some((p) => p.key === 'thanksgiving-2026')).toBe(true)
  })
  it('"the usual holidays" is the dental-office short list', () => {
    const slugs = commonHolidayPresets('2026-11-09').map((p) => p.key.replace(/-\d{4}$/, ''))
    expect(slugs).toEqual(expect.arrayContaining(['thanksgiving', 'christmas', 'new-years-day', 'memorial-day', 'independence-day', 'labor-day']))
    expect(slugs).not.toContain('columbus-day')
  })
})

describe('parseClosureInput', () => {
  it('normalises a single day and trims the label', () => {
    expect(parseClosureInput({ startsOn: '2026-11-27', label: '  Day after   Thanksgiving ' })).toEqual({
      ok: true,
      value: { startsOn: '2026-11-27', endsOn: '2026-11-27', label: 'Day after Thanksgiving' },
    })
  })
  it('refuses the honest-error cases', () => {
    expect(parseClosureInput({ startsOn: '2026-11-27', label: '' })).toMatchObject({ ok: false })
    expect(parseClosureInput({ startsOn: 'nope', label: 'x' })).toMatchObject({ ok: false })
    expect(parseClosureInput({ startsOn: '2026-11-27', endsOn: '2026-11-26', label: 'x' })).toMatchObject({ ok: false })
    expect(parseClosureInput({ startsOn: '2026-01-01', endsOn: '2026-12-31', label: 'x' })).toMatchObject({ ok: false })
    expect(parseClosureInput({ startsOn: '2026-11-27', label: 'x'.repeat(81) })).toMatchObject({ ok: false })
  })
})

describe('next closure + the public hours line', () => {
  it('finds the soonest closure within the window, ongoing ones included', () => {
    const later = { startsOn: '2026-12-25', endsOn: '2026-12-25', label: 'Christmas Day' }
    expect(nextClosure([later, THANKS], '2026-11-20', 14)?.closure.label).toBe('Thanksgiving')
    expect(nextClosure([later], '2026-11-20', 14)).toBeNull()
    expect(nextClosure([THANKS], '2026-11-27', 14)?.startsInDays).toBe(0)
  })
  it('says "Closed Nov 26–27 for Thanksgiving" within 14 days, and "through" once under way', () => {
    expect(upcomingClosureLine([THANKS], '2026-11-20')).toBe('Closed Nov 26–27 for Thanksgiving')
    expect(upcomingClosureLine([THANKS], '2026-11-01')).toBeNull()
    expect(upcomingClosureLine([THANKS], '2026-11-27')).toBe('Closed through Nov 27 for Thanksgiving')
    expect(formatClosureRange({ startsOn: '2026-12-30', endsOn: '2027-01-02' })).toBe('Dec 30 – Jan 2')
  })
})

describe('the digest names a closure once, on a Monday', () => {
  it('names it on the Monday before; says nothing mid-week', () => {
    const monday = digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-23', isMonday: true })
    expect(monday.weekLine).toContain('Thanksgiving (Nov 26–27)')
    expect(digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-24', isMonday: false }).weekLine).toBeNull()
  })
  it('does not repeat it the next Monday once it is past', () => {
    expect(digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-30', isMonday: true }).weekLine).toBeNull()
  })
  it('names the visits still booked on the closed days', () => {
    const n = digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-23', isMonday: true, bookedOnClosure: 2 })
    expect(n.weekLine).toContain('2 visits are still booked')
  })
  it('a closed today is its own line — not a quiet day', () => {
    expect(digestClosureNotes({ closures: [THANKS], todayKey: '2026-11-26', isMonday: false }).todayLine).toContain('closed today for Thanksgiving')
  })
})

describe('GBP special hours are read-only and parsed defensively', () => {
  it('reads closed special-hours entries and skips the rest', () => {
    const snap = {
      hours: [],
      specialHours: [
        { startDate: '2026-12-24', endDate: '2026-12-25', closed: true, label: 'Christmas' },
        { date: '2027-01-01' },
        { startDate: '2026-12-31', closed: false, label: 'Early close' },
        { startDate: 'bad' },
        null,
      ],
    }
    expect(parseGbpSpecialClosures(snap)).toEqual([
      { startsOn: '2026-12-24', endsOn: '2026-12-25', label: 'Christmas' },
      { startsOn: '2027-01-01', endsOn: '2027-01-01', label: null },
    ])
    expect(parseGbpSpecialClosures(null)).toEqual([])
    expect(parseGbpSpecialClosures({ specialHours: 'x' })).toEqual([])
  })
})
