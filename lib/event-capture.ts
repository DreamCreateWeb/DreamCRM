/**
 * The conference capture kit — PURE core (docs/marketing-engine.md Part
 * 10.8, the Arkansas beachhead; M1 slice 1). Client-safe on purpose: the
 * phone-first capture form, the attendee's delivery page, the platform's
 * Events tab and the service all share these shapes and rules.
 *
 * What a capture IS: one attendee met on a conference floor — name, email,
 * practice — who asked for a free professional headshot. The headshot is
 * TRANSACTIONAL (they asked for it); everything after it is CONSENT:
 *  - the photo release is required (we can't deliver a photo we may not
 *    keep), captured as a timestamp, never a pre-ticked box;
 *  - the marketing opt-in is OPTIONAL and unticked by default. "No" is
 *    honored at the machine level (a suppression row + resolved nurture
 *    stamps), not by a human remembering.
 *
 * What rides along: the Practice Scan, pre-run from the practice name at
 * capture time, so the delivery email carries a report card — the elevator
 * pitch with the practice's own numbers in it.
 */

import { ASSOCIATION_UTM_SOURCE, campaignKeyOf } from './marketing-attribution'

/** Who the attendee is at the practice — shapes the follow-up voice later. */
export const CAPTURE_ROLES = ['dentist', 'hygienist', 'front_office', 'office_manager', 'other'] as const
export type CaptureRole = (typeof CAPTURE_ROLES)[number]

export const CAPTURE_ROLE_LABELS: Record<CaptureRole, string> = {
  dentist: 'Dentist',
  hygienist: 'Hygienist',
  front_office: 'Front office',
  office_manager: 'Office manager',
  other: 'Other',
}

export function isCaptureRole(v: unknown): v is CaptureRole {
  return typeof v === 'string' && (CAPTURE_ROLES as readonly string[]).includes(v)
}

/** A capture's lifecycle — the photo is the only thing that can be missing. */
export type CaptureStatus = 'awaiting_photo' | 'delivered'

export function captureStatusOf(c: { photoUrl: string | null; deliveredAt: Date | string | null }): CaptureStatus {
  return c.photoUrl && c.deliveredAt ? 'delivered' : 'awaiting_photo'
}

/** Field caps — the form is typed on a phone by a stranger; nothing here
 *  should be able to bloat a row or an email subject. */
export const CAPTURE_NAME_MAX = 80
export const CAPTURE_PRACTICE_MAX = 200
export const CAPTURE_EMAIL_MAX = 200
export const CAPTURE_CITY_MAX = 100

/** Event slug rules: 'asda-2026' — lowercase, [a-z0-9-], 3..40. The slug IS
 *  the attribution campaign key, so it must already be a valid one. */
export const EVENT_SLUG_MIN = 3
export const EVENT_SLUG_MAX = 40
export function isEventSlug(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length >= EVENT_SLUG_MIN &&
    v.length <= EVENT_SLUG_MAX &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) &&
    campaignKeyOf(v) === v
  )
}

/** Suggest a slug from an event name + year ('ASDA Annual Session' + 2026 →
 *  'asda-annual-session-2026'). Purely a convenience; the owner can edit. */
export function suggestEventSlug(name: string, year: number): string {
  const base = campaignKeyOf(name).slice(0, EVENT_SLUG_MAX - 5)
  const slug = `${base || 'event'}-${year}`.replace(/-{2,}/g, '-')
  return slug.slice(0, EVENT_SLUG_MAX)
}

export interface CaptureInput {
  firstName: string
  lastName: string
  email: string
  practiceName: string
  role: CaptureRole
  city: string | null
  /** The photo release — required; the checkbox must be ticked. */
  photoRelease: boolean
  /** The marketing opt-in — optional, unticked by default. */
  optIn: boolean
}

export type CaptureValidation = { ok: true; value: CaptureInput } | { ok: false; error: string }

/**
 * Validate a raw submission into a CaptureInput. Total: every path returns
 * either a capped, trimmed value or ONE plain-language error (the form shows
 * exactly one, to a person standing in a hallway). Email deliverability is
 * the service's job (it has the parser); this checks shape only.
 */
export function validateCapture(raw: Record<string, unknown>): CaptureValidation {
  const str = (k: string, max: number) => {
    const v = raw[k]
    return typeof v === 'string' ? v.trim().slice(0, max) : ''
  }
  const bool = (k: string) => {
    const v = raw[k]
    return v === true || v === 'on' || v === 'true' || v === '1'
  }
  const firstName = str('firstName', CAPTURE_NAME_MAX)
  const lastName = str('lastName', CAPTURE_NAME_MAX)
  const email = str('email', CAPTURE_EMAIL_MAX).toLowerCase()
  const practiceName = str('practiceName', CAPTURE_PRACTICE_MAX)
  const roleRaw = str('role', 40)
  const city = str('city', CAPTURE_CITY_MAX) || null
  const photoRelease = bool('photoRelease')
  const optIn = bool('optIn')

  if (!firstName) return { ok: false, error: 'Add a first name.' }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: 'That email doesn’t look right — it’s where the headshot goes.' }
  if (!practiceName) return { ok: false, error: 'Add the practice name — the free scan runs from it.' }
  const role: CaptureRole = isCaptureRole(roleRaw) ? roleRaw : 'other'
  if (!photoRelease) return { ok: false, error: 'The photo release has to be ticked before we can send a headshot.' }

  return { ok: true, value: { firstName, lastName, email, practiceName, role, city, photoRelease, optIn } }
}

/** Where the headshot bytes live in the bucket: one folder per event. */
export function headshotObjectPath(eventSlug: string, captureId: string, contentType: string): string {
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  return `events/${eventSlug}/${captureId}.${ext}`
}

/** Photo caps for the capture form — a phone JPEG after the client-side
 *  downscale is 1–3 MB; the server-action body limit is 10 MB. */
export const HEADSHOT_MAX_BYTES = 8 * 1024 * 1024
export const HEADSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Tag a marketing-site URL with the event's attribution. */
export function eventTaggedUrl(base: string, path: string, eventSlug: string, medium = 'email'): string {
  const root = base.replace(/\/+$/, '')
  const sep = path.includes('?') ? '&' : '?'
  return `${root}${path}${sep}utm_source=${ASSOCIATION_UTM_SOURCE}&utm_medium=${medium}&utm_campaign=${encodeURIComponent(eventSlug)}`
}

// ── The delivery email (code-owned copy; the service renders it) ────────────

export interface DeliveryCopyInput {
  firstName: string
  eventName: string
  organizer: string | null
  practiceName: string
  /** Null when the scan didn't run (no result to name — say nothing). */
  grade: { letter: string | null; overall: number | null } | null
  optIn: boolean
}

export function deliverySubject(i: { eventName: string }): string {
  return `Your headshot from ${i.eventName}`
}

/** The one line the report earns in the email — honest: a null scan is
 *  silence, not "we couldn't find you". */
export function scanLine(i: DeliveryCopyInput): string | null {
  if (!i.grade) return null
  if (i.grade.letter && i.grade.overall != null) {
    return `While we were at it, we ran ${i.practiceName}’s free online scan — it graded ${i.grade.letter} (${i.grade.overall}/100). The full report shows what a patient searching right now actually sees.`
  }
  return `While we were at it, we ran ${i.practiceName}’s free online scan. The full report shows what a patient searching right now actually sees.`
}

/** The consent footnote — says out loud which box they ticked. */
export function consentFootnote(i: { optIn: boolean; organizer: string | null }): string {
  const who = i.organizer ? `${i.organizer}’s web partner, Dream Create` : 'Dream Create'
  return i.optIn
    ? `You said yes to hearing from ${who} about DreamCRM — a note now and then, never a flood, and every one carries a one-click unsubscribe.`
    : `You asked us not to follow up, and we won’t — this headshot is the only email you’ll get from ${who}.`
}
