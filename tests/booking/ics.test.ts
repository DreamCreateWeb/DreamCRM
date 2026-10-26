/**
 * Unit tests for the dependency-free .ics builder used by the public booking
 * widget's success screen (inline data URL — no unauthenticated appointment
 * lookup). Covers RFC 5545 escaping, UTC stamping, alarm, optional-field
 * omission, and the data-URL encoding.
 */
import { describe, it, expect } from 'vitest'
import { icsEscape, icsUtcStamp, buildIcs, icsDataUrl, buildIcsFeed, visitIcsEvent, DEFAULT_VISIT_MINUTES } from '@/lib/ics'

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

describe('buildIcsFeed', () => {
  const ev = (uid: string, summary: string) => ({
    uid,
    start: new Date('2026-02-01T15:00:00.000Z'),
    end: new Date('2026-02-01T15:30:00.000Z'),
    summary,
  })

  it('wraps many VEVENTs in ONE named VCALENDAR', () => {
    const ics = buildIcsFeed({
      calendarName: 'Acme — Appointments',
      events: [ev('a@x', 'Cleaning · Mia Hayes'), ev('b@x', 'Checkup · Liam Reyes')],
    })
    expect(ics.match(/BEGIN:VCALENDAR/g) ?? []).toHaveLength(1)
    expect(ics.match(/END:VCALENDAR/g) ?? []).toHaveLength(1)
    expect(ics.match(/BEGIN:VEVENT/g) ?? []).toHaveLength(2)
    expect(ics).toContain('X-WR-CALNAME:Acme — Appointments')
    expect(ics).toContain('UID:a@x')
    expect(ics).toContain('UID:b@x')
    expect(ics).toContain('SUMMARY:Cleaning · Mia Hayes')
  })

  it('does NOT add a per-event VALARM (subscribed work calendar)', () => {
    const ics = buildIcsFeed({ calendarName: 'C', events: [ev('a@x', 'X')] })
    expect(ics).not.toContain('BEGIN:VALARM')
  })

  it('omits LOCATION/DESCRIPTION when absent and escapes when present', () => {
    const ics = buildIcsFeed({
      calendarName: 'C',
      events: [
        { ...ev('a@x', 'X'), location: '5 A St, Austin, TX', description: 'Provider: Dr. Lee; note' },
        ev('b@x', 'Y'),
      ],
    })
    expect(ics).toContain('LOCATION:5 A St\\, Austin\\, TX')
    expect(ics).toContain('DESCRIPTION:Provider: Dr. Lee\\; note')
    // The second event carries no LOCATION/DESCRIPTION → only one of each total.
    expect(ics.split('\r\n').filter((l) => l.startsWith('LOCATION:'))).toHaveLength(1)
    expect(ics.split('\r\n').filter((l) => l.startsWith('DESCRIPTION:'))).toHaveLength(1)
  })

  it('handles an empty agenda (valid empty calendar)', () => {
    const ics = buildIcsFeed({ calendarName: 'Empty', events: [] })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})

describe('icsDataUrl', () => {
  it('produces a text/calendar data URL with the encoded payload', () => {
    const url = icsDataUrl('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
    expect(url.startsWith('data:text/calendar;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.split(',').slice(1).join(','))).toContain('BEGIN:VCALENDAR')
  })
})

/**
 * visitIcsEvent — the ONE shape the one-click confirm page and the portal's
 * booking success build inline. Both used to hardcode a 30-minute block with
 * no address, so a 60-minute root canal downloaded from the reminder's
 * confirm page disagreed with the same visit downloaded inside the portal
 * (whose authenticated .ics route had the real end + LOCATION all along).
 */
describe('visitIcsEvent', () => {
  const start = new Date('2026-01-15T14:00:00.000Z')
  const clinic = {
    name: 'Acme Dental',
    addressLine1: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    phone: '(555) 555-0100',
  }

  it('uses the REAL end time when it is known (a 60-minute visit is a 60-minute block)', () => {
    const ev = visitIcsEvent({
      uid: 'u', start, end: new Date('2026-01-15T15:00:00.000Z'), summary: 'Root canal at Acme Dental',
    })
    expect(buildIcs(ev)).toContain('DTEND:20260115T150000Z')
  })

  it('falls back to +30 minutes ONLY when the end is unknown or nonsensical', () => {
    expect(DEFAULT_VISIT_MINUTES).toBe(30)
    for (const end of [null, undefined, start, new Date(start.getTime() - 60_000)]) {
      const ev = visitIcsEvent({ uid: 'u', start, end, summary: 'Visit' })
      expect(ev.end.getTime() - start.getTime()).toBe(30 * 60_000)
    }
  })

  it('carries the clinic address as LOCATION and the provider + phone in DESCRIPTION — the same lines the portal route writes', () => {
    const ics = buildIcs(visitIcsEvent({ uid: 'u', start, summary: 'Cleaning', clinic, providerName: 'Dr. Reyes' }))
    expect(ics).toContain('LOCATION:123 Main St\\, Springfield\\, IL\\, 62701')
    expect(ics).toContain('DESCRIPTION:With Dr. Reyes. Questions? Call Acme Dental at (555) 555-0100.')
  })

  it('omits LOCATION and the event DESCRIPTION when nothing is on file (no empty lines, no "Call  at")', () => {
    // (The VALARM carries its own DESCRIPTION line by spec; the EVENT's is what
    // must stay empty here.)
    for (const clinic of [{ name: 'Acme Dental' }, null, undefined]) {
      const ev = visitIcsEvent({ uid: 'u', start, summary: 'Cleaning', clinic })
      expect(ev.location).toBeNull()
      expect(ev.description).toBeNull()
      const ics = buildIcs(ev)
      expect(ics).not.toContain('LOCATION:')
      expect(ics).not.toContain('Call ')
    }
  })
})
