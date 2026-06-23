'use server'

import { getFormTemplate, submitForm } from '@/lib/services/forms'
import { readInsuranceCard, type InsuranceCardFields } from '@/lib/services/insurance-ocr'
import {
  firstMissingRequiredField,
  sanitizeSubmissionData,
  type FormSubmissionData,
  type FormTemplateSchema,
} from '@/lib/types/forms'

/**
 * Only allow OCR against images on our own upload bucket — the endpoint is
 * public, so this stops a caller pointing our vision spend at arbitrary URLs.
 * Falls back to "any https on amazonaws.com" when the bucket env is absent
 * (local dev).
 */
function isOwnUploadUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const bucket = process.env.S3_BUCKET
    if (bucket && u.host.includes(bucket)) return true
    return u.host.endsWith('.amazonaws.com')
  } catch {
    return false
  }
}

export type InsuranceOcrActionResult =
  | { ok: true; fields: InsuranceCardFields }
  | { ok: false; error: string }

/**
 * Public OCR trigger — reads the insurance-card photos the patient just
 * uploaded and returns the fields for them to confirm. Scoped to the org +
 * our own bucket + the per-org monthly cap (in the service).
 */
export async function readInsuranceCardAction(
  orgId: string,
  imageUrls: string[],
): Promise<InsuranceOcrActionResult> {
  if (!orgId) return { ok: false, error: 'Missing form context' }
  const urls = (Array.isArray(imageUrls) ? imageUrls : []).filter(isOwnUploadUrl).slice(0, 2)
  if (urls.length === 0) return { ok: false, error: 'Add a photo of your card first.' }
  const result = await readInsuranceCard({ organizationId: orgId, imageUrls: urls })
  if (result.ok) return { ok: true, fields: result.fields }
  return {
    ok: false,
    error:
      result.reason === 'no_allowance'
        ? 'Card reading is busy right now — please type your details instead.'
        : result.reason === 'not_configured'
          ? 'Card reading isn’t available — please type your details.'
          : 'We couldn’t read the card — please type your details.',
  }
}

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

  // Clamp file/insurance fields to clean refs (client could POST arbitrary
  // URLs) + drop display-only values, then re-validate required fields
  // server-side (the client runner can be bypassed).
  const schema = template.schema as FormTemplateSchema
  const data = sanitizeSubmissionData(schema, input.data)
  const missing = firstMissingRequiredField(schema, data)
  if (missing) throw new Error(`${missing} is required`)

  await submitForm({
    organizationId: input.orgId,
    formTemplateId: input.templateId,
    data,
    submitterName: input.submitterName,
    submitterEmail: input.submitterEmail,
    submitterPhone: input.submitterPhone,
  })
}
