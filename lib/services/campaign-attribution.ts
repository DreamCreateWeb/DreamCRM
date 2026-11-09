import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

/**
 * "BOOKED BACK" — the outcome of an outreach send, minted where bookings are
 * born (G3-11). ONE helper, ONE window, three doors: the desk
 * (createInternalAppointment), the public site + patient portal
 * (insertAppointmentIfBookable) and the PMS delta sync (a NEW row that is not
 * a backfill; 'pms_import' history is never an outcome).
 *
 * A booking is credited to the patient's most recent 'sent' or 'click' event
 * from this clinic's campaigns within ATTRIBUTION_WINDOW_DAYS BEFORE the
 * booking was made. Timestamps, not day keys. At most ONE 'booked' row per
 * appointment (idempotent); the funnel still counts distinct people per
 * campaign. This counts BOOKED back — "new patients" means SEATED.
 */
export const ATTRIBUTION_WINDOW_DAYS = 30
/** The words the hub shows next to the number. */
export const ATTRIBUTION_WINDOW_COPY = `booked within ${ATTRIBUTION_WINDOW_DAYS} days of the note`

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The one statement. INSERT … SELECT … WHERE NOT EXISTS keeps it a single
 * round trip and idempotent: a second call for the same appointment inserts
 * nothing. Every read is org-scoped through campaigns.organization_id, and
 * every bound parameter carries an explicit cast (drizzle binds untyped).
 */
export function buildAttributionStatement(
  orgId: string,
  appointmentId: string,
  patientId: string,
  bookedAt: Date,
) {
  const windowStart = new Date(bookedAt.getTime() - ATTRIBUTION_WINDOW_DAYS * DAY_MS)
  return sql`
    INSERT INTO campaign_events
      (campaign_id, recipient_email, patient_id, booked_appointment_id, booked_at, type, occurred_at, meta)
    SELECT src.campaign_id, src.recipient_email, ${patientId}::text, ${appointmentId}::text,
           ${bookedAt.toISOString()}::timestamptz, 'booked', ${bookedAt.toISOString()}::timestamptz, '{}'::jsonb
    FROM (
      SELECT ce.campaign_id, ce.recipient_email
      FROM campaign_events ce
      JOIN campaigns c ON c.id = ce.campaign_id
      WHERE c.organization_id = ${orgId}::text
        AND ce.patient_id = ${patientId}::text
        AND ce.type IN ('sent', 'click')
        AND ce.occurred_at <= ${bookedAt.toISOString()}::timestamptz
        AND ce.occurred_at >= ${windowStart.toISOString()}::timestamptz
      ORDER BY ce.occurred_at DESC, ce.id DESC
      LIMIT 1
    ) src
    WHERE NOT EXISTS (
      SELECT 1 FROM campaign_events b
      JOIN campaigns bc ON bc.id = b.campaign_id
      WHERE bc.organization_id = ${orgId}::text
        AND b.type = 'booked'
        AND b.booked_appointment_id = ${appointmentId}::text
    )
    ON CONFLICT DO NOTHING
  `
}

/**
 * Credit a new booking to the campaign that brought the patient back.
 * Best-effort BY CONTRACT: never throws, never fails the booking.
 */
export async function attributeBookingToCampaign(
  orgId: string,
  appointmentId: string,
  patientId: string,
  bookedAt: Date = new Date(),
): Promise<void> {
  try {
    await db.execute(buildAttributionStatement(orgId, appointmentId, patientId, bookedAt))
  } catch (err) {
    console.warn('[campaign-attribution] skipped:', err instanceof Error ? err.message : err)
  }
}
