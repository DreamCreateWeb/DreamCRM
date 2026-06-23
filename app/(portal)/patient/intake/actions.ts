'use server'

import { requireTenant } from '@/lib/auth/context'
import { getFormTemplate, submitForm } from '@/lib/services/forms'
import { readInsuranceCard, type InsuranceCardFields } from '@/lib/services/insurance-ocr'
import { getPortalSettings } from '@/lib/services/portal-settings'
import {
  firstMissingRequiredField,
  sanitizeSubmissionData,
  type FormSubmissionData,
  type FormTemplateSchema,
} from '@/lib/types/forms'

interface PatientIntakeInput {
  orgId: string
  templateId: string
  data: FormSubmissionData
  submitterName: string | null
  submitterEmail: string | null
  submitterPhone: string | null
}

/**
 * Authenticated patient-side form submission. Mirrors the public
 * `submitIntakeForm` action but:
 *   • requires the patient tenant + the portal forms feature,
 *   • sources orgId from the SESSION (never the client prop) so a curious
 *     patient can't post against another clinic,
 *   • attaches patientId so the submission lands on their record.
 */
export async function submitPatientIntakeAction(input: PatientIntakeInput) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') throw new Error('Only patients can submit through the portal')
  if (!ctx.patientId) throw new Error('Missing patient identity')

  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.forms) throw new Error('Forms aren’t available in the portal right now')

  const template = await getFormTemplate(ctx.organizationId, input.templateId)
  if (!template || template.archivedAt) throw new Error('Form is no longer accepting submissions')

  const schema = template.schema as FormTemplateSchema
  const data = sanitizeSubmissionData(schema, input.data)
  const missing = firstMissingRequiredField(schema, data)
  if (missing) throw new Error(`${missing} is required`)

  await submitForm({
    organizationId: ctx.organizationId,
    formTemplateId: input.templateId,
    patientId: ctx.patientId,
    data,
    submitterName: input.submitterName,
    submitterEmail: input.submitterEmail,
    submitterPhone: input.submitterPhone,
  })
}

/** Portal insurance-card OCR — org from the session; same per-org cap. */
export async function readPatientInsuranceCardAction(
  _orgId: string,
  imageUrls: string[],
): Promise<{ ok: true; fields: InsuranceCardFields } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient' || !ctx.patientId) {
    return { ok: false, error: 'Only patients can use this.' }
  }
  const urls = (Array.isArray(imageUrls) ? imageUrls : []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 2)
  if (urls.length === 0) return { ok: false, error: 'Add a photo of your card first.' }
  const result = await readInsuranceCard({ organizationId: ctx.organizationId, imageUrls: urls })
  if (result.ok) return { ok: true, fields: result.fields }
  return { ok: false, error: 'We couldn’t read the card — please type your details.' }
}
