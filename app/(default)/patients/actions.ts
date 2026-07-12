'use server'

import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db, schema } from '@/lib/db'
import { sendPatientPortalInviteEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { renderAutomatedEmail } from '@/lib/services/email-automations'
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
import {
  sniffPatientDocument,
  addPatientDocument,
  deletePatientDocument,
  listPatientDocuments,
  type PatientDocumentRow,
} from '@/lib/services/patient-documents'
import {
  createFollowup,
  updateFollowup,
  completeFollowup,
  reopenFollowup,
  deleteFollowup,
  bulkCreateFollowups,
  type PatientFollowupView,
} from '@/lib/services/patient-followups'
import { listPatients } from '@/lib/services/patients'
import { mergePatients } from '@/lib/services/patient-merge'
import {
  createPatientView,
  deletePatientView,
  patientFiltersToAudienceFilter,
  type PatientViewRow,
} from '@/lib/services/patient-views'
import { normalizeViewFilters, type SavedViewFilters } from '@/lib/types/patient-views'
import { setFollowupRule } from '@/lib/services/followup-rules'
import type { FollowupRuleId, FollowupRuleConfig } from '@/lib/types/followup-rules'
import { setDigestEnabled } from '@/lib/services/daily-digest'
import { createAudience } from '@/lib/services/marketing'
import { planAllows } from '@/lib/modules'
import { MAX_DOCUMENT_BYTES } from '@/lib/types/patient-documents'
import { uploadBlob } from '@/lib/blob'
import {
  listPatientTags,
  createPatientTag,
  updatePatientTag,
  deletePatientTag,
  assignPatientTag,
  unassignPatientTag,
  assignTagToPatients,
} from '@/lib/services/patient-tags'
import type { PatientTagColor, PatientTagView } from '@/lib/types/patient-tags'
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

// ---------- Documents ----------

/**
 * Upload a file and attach it to a patient. Sniffs the real bytes (PDF or
 * image; never trusts the client type), caps size, stores it in S3, and records
 * the row — all in one call so a failed insert can't orphan an upload's
 * metadata. Clinic staff only.
 */
export async function uploadPatientDocumentAction(
  formData: FormData,
): Promise<{ ok: true; document: PatientDocumentRow } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can attach documents' }

  const patientId = formData.get('patientId')?.toString() ?? ''
  if (!patientId) return { ok: false, error: 'Missing patient' }
  const label = formData.get('label')?.toString() ?? null
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a file to upload' }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: 'File is too large (max 15MB).' }
  }

  // Sniff the leading bytes — PDF or image only.
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  const sniff = sniffPatientDocument(head)
  if (!sniff.ok) return { ok: false, error: sniff.reason }

  const safe = (file.name || 'document').replace(/[^a-z0-9_.-]/gi, '_')
  let fileUrl: string
  try {
    const res = await uploadBlob(`patient-documents/${ctx.organizationId}/${patientId}/${Date.now()}-${safe}`, file, {
      contentType: sniff.contentType,
    })
    fileUrl = res.url
  } catch {
    return { ok: false, error: 'Upload failed — please try again.' }
  }

  try {
    const document = await addPatientDocument({
      organizationId: ctx.organizationId,
      patientId,
      uploadedBy: ctx.userId,
      fileName: file.name || safe,
      fileUrl,
      contentType: sniff.contentType,
      sizeBytes: file.size,
      label,
    })
    revalidatePath(`/patients/${patientId}`)
    return { ok: true, document }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the document' }
  }
}

export async function deletePatientDocumentAction(
  patientId: string,
  documentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can remove documents' }
  await deletePatientDocument(ctx.organizationId, documentId)
  revalidatePath(`/patients/${patientId}`)
  return { ok: true }
}

/** Re-fetch a patient's documents — called by the panel when a realtime
 *  `documents` event lands (another tab/user shared or removed a file). */
export async function listPatientDocumentsAction(
  patientId: string,
): Promise<{ ok: true; documents: PatientDocumentRow[] } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can view documents' }
  const documents = await listPatientDocuments(ctx.organizationId, patientId)
  return { ok: true, documents }
}

// ---------- Merge ----------

/**
 * Fold a duplicate patient into this one (the survivor). Owner/admin only — it
 * moves history + tombstones a record, so a staff `member` can't.
 */
export async function mergePatientsAction(
  survivorId: string,
  duplicateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can merge patients' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can merge patients.' }
  }
  const res = await mergePatients(ctx.organizationId, survivorId, duplicateId, ctx.userId)
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not merge.' }
  revalidatePath('/patients')
  revalidatePath(`/patients/${survivorId}`)
  return { ok: true }
}

// ---------- Bulk actions over a filtered view ----------

/** Resolve every patient id matching a saved-view filter (server-side, so it's
 *  the whole segment, not just a page). */
async function resolveFilteredPatientIds(organizationId: string, filters: SavedViewFilters): Promise<string[]> {
  const f = normalizeViewFilters(filters as Record<string, unknown>)
  const rows = await listPatients(organizationId, {
    status: f.status,
    hasBalance: f.hasBalance,
    missingIntake: f.missingIntake,
    birthdayThisMonth: f.birthdayThisMonth,
    sources: f.sources,
    tagIds: f.tagIds,
    search: f.search,
  })
  return rows.map((r) => r.id)
}

/** Add the same follow-up to every patient matching the current view. */
export async function bulkFollowupForFilteredAction(
  filters: SavedViewFilters,
  input: { title: string; dueDate?: string | null },
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can add follow-ups' }
  if (!input.title.trim()) return { ok: false, error: 'Give the follow-up a title.' }
  try {
    const ids = await resolveFilteredPatientIds(ctx.organizationId, filters)
    const { created } = await bulkCreateFollowups(ctx.organizationId, ids, input, ctx.userId)
    revalidatePath('/followups')
    revalidatePath('/dashboard')
    return { ok: true, created }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not add follow-ups' }
  }
}

/** Create one follow-up per (deduped, org-owned) patient from an explicit id
 *  list — the appointments-agenda "follow up with these N patients" bulk
 *  action (e.g. everyone who no-showed today). */
export async function bulkCreateFollowupsForPatientsAction(
  patientIds: string[],
  input: { title: string; dueDate?: string | null },
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can add follow-ups' }
  if (!input.title.trim()) return { ok: false, error: 'Give the follow-up a title.' }
  try {
    const { created } = await bulkCreateFollowups(ctx.organizationId, patientIds, input, ctx.userId)
    revalidatePath('/followups')
    revalidatePath('/dashboard')
    return { ok: true, created }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not add follow-ups' }
  }
}

/** Apply a tag to every patient matching the current view. */
export async function bulkTagForFilteredAction(
  filters: SavedViewFilters,
  tagId: string,
): Promise<{ ok: true; assigned: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can tag patients' }
  try {
    const ids = await resolveFilteredPatientIds(ctx.organizationId, filters)
    const { assigned } = await assignTagToPatients(ctx.organizationId, ids, tagId, ctx.userId)
    revalidatePath('/patients')
    return { ok: true, assigned }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not apply the tag' }
  }
}

// ---------- Smart follow-up rules ----------

export async function setFollowupRuleAction(
  rule: FollowupRuleId,
  enabled: boolean,
): Promise<{ ok: true; config: FollowupRuleConfig } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Automations are a clinic feature.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change automations.' }
  }
  if (rule !== 'balance' && rule !== 'recall' && rule !== 'unconfirmed') {
    return { ok: false, error: 'Unknown rule.' }
  }
  const config = await setFollowupRule(ctx.organizationId, rule, enabled)
  revalidatePath('/followups')
  return { ok: true, config }
}

export async function setDigestEnabledAction(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'The digest is a clinic feature.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change the digest.' }
  }
  await setDigestEnabled(ctx.organizationId, enabled)
  revalidatePath('/followups')
  return { ok: true }
}

// ---------- Saved views ----------

export async function createPatientViewAction(
  name: string,
  filters: SavedViewFilters,
): Promise<{ ok: true; view: PatientViewRow } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can save views' }
  try {
    const view = await createPatientView(ctx.organizationId, name, filters as Record<string, unknown>, ctx.userId)
    revalidatePath('/patients')
    return { ok: true, view }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the view' }
  }
}

export async function deletePatientViewAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can delete views' }
  await deletePatientView(ctx.organizationId, id)
  revalidatePath('/patients')
  return { ok: true }
}

/**
 * Promote the current list filters into a reusable marketing audience, then
 * hand back the audience id so the UI can open the campaign composer prefilled.
 * Premium-gated (Recall & Outreach is Premium). Reports any filters that don't
 * translate to an audience so the UI can be honest.
 */
export async function promoteFiltersToAudienceAction(
  name: string,
  filters: SavedViewFilters,
): Promise<{ ok: true; audienceId: number; dropped: string[] } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can build audiences' }
  if (!planAllows(ctx.planTier, 'premium')) {
    return { ok: false, error: 'Audiences + campaigns are on the Premium plan.' }
  }
  const clean = name.trim().slice(0, 120)
  if (!clean) return { ok: false, error: 'Give the audience a name.' }
  try {
    const { filter, dropped } = patientFiltersToAudienceFilter(normalizeViewFilters(filters as Record<string, unknown>))
    const row = await createAudience(
      ctx.organizationId,
      {
        name: clean,
        description: 'Built from a patient-list view',
        recipientSource: 'patients',
        patientFilter: filter,
      },
      ctx.userId,
    )
    revalidatePath('/growth/audiences')
    return { ok: true, audienceId: row.id, dropped }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not build the audience' }
  }
}

// ---------- Follow-ups ----------

export async function createFollowupAction(input: {
  patientId: string
  title: string
  dueDate?: string | null
  assignedUserId?: string | null
}): Promise<{ ok: true; followup: PatientFollowupView } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can add follow-ups' }
  try {
    const followup = await createFollowup(
      {
        organizationId: ctx.organizationId,
        patientId: input.patientId,
        title: input.title,
        dueDate: input.dueDate ?? null,
        assignedUserId: input.assignedUserId ?? null,
      },
      ctx.userId,
    )
    revalidatePath(`/patients/${input.patientId}`)
    revalidatePath('/followups')
    revalidatePath('/dashboard')
    return { ok: true, followup }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not add the follow-up' }
  }
}

export async function updateFollowupAction(
  id: string,
  patientId: string,
  patch: { title?: string; dueDate?: string | null; assignedUserId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can edit follow-ups' }
  try {
    await updateFollowup(ctx.organizationId, id, patch)
    revalidatePath(`/patients/${patientId}`)
    revalidatePath('/followups')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the follow-up' }
  }
}

export async function completeFollowupAction(
  id: string,
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can complete follow-ups' }
  await completeFollowup(ctx.organizationId, id, ctx.userId)
  revalidatePath(`/patients/${patientId}`)
  revalidatePath('/followups')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function reopenFollowupAction(
  id: string,
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can reopen follow-ups' }
  await reopenFollowup(ctx.organizationId, id)
  revalidatePath(`/patients/${patientId}`)
  revalidatePath('/followups')
  return { ok: true }
}

export async function deleteFollowupAction(
  id: string,
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can remove follow-ups' }
  await deleteFollowup(ctx.organizationId, id)
  revalidatePath(`/patients/${patientId}`)
  revalidatePath('/followups')
  return { ok: true }
}

// ---------- Tags ----------

/** The org's tag catalog — lazy-loaded by the shared PatientTagControl when its
 *  picker first opens (so surfaces like the appointment drawer + message thread
 *  don't each have to preload it). Empty for non-clinic tenants. */
export async function listTagCatalogAction(): Promise<PatientTagView[]> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return []
  try {
    return await listPatientTags(ctx.organizationId)
  } catch {
    return []
  }
}

/** Create a new tag in the org catalog (idempotent on name) + return it. Any
 *  clinic staff can create + apply tags; deleting from the catalog is gated. */
export async function createPatientTagAction(
  name: string,
  color?: PatientTagColor,
): Promise<{ ok: true; tag: PatientTagView } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can create tags' }
  try {
    const tag = await createPatientTag(ctx.organizationId, { name, color }, ctx.userId)
    revalidatePath('/patients')
    return { ok: true, tag }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create the tag' }
  }
}

/** Assign a tag to one patient (idempotent). */
export async function assignPatientTagAction(
  patientId: string,
  tagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can tag patients' }
  try {
    await assignPatientTag(ctx.organizationId, patientId, tagId, ctx.userId)
    revalidatePath(`/patients/${patientId}`)
    revalidatePath('/patients')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not apply the tag' }
  }
}

/** Remove a tag from one patient. */
export async function unassignPatientTagAction(
  patientId: string,
  tagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can edit tags' }
  await unassignPatientTag(ctx.organizationId, patientId, tagId)
  revalidatePath(`/patients/${patientId}`)
  revalidatePath('/patients')
  return { ok: true }
}

/** Bulk-assign one tag to many selected patients (patients-list bulk action). */
export async function bulkAssignPatientTagAction(
  patientIds: string[],
  tagId: string,
): Promise<{ ok: true; assigned: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can tag patients' }
  try {
    const { assigned } = await assignTagToPatients(ctx.organizationId, patientIds, tagId, ctx.userId)
    revalidatePath('/patients')
    return { ok: true, assigned }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not apply the tag' }
  }
}

/** Rename / recolor a catalog tag (owner/admin — affects every patient). */
export async function updatePatientTagAction(
  tagId: string,
  patch: { name?: string; color?: PatientTagColor },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can edit tags' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can edit the tag catalog.' }
  }
  try {
    await updatePatientTag(ctx.organizationId, tagId, patch)
    revalidatePath('/patients')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update the tag' }
  }
}

/** Delete a tag from the catalog (owner/admin — unassigns it everywhere). */
export async function deletePatientTagAction(
  tagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can delete tags' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can delete a tag.' }
  }
  await deletePatientTag(ctx.organizationId, tagId)
  revalidatePath('/patients')
  return { ok: true }
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
 * to /growth/reviews to send a single request.
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
    revalidatePath('/growth/reviews')
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
    // Editable copy (Settings → Automations → Emails).
    const rendered = await renderAutomatedEmail(organizationId, 'portal_invite', {
      firstName: p.firstName,
      clinicName: sender.name,
    })
    await sendPatientPortalInviteEmail(
      email,
      {
        clinicName: sender.name,
        patientFirstName: p.firstName,
        inviteUrl: `${base}/accept-invite?token=${id}`,
      },
      sender,
      rendered.override,
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

// ----- Email-to-pay (balance pay links) ----------------------------------

/** Email one patient their balance + secure pay link (the /b/[token] landing). */
export async function sendPayLinkAction(
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic staff can send pay links' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot send pay links' }
  const { sendPayLinkEmail } = await import('@/lib/services/balance-outreach')
  const r = await sendPayLinkEmail(ctx.organizationId, patientId, ctx.userId, { source: 'staff' })
  if (r.ok) return { ok: true }
  const message =
    r.reason === 'no_balance'
      ? 'This patient has no balance on file.'
      : r.reason === 'no_email'
        ? 'This patient has no email on file.'
        : r.reason === 'payments_unavailable'
          ? 'Connect your Stripe account first (Shop → Payments) so patients can pay online.'
          : r.reason === 'recently_sent'
            ? 'A pay link already went out in the last few days — give it a moment to land.'
            : 'Could not send the pay link.'
  return { ok: false, error: message }
}

/** Bulk "email pay link" from the patients list — skips patients without a
 *  balance/email so it's safe on any selection. */
export async function bulkSendPayLinksAction(
  patientIds: string[],
): Promise<{ ok: true; sent: number; skipped: number; failed: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic staff can send pay links' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot send pay links' }
  if (patientIds.length === 0) return { ok: false, error: 'No patients selected' }
  const { sendPayLinksBulk } = await import('@/lib/services/balance-outreach')
  const r = await sendPayLinksBulk(ctx.organizationId, patientIds, ctx.userId)
  revalidatePath('/patients')
  return { ok: true, ...r }
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

/** Loyalty: staff point adjustment (comp / correction) with a required note. */
export async function adjustLoyaltyPointsAction(
  patientId: string,
  points: number,
  note: string,
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic staff can adjust points' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can adjust points' }
  }
  const { adjustLoyaltyPoints } = await import('@/lib/services/loyalty')
  const r = await adjustLoyaltyPoints(ctx.organizationId, patientId, points, note, ctx.userId)
  if (r.ok) revalidatePath(`/patients/${patientId}`)
  return r
}
