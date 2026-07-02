import 'server-only'
import { and, eq, gte, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { sendMessageToPatient } from '@/lib/services/patient-messaging'
import {
  BROADCAST_BODY_MAX,
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_SEGMENTS,
  type BroadcastSegmentKey,
} from '@/lib/types/broadcast'

/**
 * Broadcast messaging — one staff-written message to a quick operational
 * segment, delivered as email AND recorded in each patient's /messages
 * thread (via the normal sendMessageToPatient rails), so replies come back
 * to the inbox and the conversation history shows what the office said.
 * See lib/types/broadcast.ts for the segment registry + rationale.
 */

export interface BroadcastRecipient {
  patientId: string
  firstName: string
  email: string
}

/** Resolve a segment to its recipients (deduped; active patients with an
 *  email only). Visit windows use CLINIC-LOCAL day boundaries. */
export async function resolveBroadcastRecipients(
  organizationId: string,
  segment: BroadcastSegmentKey,
  now: Date = new Date(),
): Promise<BroadcastRecipient[]> {
  if (segment === 'all_active') {
    const rows = await db
      .select({
        patientId: schema.patient.id,
        firstName: schema.patient.firstName,
        email: schema.patient.email,
      })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          eq(schema.patient.isActive, 1),
          isNull(schema.patient.mergedIntoPatientId),
          isNotNull(schema.patient.email),
          ne(schema.patient.email, ''),
          // Practice-wide notices ride the marketing opt-in — patients who
          // opted out of "hearing from us" don't get the megaphone.
          eq(schema.patient.marketingEmailOptIn, 1),
        ),
      )
    return rows
      .filter((r): r is typeof r & { email: string } => !!r.email)
      .map((r) => ({ patientId: r.patientId, firstName: r.firstName, email: r.email }))
  }

  const tz = await getClinicTimeZone(organizationId)
  let windowStart: Date
  let windowEnd: Date
  if (segment === 'visits_today') {
    windowStart = clinicDayStart(now, tz, 0)
    windowEnd = clinicDayStart(now, tz, 1)
  } else if (segment === 'visits_tomorrow') {
    windowStart = clinicDayStart(now, tz, 1)
    windowEnd = clinicDayStart(now, tz, 2)
  } else {
    windowStart = now
    windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  }

  const rows = await db
    .select({
      patientId: schema.patient.id,
      firstName: schema.patient.firstName,
      email: schema.patient.email,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        inArray(schema.appointment.status, ['scheduled', 'confirmed']),
        gte(schema.appointment.startTime, windowStart),
        lt(schema.appointment.startTime, windowEnd),
        eq(schema.patient.isActive, 1),
        isNotNull(schema.patient.email),
        ne(schema.patient.email, ''),
      ),
    )

  // A patient with two visits in the window is still one recipient.
  const seen = new Set<string>()
  const out: BroadcastRecipient[] = []
  for (const r of rows) {
    if (!r.email || seen.has(r.patientId)) continue
    seen.add(r.patientId)
    out.push({ patientId: r.patientId, firstName: r.firstName, email: r.email })
  }
  return out
}

/** Recipient counts for every segment — powers the picker in the modal. */
export async function previewBroadcastCounts(
  organizationId: string,
  now: Date = new Date(),
): Promise<Record<BroadcastSegmentKey, number>> {
  const counts = {} as Record<BroadcastSegmentKey, number>
  for (const s of BROADCAST_SEGMENTS) {
    counts[s.key] = (await resolveBroadcastRecipients(organizationId, s.key, now)).length
  }
  return counts
}

export interface BroadcastResult {
  ok: true
  attempted: number
  sent: number
  failed: number
  errors: Array<{ patientId: string; error: string }>
}

/**
 * Send a broadcast. Each recipient gets the message through the normal
 * outbound rails (email delivered first, thread row recorded on success) —
 * failures are isolated per patient and reported, never aborting the batch.
 */
export async function sendBroadcast(input: {
  organizationId: string
  segment: BroadcastSegmentKey
  body: string
  sentByUserId: string
  now?: Date
}): Promise<BroadcastResult | { ok: false; error: string }> {
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Write the message first.' }
  if (body.length > BROADCAST_BODY_MAX) {
    return { ok: false, error: `Keep it under ${BROADCAST_BODY_MAX.toLocaleString()} characters — broadcasts work best short.` }
  }

  const recipients = await resolveBroadcastRecipients(
    input.organizationId,
    input.segment,
    input.now ?? new Date(),
  )
  if (recipients.length === 0) {
    return { ok: false, error: 'No one matches that segment right now.' }
  }
  if (recipients.length > BROADCAST_MAX_RECIPIENTS) {
    return {
      ok: false,
      error: `That's ${recipients.length.toLocaleString()} people — for a send this size, use a Recall & Outreach campaign (it adds the unsubscribe footer and tracking a big send needs).`,
    }
  }

  const result: BroadcastResult = { ok: true, attempted: recipients.length, sent: 0, failed: 0, errors: [] }
  for (const r of recipients) {
    try {
      await sendMessageToPatient({
        organizationId: input.organizationId,
        patientId: r.patientId,
        body,
        channel: 'email',
        sentByUserId: input.sentByUserId,
      })
      result.sent++
    } catch (err) {
      result.failed++
      result.errors.push({ patientId: r.patientId, error: err instanceof Error ? err.message : 'unknown' })
    }
  }
  return result
}
