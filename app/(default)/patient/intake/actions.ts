'use server'

import { requireTenant } from '@/lib/auth/context'
import { getFormTemplate, submitForm } from '@/lib/services/forms'
import type { FormSubmissionData, FormTemplateSchema } from '@/lib/types/forms'

/** A required field is unsatisfied when its value is missing or empty. */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

interface PatientIntakeInput {
  orgId: string
  templateId: string
  data: FormSubmissionData
  submitterName: string | null
  submitterEmail: string | null
  submitterPhone: string | null
}

/**
 * Authenticated patient-side intake submission. Mirrors the public
 * `submitIntakeForm` action but adds:
 *   • requireTenant + patient-role gate
 *   • orgId is sourced from the session (not from props) — the client
 *     can request any orgId, but we ignore it and use the authenticated
 *     one so a curious patient can't post against another clinic
 *   • patientId is attached from session so the submission shows up
 *     on the patient's record + the staff "Forms on file" view
 *
 * The runner component is shared with the public form; only the action
 * differs.
 */
export async function submitPatientIntakeAction(input: PatientIntakeInput) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') throw new Error('Only patients can submit through the portal')
  if (!ctx.patientId) throw new Error('Missing patient identity')

  // Trust the SESSION orgId, not the prop, to avoid cross-tenant writes.
  const template = await getFormTemplate(ctx.organizationId, input.templateId)
  if (!template || template.archivedAt) throw new Error('Form is no longer accepting submissions')

  // Re-validate required fields server-side — the client runner validates too,
  // but a direct action call could post partial/empty data otherwise.
  const schema = template.schema as FormTemplateSchema
  for (const section of schema?.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.required && isEmptyValue(input.data?.[field.id])) {
        throw new Error(`${field.label} is required`)
      }
    }
  }

  await submitForm({
    organizationId: ctx.organizationId,
    formTemplateId: input.templateId,
    patientId: ctx.patientId,
    data: input.data,
    submitterName: input.submitterName,
    submitterEmail: input.submitterEmail,
    submitterPhone: input.submitterPhone,
  })
}
