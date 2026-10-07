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
import { DEFAULT_INTAKE_TEMPLATE, isUntouchedSeedTemplate, pickIntakeSections } from '@/lib/types/forms'

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
    const existing = await listFormTemplates(ctx.organizationId)
    const live = existing.filter((t) => t.archivedAt == null)
    const own = live.filter((t) => !isUntouchedSeedTemplate(t))
    const seeded = live.filter((t) => isUntouchedSeedTemplate(t))
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
