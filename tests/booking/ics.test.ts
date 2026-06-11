/**
 * Unit tests for the dependency-free .ics builder used by the public booking
 * widget's success screen (inline data URL — no unauthenticated appointment
 * lookup). Covers RFC 5545 escaping, UTC stamping, alarm, optional-field
 * omission, and the data-URL encoding.
 */
import { describe, it, expect } from 'vitest'
import { icsEscape, icsUtcStamp, buildIcs, icsDataUrl } from '@/lib/ics'

describe('icsEscape', () => {
  it('escapes backslash, semicolon, comma, and newlines per RFC 5545', () => {
    expect(icsEscape('a, b; c\\d')).toBe('a\\, b\\; c\\\\d')
    expect(icsEscape('line1\nline2')).toBe('line1\\nline2')
    expect(icsEscape('line1\r\nline2')).toBe('line1\\nline2')
  })
})

describe('icsUtcStamp', () => {
  it('formats a Date as a compact UTC iCal timestamp', () => {
    expect(icsUtcStamp(new Date('2026-01-15T14:30:00.000Z'))).toBe('20260115T143000Z')
  })
})

describe('buildIcs', () => {
  const base = {
    uid: 'booking-1@dreamcreatestudio.com',
    start: new Date('2026-01-15T14:00:00.000Z'),
    end: new Date('2026-01-15T14:30:00.000Z'),
    summary: 'Cleaning at Acme Dental',
  }

  it('emits a complete VCALENDAR/VEVENT with start, end, summary', () => {
    const ics = buildIcs(base)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('UID:booking-1@dreamcreatestudio.com')
    expect(ics).toContain('DTSTART:20260115T140000Z')
    expect(ics).toContain('DTEND:20260115T143000Z')
    expect(ics).toContain('SUMMARY:Cleaning at Acme Dental')
  })

  it('joins lines with CRLF per spec', () => {
    expect(buildIcs(base)).toContain('\r\n')
  })

  it('defaults to a 24h (1440-minute) reminder alarm', () => {
    expect(buildIcs(base)).toContain('TRIGGER:-PT1440M')
  })

  it('honors a custom alarm lead time', () => {
    expect(buildIcs({ ...base, alarmMinutesBefore: 60 })).toContain('TRIGGER:-PT60M')
  })

  it('includes LOCATION + DESCRIPTION when provided, escaped', () => {
    const ics = buildIcs({
      ...base,
      location: '123 Main St, Springfield, IL',
      description: 'With Dr. Reyes; bring your card',
    })
    expect(ics).toContain('LOCATION:123 Main St\\, Springfield\\, IL')
    expect(ics).toContain('DESCRIPTION:With Dr. Reyes\\; bring your card')
  })

  it('omits the event LOCATION + DESCRIPTION when null/absent (only the VALARM DESCRIPTION remains)', () => {
    const ics = buildIcs({ ...base, location: null, description: null })
    expect(ics).not.toContain('LOCATION:')
    // The VALARM always carries one DESCRIPTION (the summary); the event-level
    // DESCRIPTION must be omitted, so exactly one DESCRIPTION line remains.
    const descLines = ics.split('\r\n').filter((l) => l.startsWith('DESCRIPTION:'))
    expect(descLines).toHaveLength(1)
  })
})

describe('icsDataUrl', () => {
  it('produces a text/calendar data URL with the encoded payload', () => {
    const url = icsDataUrl('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
    expect(url.startsWith('data:text/calendar;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.split(',').slice(1).join(','))).toContain('BEGIN:VCALENDAR')
  })
})
