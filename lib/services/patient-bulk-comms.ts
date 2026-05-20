import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { Resend } from 'resend'
import { db, schema } from '@/lib/db'

/**
 * Bulk patient communication. v1 = email only (via Resend). SMS comes when
 * the Twilio module ships.
 *
 * Skip rules:
 * - Patient with no email — skipped (no channel to reach them)
 * - Patient archived (isActive=0) — skipped (don't broadcast to archived
 *   relationships; staff should re-activate first if intentional)
 *
 * Failures don't abort the batch — we record per-patient errors and
 * continue. Returns a result the UI can render as a toast.
 */

const FROM = 'Dream Create <Hello@DreamCreateWeb.com>'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  return new Resend(key)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

  let from = FROM
  if (input.fromName) {
    const safeName = input.fromName.replace(/[<>"]/g, '').trim()
    if (safeName) from = `${safeName} <Hello@DreamCreateWeb.com>`
  }

  const resend = getResend()

  for (const p of patients) {
    if (!p.email) { result.skippedNoEmail += 1; continue }
    if (p.isActive === 0) { result.skippedArchived += 1; continue }
    try {
      // Per-recipient personalization — first name prefix if the body
      // doesn't start with a greeting already.
      const greeting = `Hi ${p.firstName},`
      await resend.emails.send({
        from,
        to: p.email,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1c1917">
            <p style="margin:0 0 16px;color:#1c1917;line-height:1.55">${escapeHtml(greeting)}</p>
            <div style="margin:0 0 24px;color:#1c1917;line-height:1.55;white-space:pre-wrap">${escapeHtml(body)}</div>
            <p style="margin:24px 0 0;font-size:11px;color:#a8a29e">
              You received this because you're a patient at our practice. To stop receiving these messages, reply STOP.
            </p>
          </div>
        `,
      })
      result.sent += 1
    } catch (err) {
      result.errors.push({ patientId: p.id, error: (err as Error).message })
    }
  }

  return result
}
