'use server'

import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db, schema } from '@/lib/db'
import { sendPatientPortalInviteEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { requireTenant } from '@/lib/auth/context'
import {
  createPatient,
  updatePatient,
  archivePatient,
  type CreatePatientInput,
  type PatientSource,
} from '@/lib/services/patients'
import { sendBulkPatientEmail, type BulkEmailResult } from '@/lib/services/patient-bulk-comms'
import { addPatientNote, deletePatientNote } from '@/lib/services/patient-notes'
import { getOrCreatePatientThread } from '@/lib/services/patient-messaging'
import { sendIntakeRequestToPatient } from '@/lib/services/patient-intake-send'
import { createAndSendReviewRequest } from '@/lib/services/reviews'
import { enterDemoMode } from '../ecommerce/customers/admin-actions'

export async function createPatientAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can create patients' }
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  if (!firstName || !lastName) return { ok: false, error: 'First and last name are required' }
  const input: CreatePatientInput = {
    organizationId: ctx.organizationId,
    firstName,
    lastName,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    dateOfBirth: String(formData.get('dateOfBirth') ?? '').trim() || null,
    source: 'manual' as PatientSource,
    lifecycle: 'new',
  }
  const id = await createPatient(input)
  revalidatePath('/patients')
  return { ok: true, id }
}

export async function updatePatientAction(
  patientId: string,
  patch: Partial<CreatePatientInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can update patients' }
  try {
    await updatePatient({ organizationId: ctx.organizationId, patientId, patch })
  } catch (err) {
    // Guardian-linkage validation throws human-readable messages — surface
    // them in the modal instead of a server error.
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save changes' }
  }
  revalidatePath(`/patients/${patientId}`)
  revalidatePath('/patients')
  // Overview's "Today's chair" renders patient names / birthday glyph / balance
  // from the same row — refresh it so a name or DOB fix shows immediately.
  revalidatePath('/')
  return { ok: true }
}

export async function archivePatientAction(patientId: string): Promise<void> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return
  await archivePatient(ctx.organizationId, patientId)
  revalidatePath('/patients')
  redirect('/patients')
}

export async function bulkSendEmailAction(
  patientIds: string[],
  subject: string,
  body: string,
): Promise<BulkEmailResult | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can send bulk email' }
  if (patientIds.length === 0) return { ok: false, error: 'No patients selected' }
  if (!body.trim()) return { ok: false, error: 'Message body is required' }
  const result = await sendBulkPatientEmail({
    organizationId: ctx.organizationId,
    patientIds,
    subject,
    body,
    fromName: ctx.organizationName,
  })
  revalidatePath('/patients')
  return result
}

export async function addPatientNoteAction(
  patientId: string,
  body: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can add notes' }
  if (!body.trim()) return { ok: false, error: 'Note body is required' }
  const id = await addPatientNote({
    organizationId: ctx.organizationId,
    patientId,
    authorId: ctx.userId,
    body,
  })
  revalidatePath(`/patients/${patientId}`)
  return { ok: true, id }
}

export async function deletePatientNoteAction(
  patientId: string,
  noteId: string,
): Promise<void> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return
  await deletePatientNote(ctx.organizationId, noteId)
  revalidatePath(`/patients/${patientId}`)
}

/**
 * Resolve (creating if necessary) the unified patient thread, then jump
 * the user to the Messages inbox with that thread open. Wired to the
 * "Send message" CTA on the patient detail page — previously a static
 * `<Link href="/messages">` that dropped patient context.
 */
export async function openPatientThreadAction(formData: FormData) {
  const patientId = formData.get('patientId')?.toString()
  if (!patientId) throw new Error('Missing patientId')
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  const threadId = await getOrCreatePatientThread(ctx.organizationId, patientId)
  redirect(`/messages?thread=${threadId}`)
}

/**
 * Platform-admin-only: enter patient-portal demo mode as this specific
 * patient. Reuses the demo_context cookie mechanism so the admin can
 * preview the patient experience — previously the patient portal had no
 * UI entry point and could only be reached by hand-crafting the cookie.
 */
export async function viewAsPatientAction(formData: FormData) {
  const patientId = formData.get('patientId')?.toString()
  const ctx = await requireTenant()
  if (!ctx.platformAdmin) throw new Error('Platform admin only')
  if (!patientId) throw new Error('Missing patientId')
  // enterDemoMode validates platform-admin again, sets the cookie, and
  // redirects to '/' (which routes a patient context to /patient/dashboard).
  await enterDemoMode({ orgId: ctx.organizationId, role: 'patient', patientId })
}

/**
 * Email a patient a link to fill out the clinic's default intake form.
 * Wired to the "Send intake" CTA on the patient detail page — previously
 * a static `<Link href="/intake-forms">` that did NOT actually send
 * anything; staff had to compose the email by hand. Returns ok/error so
 * the drawer can surface a toast inline.
 */
export async function sendIntakeRequestAction(
  patientId: string,
  formId?: string,
): Promise<{ ok: true; sentTo: string; formTitle: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can send intake requests' }
  try {
    const result = await sendIntakeRequestToPatient(ctx.organizationId, patientId, formId)
    revalidatePath(`/patients/${patientId}`)
    return { ok: true, sentTo: result.sentTo, formTitle: result.formTitle }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Send a post-visit review request to a specific patient. Wired to the
 * "Request review" CTA on the patient detail page. Mirrors the
 * sendIntakeRequestAction shape so the button can surface inline
 * feedback. The Reviews dashboard's Ready-to-ask list calls the service
 * directly; this wrapper exists so the patient page never has to leave
 * to /reviews to send a single request.
 *
 * The underlying service enforces every guard (no email, opted out, no
 * platforms configured, within rate-limit window) — we surface those
 * messages verbatim.
 */
export async function sendReviewRequestForPatientAction(
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can send review requests' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot send review requests' }
  try {
    await createAndSendReviewRequest({
      organizationId: ctx.organizationId,
      patientId,
      channel: 'email',
      requestedByUserId: ctx.userId,
    })
    revalidatePath(`/patients/${patientId}`)
    revalidatePath('/reviews')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Staff-initiated patient portal invite. Creates a `role='patient'` invitation
 * and emails the patient a set-up link — previously there was NO way for staff
 * to give a patient portal access (the patient had to discover the self-serve
 * `/intake-start` page on their own). The /accept-invite flow claims it via the
 * patient-specific accept path (acceptPatientPortalInvite), which creates the
 * patient-role membership directly rather than through better-auth (whose role
 * set doesn't include 'patient').
 */
export async function sendPatientPortalInviteAction(
  patientId: string,
): Promise<{ ok: true; sentTo: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic staff can invite patients' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot send invites' }

  const [p] = await db
    .select({ email: schema.patient.email, userId: schema.patient.userId, firstName: schema.patient.firstName })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, ctx.organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!p) return { ok: false, error: 'Patient not found' }
  if (!p.email) return { ok: false, error: 'Add an email to this patient before inviting them to the portal.' }
  if (p.userId) return { ok: false, error: 'This patient already has portal access.' }

  const email = p.email.toLowerCase().trim()
  // Reuse a still-pending invite for this email rather than piling up rows.
  const [existing] = await db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.organizationId, ctx.organizationId),
        eq(schema.invitation.email, email),
        eq(schema.invitation.status, 'pending'),
      ),
    )
    .limit(1)
  const id = existing?.id ?? randomUUID()
  if (!existing) {
    await db.insert(schema.invitation).values({
      id,
      organizationId: ctx.organizationId,
      email,
      role: 'patient',
      status: 'pending',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      inviterId: ctx.userId,
    })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'
  try {
    const sender = await getClinicSenderIdentity(ctx.organizationId)
    await sendPatientPortalInviteEmail(
      email,
      {
        clinicName: sender.name,
        patientFirstName: p.firstName,
        inviteUrl: `${base}/accept-invite?token=${id}`,
      },
      sender,
    )
  } catch {
    return { ok: false, error: 'The invite couldn’t be emailed — please try again.' }
  }
  revalidatePath(`/patients/${patientId}`)
  return { ok: true, sentTo: email }
}
