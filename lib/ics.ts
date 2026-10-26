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

/** The length a visit's calendar block falls back to ONLY when the real end
 *  is unknown — the same fallback the portal's authenticated .ics route uses. */
export const DEFAULT_VISIT_MINUTES = 30

/** The practical facts a calendar entry carries about where the visit is. */
export interface VisitIcsClinic {
  name: string
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  phone?: string | null
}

/**
 * The calendar entry for ONE VISIT — the shape the one-click confirm page and
 * the portal's booking success both build inline, mirroring the portal's
 * authenticated .ics route line for line: the REAL end time (a 60-minute root
 * canal is a 60-minute block; +30 only when the end is unknown), the clinic's
 * address as LOCATION so the entry carries directions, and the provider + the
 * phone in DESCRIPTION. Before this each surface hardcoded 30 minutes with no
 * address, so two calendar entries for one appointment disagreed.
 */
export function visitIcsEvent(input: {
  uid: string
  start: Date
  /** The visit's real end; null/undefined → start + DEFAULT_VISIT_MINUTES. */
  end?: Date | null
  summary: string
  clinic?: VisitIcsClinic | null
  providerName?: string | null
}): IcsEvent {
  const end =
    input.end && input.end.getTime() > input.start.getTime()
      ? input.end
      : new Date(input.start.getTime() + DEFAULT_VISIT_MINUTES * 60_000)
  const c = input.clinic
  const location = c
    ? [c.addressLine1, c.city, c.state, c.postalCode].filter(Boolean).join(', ')
    : ''
  const description = [
    input.providerName ? `With ${input.providerName}.` : '',
    c?.phone ? `Questions? Call ${c.name} at ${c.phone}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    uid: input.uid,
    start: input.start,
    end,
    summary: input.summary,
    location: location || null,
    description: description || null,
  }
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

export interface IcsFeedEvent {
  /** Stable per-appointment UID so a client UPDATES the event across refreshes
   *  (and removes it when it drops out of the feed) instead of duplicating. */
  uid: string
  start: Date
  end: Date
  summary: string
  location?: string | null
  description?: string | null
}

/**
 * Build ONE VCALENDAR carrying many events — the subscribable clinic-agenda
 * feed a staff member adds to Google / Apple / Outlook. No per-event VALARM (a
 * subscribed work calendar shouldn't fire a popup for every patient); the named
 * calendar (`X-WR-CALNAME`) shows up as its own toggle in the calendar app.
 */
export function buildIcsFeed(opts: { calendarName: string; events: IcsFeedEvent[] }): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DreamCRM//Clinic Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.calendarName)}`,
    'X-WR-TIMEZONE:UTC',
  ]
  for (const e of opts.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${icsUtcStamp(new Date())}`,
      `DTSTART:${icsUtcStamp(e.start)}`,
      `DTEND:${icsUtcStamp(e.end)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      e.location ? `LOCATION:${icsEscape(e.location)}` : '',
      e.description ? `DESCRIPTION:${icsEscape(e.description)}` : '',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.filter(Boolean).join('\r\n')
}
