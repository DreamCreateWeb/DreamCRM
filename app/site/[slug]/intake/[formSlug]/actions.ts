'use server'

import { getFormTemplate, submitForm } from '@/lib/services/forms'
import { firstMissingRequiredField, type FormSubmissionData, type FormTemplateSchema } from '@/lib/types/forms'

interface Input {
  orgId: string
  templateId: string
  data: FormSubmissionData
  submitterName: string | null
  submitterEmail: string | null
  submitterPhone: string | null
}

/**
 * Public form submission. No auth — anyone with the form URL can fill
 * it. Re-validates the templateId actually belongs to the org so a
 * curious user can't post against an arbitrary org's templates.
 */
export async function submitIntakeForm(input: Input) {
  if (!input.orgId || !input.templateId) throw new Error('Missing form context')
  const template = await getFormTemplate(input.orgId, input.templateId)
  if (!template || template.archivedAt) throw new Error('Form is no longer accepting submissions')

  // Re-validate required fields server-side (the client runner can be bypassed).
  const missing = firstMissingRequiredField(template.schema as FormTemplateSchema, input.data)
  if (missing) throw new Error(`${missing} is required`)

  await submitForm({
    organizationId: input.orgId,
    formTemplateId: input.templateId,
    data: input.data,
    submitterName: input.submitterName,
    submitterEmail: input.submitterEmail,
    submitterPhone: input.submitterPhone,
  })
}
