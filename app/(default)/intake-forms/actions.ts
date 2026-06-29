'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  FormTemplateInput,
  archiveFormTemplate,
  createFormTemplate,
  createPacket,
  deletePacket,
  listFormTemplates,
  updateFormTemplate,
} from '@/lib/services/forms'
import { summarizeSubmission, type IntakeSummary } from '@/lib/services/intake-summary'
import { generateFormTranslation } from '@/lib/services/form-translate'
import { DEFAULT_INTAKE_TEMPLATE } from '@/lib/types/forms'

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

export async function saveFormAction(id: string, input: unknown) {
  const ctx = await requireClinicAdmin()
  const data = FormTemplateInput.parse(input)
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
