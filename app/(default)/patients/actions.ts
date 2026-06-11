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
import {
  importPatients,
  autoMapColumns,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type ImportField,
  type ImportSummary,
} from '@/lib/services/patient-import'
import { parseCsvTable } from '@/lib/csv-parse'
import { enterDemoMode } from '../ecommerce/customers/admin-actions'

export async function createPatientAction(
  formData: FormData,
): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { ok: false; duplicateOf: { id: string; name: string } }
> {
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
    // The add-patient modal sends forceNew=1 only after the user clicks
    // "Add anyway" on the duplicate prompt.
    forceNew: String(formData.get('forceNew') ?? '') === '1',
  }
  const result = await createPatient(input)
  if ('duplicateOf' in result) {
    return { ok: false, duplicateOf: result.duplicateOf }
  }
  revalidatePath('/patients')
  return { ok: true, id: result.id }
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

  const result = await invitePatientToPortalCore({
    organizationId: ctx.organizationId,
    inviterId: ctx.userId,
    patientId,
  })
  if (result.status === 'invited') {
    revalidatePath(`/patients/${patientId}`)
    return { ok: true, sentTo: result.email }
  }
  return { ok: false, error: result.error }
}

type InviteCoreResult =
  | { status: 'invited'; email: string }
  | { status: 'skipped'; reason: 'no_email' | 'already_linked' | 'archived' | 'not_found'; error: string }
  | { status: 'error'; error: string }

/**
 * Create-or-reuse a pending portal invite for one patient and email it. The
 * single-invite action AND the bulk-invite action both call this, so the skip
 * rules (no email / already linked / archived) and the email send live in one
 * place. Caller is responsible for tenant + role gating.
 */
async function invitePatientToPortalCore({
  organizationId,
  inviterId,
  patientId,
}: {
  organizationId: string
  inviterId: string
  patientId: string
}): Promise<InviteCoreResult> {
  const [p] = await db
    .select({
      email: schema.patient.email,
      userId: schema.patient.userId,
      firstName: schema.patient.firstName,
      isActive: schema.patient.isActive,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!p) return { status: 'skipped', reason: 'not_found', error: 'Patient not found' }
  if (p.isActive === 0) return { status: 'skipped', reason: 'archived', error: 'Patient is archived' }
  if (!p.email) {
    return { status: 'skipped', reason: 'no_email', error: 'Add an email to this patient before inviting them to the portal.' }
  }
  if (p.userId) return { status: 'skipped', reason: 'already_linked', error: 'This patient already has portal access.' }

  const email = p.email.toLowerCase().trim()
  // Reuse a still-pending invite for this email rather than piling up rows.
  const [existing] = await db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.organizationId, organizationId),
        eq(schema.invitation.email, email),
        eq(schema.invitation.status, 'pending'),
      ),
    )
    .limit(1)
  const id = existing?.id ?? randomUUID()
  if (!existing) {
    await db.insert(schema.invitation).values({
      id,
      organizationId,
      email,
      role: 'patient',
      status: 'pending',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      inviterId,
    })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'
  try {
    const sender = await getClinicSenderIdentity(organizationId)
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
    return { status: 'error', error: 'The invite couldn’t be emailed — please try again.' }
  }
  return { status: 'invited', email }
}

export interface BulkInviteResult {
  invited: number
  alreadyLinked: number
  noEmail: number
  archived: number
  errors: number
}

/**
 * Bulk portal invite — loops the single-invite core over a selection from the
 * patients list. Skips patients with no email / already-linked / archived (per
 * the same rules as the single invite), per-patient try/catch so one failure
 * doesn't abort the batch. Same role gate as the single invite.
 */
export async function bulkInvitePatientsToPortalAction(
  patientIds: string[],
): Promise<BulkInviteResult | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic staff can invite patients' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot send invites' }
  if (patientIds.length === 0) return { ok: false, error: 'No patients selected' }

  const result: BulkInviteResult = { invited: 0, alreadyLinked: 0, noEmail: 0, archived: 0, errors: 0 }
  for (const patientId of patientIds) {
    try {
      const r = await invitePatientToPortalCore({
        organizationId: ctx.organizationId,
        inviterId: ctx.userId,
        patientId,
      })
      if (r.status === 'invited') result.invited++
      else if (r.status === 'skipped' && r.reason === 'already_linked') result.alreadyLinked++
      else if (r.status === 'skipped' && r.reason === 'no_email') result.noEmail++
      else if (r.status === 'skipped' && r.reason === 'archived') result.archived++
      else result.errors++
    } catch {
      result.errors++
    }
  }
  revalidatePath('/patients')
  return result
}

// ----- CSV import -------------------------------------------------------

export interface ImportPreview {
  ok: true
  header: string[]
  mapping: ColumnMapping
  /** First 5 data rows, for the preview table. */
  sample: string[][]
  totalRows: number
  /** True when the file exceeds the per-file cap (only the first MAX get imported). */
  truncated: boolean
}

async function readCsvFromFormData(formData: FormData): Promise<{ header: string[]; rows: string[][] } | { error: string }> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'No file uploaded.' }
  if (file.size === 0) return { error: 'That file is empty.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'That file is too large (max 10 MB).' }
  const text = await file.text()
  const { header, rows } = parseCsvTable(text)
  if (header.length === 0) return { error: 'We couldn’t read any columns from that file.' }
  return { header, rows }
}

/**
 * Parse an uploaded CSV and return its headers, an auto-detected column
 * mapping, a 5-row preview, and the total count — so the modal can show the
 * mapping + preview before the user commits. No DB writes.
 */
export async function previewImportAction(
  formData: FormData,
): Promise<ImportPreview | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can import patients' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can import patients.' }
  }
  const parsed = await readCsvFromFormData(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }
  return {
    ok: true,
    header: parsed.header,
    mapping: autoMapColumns(parsed.header),
    sample: parsed.rows.slice(0, 5),
    totalRows: parsed.rows.length,
    truncated: parsed.rows.length > MAX_IMPORT_ROWS,
  }
}

/**
 * Commit the import: re-parse the uploaded file (the client re-sends it
 * alongside the confirmed mapping) and insert the survivors. Returns the
 * per-row summary so the UI can report created / duplicates / errors.
 */
export async function importPatientsAction(
  formData: FormData,
): Promise<(ImportSummary & { ok: true }) | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can import patients' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can import patients.' }
  }
  const parsed = await readCsvFromFormData(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  let mapping: ColumnMapping
  try {
    mapping = JSON.parse(String(formData.get('mapping') ?? '{}')) as ColumnMapping
  } catch {
    return { ok: false, error: 'The column mapping was invalid — try again.' }
  }
  // Need at least a way to derive a first name.
  const FIELDS: ImportField[] = ['firstName', 'fullName']
  if (!FIELDS.some((f) => mapping[f] !== undefined)) {
    return { ok: false, error: 'Map a column to the patient name (first name, or a single name column) before importing.' }
  }

  const summary = await importPatients({
    organizationId: ctx.organizationId,
    rows: parsed.rows,
    mapping,
  })
  revalidatePath('/patients')
  revalidatePath('/')
  return { ok: true, ...summary }
}
