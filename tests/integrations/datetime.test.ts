import { describe, it, expect } from 'vitest'
import { parseOdDateTime, formatOdDateTime, formatOdDate } from '@/lib/services/pms/datetime'

// Open Dental datetimes are office-local wall-clock with no timezone. These
// must convert against the clinic's IANA zone, DST-aware — the silent-offset
// bug the sandbox caught.

describe('parseOdDateTime (office wall-clock → absolute instant)', () => {
  it('parses summer EDT (UTC-4)', () => {
    expect(parseOdDateTime('2026-07-01 09:00:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z')
  })
  it('parses winter EST (UTC-5)', () => {
    expect(parseOdDateTime('2026-01-01 09:00:00', 'America/New_York').toISOString()).toBe('2026-01-01T14:00:00.000Z')
  })
  it('parses UTC as-is', () => {
    expect(parseOdDateTime('2026-07-01 09:00:00', 'UTC').toISOString()).toBe('2026-07-01T09:00:00.000Z')
  })
  it('accepts a T separator', () => {
    expect(parseOdDateTime('2026-07-01T09:00:00', 'UTC').toISOString()).toBe('2026-07-01T09:00:00.000Z')
  })
})

describe('formatOdDateTime (absolute instant → office wall-clock)', () => {
  it('formats into EDT', () => {
    expect(formatOdDateTime(new Date('2026-07-01T13:00:00Z'), 'America/New_York')).toBe('2026-07-01 09:00:00')
  })
  it('formats into EST', () => {
    expect(formatOdDateTime(new Date('2026-01-01T14:00:00Z'), 'America/New_York')).toBe('2026-01-01 09:00:00')
  })
  it('round-trips through a different zone', () => {
    const tz = 'America/Chicago'
    const wall = '2026-03-15 14:30:00'
    expect(formatOdDateTime(parseOdDateTime(wall, tz), tz)).toBe(wall)
  })
  it('formatOdDate returns the date portion in zone', () => {
    // 02:00 UTC on the 2nd is still the 1st (21:00) in New York.
    expect(formatOdDate(new Date('2026-07-02T02:00:00Z'), 'America/New_York')).toBe('2026-07-01')
  })
})
