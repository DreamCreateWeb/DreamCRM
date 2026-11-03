'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  FormTemplateInput,
  archiveFormTemplate,
  attachSubmissionToPatient,
  getSubmissionForReview,
  intakeSystemAnswers,
  createFormTemplate,
  createPacket,
  deletePacket,
  listFormTemplates,
  splitIntakeFormsForDoor,
  updateFormTemplate,
} from '@/lib/services/forms'
import { summarizeSubmission, type IntakeSummary } from '@/lib/services/intake-summary'
import { createPatient } from '@/lib/services/patients'
import { toE164 } from '@/lib/phone'
import type { FormSubmissionData, FormTemplateSchema } from '@/lib/types/forms'
import { generateFormTranslation } from '@/lib/services/form-translate'
import { DEFAULT_INTAKE_TEMPLATE, dedupeSystemKeys, pickIntakeSections } from '@/lib/types/forms'

async function requireClinicAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Clinic tenants only')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can edit intake forms')
  }
  return ctx
}

/** Create a new form pre-populated with the standard intake template.
 * Clinics rarely want to build from scratch — they want the dental
 * default with their tweaks. */
export async function createBlankFormAction() {
  const ctx = await requireClinicAdmin()
  const existing = await listFormTemplates(ctx.organizationId)
  const hasDefault = existing.some((t) => t.isDefault === 1)
  const created = await createFormTemplate(ctx.organizationId, {
    title: 'New Patient Intake',
    description: 'Standard dental intake — edit anything you like.',
    schema: DEFAULT_INTAKE_TEMPLATE,
    isDefault: !hasDefault, // first form ever becomes the default
  })
  revalidatePath('/intake-forms')
  redirect(`/intake-forms/${created.id}`)
}

/**
 * THE DOOR's one button (docs/ACTIVATION.md S5): build the practice's first
 * form from the sections they kept (the basics always) and turn the switch
 * on. A clinic with forms already on file only gets the switch — their
 * forms are theirs. Owners/admins only; returns the shape TurnOnButton reads.
 */
export async function turnOnIntakeFormsAction(input: { sections?: unknown }): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx
  try {
    ctx = await requireClinicAdmin()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const keep = Array.isArray(input?.sections) ? input.sections.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
  try {
    // The ONE split the intro card reads too (lib/services/forms.ts): a
    // seeded form patients have already answered is THEIRS (rebuilding it
    // would hide their sections), the unanswered seed is the picker's.
    const { own, seeded } = await splitIntakeFormsForDoor(ctx.organizationId)
    if (own.length === 0) {
      const schema = pickIntakeSections(keep)
      if (seeded.length > 0) {
        // Provisioning seeded the standard form untouched (audit round 1):
        // rebuild THAT one in place from what they kept, so its slug — the
        // link already on their site and in their confirmations — survives.
        await updateFormTemplate(ctx.organizationId, seeded[0].id, {
          title: seeded[0].title,
          description: seeded[0].description,
          schema,
          isDefault: true,
        })
      } else {
        await createFormTemplate(ctx.organizationId, {
          title: 'New Patient Intake',
          description: 'Standard dental intake — edit anything you like.',
          schema,
          isDefault: true,
        })
      }
    }
    const { enableFeature } = await import('@/lib/services/feature-switches')
    await enableFeature(ctx.organizationId, 'intake_forms')
  } catch (err) {
    console.warn('[intake-forms] turn on failed', err)
    return { ok: false, error: 'Could not turn on intake forms — try again.' }
  }
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function saveFormAction(id: string, input: unknown) {
  const ctx = await requireClinicAdmin()
  const data = FormTemplateInput.parse(input)
  // One "Saves to the record" key per form - duplicates are dropped, not refused.
  dedupeSystemKeys(data.schema as Parameters<typeof dedupeSystemKeys>[0])
  const result = await updateFormTemplate(ctx.organizationId, id, data)
  if (!result) throw new Error('Form not found')
  revalidatePath('/intake-forms')
  revalidatePath(`/intake-forms/${id}`)
  return result
}

export async function archiveFormAction(id: string) {
  const ctx = await requireClinicAdmin()
  await archiveFormTemplate(ctx.organizationId, id)
  revalidatePath('/intake-forms')
  redirect('/intake-forms')
}

/** Create a form packet (a named bundle of forms patients fill in one sitting). */
export async function createPacketAction(
  title: string,
  formIds: string[],
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const ctx = await requireClinicAdmin()
  if (!Array.isArray(formIds) || formIds.length < 2) {
    return { ok: false, error: 'Pick at least two forms for a packet.' }
  }
  const packet = await createPacket(ctx.organizationId, { title, formIds })
  if (packet.formIds.length < 2) return { ok: false, error: 'Pick at least two of your forms.' }
  revalidatePath('/intake-forms')
  return { ok: true, slug: packet.slug }
}

export async function deletePacketAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireClinicAdmin()
  await deletePacket(ctx.organizationId, id)
  revalidatePath('/intake-forms')
  return { ok: true }
}

/** Generate (and cache) the Spanish translation of a form. Owner/admin. */
export async function translateFormAction(
  templateId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ctx = await requireClinicAdmin()
  const res = await generateFormTranslation({ organizationId: ctx.organizationId, templateId, locale: 'es' })
  if (res.ok) {
    revalidatePath(`/intake-forms/${templateId}`)
    return { ok: true, count: res.count }
  }
  return {
    ok: false,
    error:
      res.reason === 'no_allowance'
        ? "You've used this month's AI translations."
        : res.reason === 'not_configured'
          ? 'AI translation isn’t available yet.'
          : res.reason === 'empty'
            ? 'Add some questions first.'
            : 'Could not translate — please try again.',
  }
}

/** Generate (or re-generate) the AI pre-visit summary for a submission. Any
 *  clinic staff can run it — it's read-only over an existing submission. */
export async function summarizeSubmissionAction(
  submissionId: string,
  force = false,
): Promise<{ ok: true; summary: IntakeSummary } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Clinic tenants only' }
  const res = await summarizeSubmission({ organizationId: ctx.organizationId, submissionId, force })
  if (res.ok) {
    revalidatePath(`/intake-forms/submissions/${submissionId}`)
    return { ok: true, summary: res.summary }
  }
  return {
    ok: false,
    error:
      res.reason === 'no_allowance'
        ? "You've used this month's AI summaries."
        : res.reason === 'empty'
          ? 'Nothing to summarize on this form.'
          : res.reason === 'not_configured'
            ? 'AI summaries aren’t available yet.'
            : 'Could not summarize — please try again.',
  }
}

type LinkResult = { ok: true; patientId: string } | { ok: false; error: string }

/** Staff links an unlinked submission to a patient they picked. Org-scoped,
 *  fills NULL only (never re-links), then writes the answers back to EMPTY columns. */
export async function linkSubmissionAction(submissionId: string, patientId: string): Promise<LinkResult> {
  let ctx
  try {
    ctx = await requireClinicAdmin()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  try {
    const ok = await attachSubmissionToPatient(ctx.organizationId, submissionId, patientId)
    if (!ok) return { ok: false, error: 'That submission is already linked, or the patient was not found.' }
    revalidatePath('/intake-forms')
    revalidatePath(`/intake-forms/submissions/${submissionId}`)
    revalidatePath(`/patients/${patientId}`)
    return { ok: true, patientId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not link the submission.' }
  }
}

/** "Add <name> as a patient" from an unlinked submission - the insurance
 *  action's dedupe / forceNew shape. The submission's answers (by systemKey)
 *  seed the new record; the submission is then attached to it. */
export async function createPatientFromSubmissionAction(args: {
  submissionId: string
  forceNew?: boolean
}): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { ok: false; duplicateOf: { id: string; name: string } }
> {
  let ctx
  try {
    ctx = await requireClinicAdmin()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  try {
    const review = await getSubmissionForReview(ctx.organizationId, args.submissionId)
    if (!review) return { ok: false, error: 'Submission not found.' }
    if (review.patientId) return { ok: false, error: 'This submission is already linked to a patient.' }
    const schema = review.template.schema as FormTemplateSchema
    const data = (review.submission.data ?? {}) as FormSubmissionData
    const answers = intakeSystemAnswers(schema, data)
    const sub = review.submission
    let firstName = answers.first_name ?? ''
    let lastName = answers.last_name ?? ''
    if ((!firstName || !lastName) && sub.submitterName) {
      const parts = sub.submitterName.trim().split(/\s+/)
      firstName = firstName || parts[0] || ''
      lastName = lastName || parts.slice(1).join(' ')
    }
    if (!firstName.trim() || !lastName.trim()) return { ok: false, error: 'First and last name are required to add a patient.' }
    const result = await createPatient({
      organizationId: ctx.organizationId,
      firstName,
      lastName,
      email: answers.email ?? sub.submitterEmail ?? null,
      phone: toE164(answers.phone ?? sub.submitterPhone) ?? null,
      dateOfBirth: answers.date_of_birth ?? null,
      addressLine1: answers.address_line1 ?? null,
      city: answers.city ?? null,
      state: answers.state ?? null,
      postalCode: answers.postal_code ?? null,
      source: 'manual',
      lifecycle: 'new',
      forceNew: !!args.forceNew,
    })
    if ('duplicateOf' in result) return { ok: false, duplicateOf: result.duplicateOf }
    await attachSubmissionToPatient(ctx.organizationId, args.submissionId, result.id)
    revalidatePath('/patients')
    revalidatePath('/intake-forms')
    revalidatePath(`/intake-forms/submissions/${args.submissionId}`)
    return { ok: true, id: result.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create the patient.' }
  }
}
