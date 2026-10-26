import { describe, it, expect } from 'vitest'
import { coercePreferredDateKey, localDateKey } from '@/lib/preferred-date'

/**
 * The inquiry's "preferred date" is free text. The coerce turns the shapes
 * people type into the YYYY-MM-DD key the booking drawer opens on — and
 * returns null for anything it is not sure of, since a wrong guess seeded
 * into a date field is worse than no seed. `now` is passed so the tests do
 * not depend on the clock.
 */
const NOW = new Date(2026, 9, 26, 10, 0, 0) // Mon Oct 26 2026, local

describe('coercePreferredDateKey', () => {
  it('reads ISO, US numeric and month-name shapes', () => {
    expect(coercePreferredDateKey('2026-11-03', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('11/03/2026', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('11/3/26', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('11-3-2026', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('Nov 3', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('November 3rd, 2026', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('nov. 3 2026', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('3 November 2026', NOW)).toBe('2026-11-03')
    expect(coercePreferredDateKey('  2026-11-03 morning ', NOW)).toBe('2026-11-03')
  })

  it('a month-name date with no year is its next occurrence', () => {
    // Already past this year → next year.
    expect(coercePreferredDateKey('Jan 5', NOW)).toBe('2027-01-05')
    // Today itself still counts.
    expect(coercePreferredDateKey('Oct 26', NOW)).toBe('2026-10-26')
  })

  it('returns null for a day already gone', () => {
    expect(coercePreferredDateKey('10/25/2026', NOW)).toBeNull()
    expect(coercePreferredDateKey('2020-01-01', NOW)).toBeNull()
    expect(coercePreferredDateKey('Jan 5, 2026', NOW)).toBeNull()
  })

  it('never guesses at day words, prose, or impossible dates', () => {
    for (const text of ['next tuesday', 'asap', 'whenever works', 'the 3rd', '2026-02-30', '13/40/2026', '', null, undefined]) {
      expect(coercePreferredDateKey(text, NOW), String(text)).toBeNull()
    }
  })

  it('localDateKey reads the browser’s calendar day', () => {
    expect(localDateKey(NOW)).toBe('2026-10-26')
  })
})
