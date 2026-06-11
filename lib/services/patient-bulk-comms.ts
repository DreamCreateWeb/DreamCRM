import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { sendPatientMessageEmail } from '@/lib/email'
import { getClinicSenderIdentity } from './clinic-sender'

/**
 * Bulk patient communication. v1 = email only. These are 1:1 staff→patient
 * messages (not marketing blasts), so they go through the SAME delivery path as
 * a Patient Communications email reply — `sendPatientMessageEmail` →
 * `deliver()` in lib/email.ts — which:
 *   - sends FROM the clinic's sender identity (Tier 1 display name on the
 *     verified domain, or the connected Gmail at Tier 2), with Reply-To = the
 *     clinic's contact inbox so a patient reply reaches the clinic, not a dead
 *     platform mailbox;
 *   - inspects Resend's `{ error }` return and THROWS on a real failure (the
 *     Resend SDK doesn't throw), so a failed send is recorded, never silently
 *     counted as sent.
 *
 * Skip rules (unchanged):
 * - Patient with no email — skipped (no channel to reach them)
 * - Patient archived (isActive=0) — skipped (don't broadcast to archived
 *   relationships; staff should re-activate first if intentional)
 *
 * Failures don't abort the batch — we record per-patient errors and
 * continue. Returns a result the UI can render as a toast.
 *
 * Note: these are direct 1:1 messages, so no RFC-8058 List-Unsubscribe header
 * (that's for marketing blasts — see lib/services/marketing-send.ts).
 */

export interface BulkEmailInput {
  organizationId: string
  patientIds: string[]
  subject: string
  body: string
  /** Display name for the From line — defaults to the clinic display name. */
  fromName?: string
}

export interface BulkEmailResult {
  attempted: number
  sent: number
  skippedNoEmail: number
  skippedArchived: number
  errors: Array<{ patientId: string; error: string }>
}

export async function sendBulkPatientEmail(input: BulkEmailInput): Promise<BulkEmailResult> {
  const result: BulkEmailResult = {
    attempted: input.patientIds.length,
    sent: 0,
    skippedNoEmail: 0,
    skippedArchived: 0,
    errors: [],
  }

  if (input.patientIds.length === 0) return result
  const subject = input.subject.trim() || '(no subject)'
  const body = input.body.trim()

  const patients = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      isActive: schema.patient.isActive,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, input.organizationId),
        inArray(schema.patient.id, input.patientIds),
      ),
    )

  // Resolve the clinic sender identity once for the whole batch — FROM header,
  // deliverable Reply-To, and any Tier-2 Gmail routing.
  const sender = await getClinicSenderIdentity(input.organizationId)
  const fromName = input.fromName?.trim() || sender.name
  const clinicName = fromName

  for (const p of patients) {
    if (!p.email) { result.skippedNoEmail += 1; continue }
    if (p.isActive === 0) { result.skippedArchived += 1; continue }
    try {
      await sendPatientMessageEmail({
        to: p.email,
        patientFirstName: p.firstName,
        clinicName,
        body: `${subject ? `${subject}\n\n` : ''}${body}`.trim(),
        from: sender.from,
        replyTo: sender.replyTo,
        gmail: sender.gmail,
      })
      result.sent += 1
    } catch (err) {
      result.errors.push({ patientId: p.id, error: (err as Error).message })
    }
  }

  return result
}
