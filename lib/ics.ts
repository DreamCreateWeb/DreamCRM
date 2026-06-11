/**
 * Tiny, dependency-free iCalendar (.ics) builder. Client-safe (pure string
 * math, no `server-only`, no Node APIs) so the public booking widget can build
 * a calendar file in the browser from the confirmation payload it already
 * holds — no unauthenticated appointment lookup, no token, no DB round-trip.
 *
 * The portal has its own auth-scoped .ics ROUTE (it knows the signed-in
 * patient); this module is the shared escaping + serialization layer either
 * side can reuse. Times are emitted as UTC instants (Z); every calendar client
 * renders them in the viewer's local zone.
 */

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines. */
export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Format a Date as a UTC iCal timestamp, e.g. 20260115T143000Z. */
export function icsUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export interface IcsEvent {
  /** Stable UID for the event (so re-imports update rather than duplicate). */
  uid: string
  start: Date
  end: Date
  summary: string
  location?: string | null
  description?: string | null
  /** Reminder lead time in minutes before start (default 1440 = 24h). */
  alarmMinutesBefore?: number
}

/**
 * Build a complete VCALENDAR string for a single event. Lines are CRLF-joined
 * per spec. Empty optional fields are omitted.
 */
export function buildIcs(event: IcsEvent): string {
  const alarmMinutes = event.alarmMinutesBefore ?? 1440
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DreamCRM//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsUtcStamp(new Date())}`,
    `DTSTART:${icsUtcStamp(event.start)}`,
    `DTEND:${icsUtcStamp(event.end)}`,
    `SUMMARY:${icsEscape(event.summary)}`,
    event.location ? `LOCATION:${icsEscape(event.location)}` : '',
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : '',
    'BEGIN:VALARM',
    `TRIGGER:-PT${Math.max(0, Math.round(alarmMinutes))}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(event.summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

/**
 * Encode an .ics string as a `data:` URL suitable for an anchor `download`.
 * `encodeURIComponent` keeps the CRLFs + special chars intact across browsers
 * (a raw base64 of UTF-8 would also work but this stays human-debuggable).
 */
export function icsDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
}
