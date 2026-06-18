import 'server-only'
import { randomBytes } from 'crypto'
import { and, eq, gte, lte, notInArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appointment, patient, clinicProvider } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { buildIcsFeed, type IcsFeedEvent } from '@/lib/ics'

/**
 * Subscribable read-only calendar feed — a tokenized .ics URL a clinic adds to
 * Google / Apple / Outlook to see its live agenda in the calendar app it already
 * uses. No Google OAuth or app-verification needed (that's the API-push v2); the
 * opaque token in the URL is the auth, so it's a long random secret that can be
 * rotated to revoke old subscriptions. One feed per clinic (the whole agenda).
 */

const FEED_PAST_DAYS = 14
const FEED_FUTURE_DAYS = 120
const SLOT_MS = 30 * 60 * 1000

function newFeedToken(): string {
  return randomBytes(24).toString('hex') // 48 hex chars
}

/** Generate (or ROTATE) the org's feed token. Rotating revokes old URLs. */
export async function generateCalendarFeedToken(organizationId: string): Promise<string> {
  const token = newFeedToken()
  await db
    .update(clinicProfile)
    .set({ calendarFeedToken: token, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, organizationId))
  return token
}

/** Turn the feed off (revoke the token entirely). */
export async function clearCalendarFeedToken(organizationId: string): Promise<void> {
  await db
    .update(clinicProfile)
    .set({ calendarFeedToken: null, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, organizationId))
}

/** The org's current feed token (for the settings card), or null when off. */
export async function getCalendarFeedToken(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: clinicProfile.calendarFeedToken })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return row?.token ?? null
}

function titleCase(s: string): string {
  const t = s.replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Visit'
}

function addressOneLine(p: {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
}): string | null {
  const cityState = [p.city, p.state].filter(Boolean).join(', ')
  const parts = [p.addressLine1, p.addressLine2, cityState, p.postalCode].filter((x) => x && x.trim())
  return parts.length ? parts.join(', ') : null
}

/**
 * Build the clinic agenda .ics feed for a token. Resolves the org BY the opaque
 * token, loads the appointment window, and returns the serialized feed. Returns
 * null for an unknown token (the route 404s — never reveal whether a token
 * exists). Cancelled / no-show visits are excluded so the calendar stays clean.
 */
export async function buildClinicCalendarFeed(
  token: string,
): Promise<{ ics: string; filename: string; calendarName: string } | null> {
  if (!token || token.length < 16) return null
  const [clinic] = await db
    .select({
      organizationId: clinicProfile.organizationId,
      displayName: clinicProfile.displayName,
      addressLine1: clinicProfile.addressLine1,
      addressLine2: clinicProfile.addressLine2,
      city: clinicProfile.city,
      state: clinicProfile.state,
      postalCode: clinicProfile.postalCode,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.calendarFeedToken, token))
    .limit(1)
  if (!clinic) return null

  const now = Date.now()
  const rows = await db
    .select({
      id: appointment.id,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      type: appointment.type,
      notes: appointment.notes,
      patientFirst: patient.firstName,
      patientLast: patient.lastName,
      providerName: clinicProvider.displayName,
    })
    .from(appointment)
    .innerJoin(patient, eq(appointment.patientId, patient.id))
    .leftJoin(clinicProvider, eq(appointment.providerId, clinicProvider.id))
    .where(
      and(
        eq(appointment.organizationId, clinic.organizationId),
        gte(appointment.startTime, new Date(now - FEED_PAST_DAYS * 86_400_000)),
        lte(appointment.startTime, new Date(now + FEED_FUTURE_DAYS * 86_400_000)),
        notInArray(appointment.status, ['cancelled', 'no_show']),
      ),
    )
    .orderBy(appointment.startTime)
    .limit(3000)

  const location = addressOneLine(clinic)
  const events: IcsFeedEvent[] = rows.map((r) => {
    const start = r.startTime
    const end = r.endTime ?? new Date(start.getTime() + SLOT_MS)
    const name = `${r.patientFirst} ${r.patientLast}`.trim()
    const descParts = [r.providerName ? `Provider: ${r.providerName}` : '', r.notes ?? ''].filter(Boolean)
    return {
      uid: `appt-${r.id}@dreamcreatestudio.com`,
      start,
      end,
      summary: `${titleCase(r.type ?? 'Visit')} · ${name}`.trim(),
      location,
      description: descParts.length ? descParts.join('\n') : null,
    }
  })

  const calendarName = `${clinic.displayName || 'Clinic'} — Appointments`
  return { ics: buildIcsFeed({ calendarName, events }), filename: 'dreamcrm-appointments.ics', calendarName }
}
