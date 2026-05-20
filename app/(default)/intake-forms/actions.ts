'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  FormTemplateInput,
  archiveFormTemplate,
  createFormTemplate,
  listFormTemplates,
  updateFormTemplate,
} from '@/lib/services/forms'
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
