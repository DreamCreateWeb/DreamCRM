'use server'

import { getFormTemplate, submitForm } from '@/lib/services/forms'
import { readInsuranceCard, type InsuranceCardFields } from '@/lib/services/insurance-ocr'
import { isAllowedAttachmentUrl } from '@/lib/attachment-hosts'
import {
  firstMissingRequiredField,
  sanitizeSubmissionData,
  type FormSubmissionData,
  type FormTemplateSchema,
} from '@/lib/types/forms'

export type InsuranceOcrActionResult =
  | { ok: true; fields: InsuranceCardFields }
  | { ok: false; error: string }

/**
 * Public OCR trigger — reads the insurance-card photos the patient just
 * uploaded and returns the fields for them to confirm. Scoped to the org +
 * our own storage + the per-org monthly cap (both in the service).
 *
 * This used to carry its own `isOwnUploadUrl` check, which matched the bucket
 * name as a SUBSTRING of the host and otherwise waved through any
 * `*.amazonaws.com` — i.e. any public S3 bucket on the internet, including the
 * caller's own. The shared `isAllowedAttachmentUrl` matches the exact hosts our
 * storage drivers mint, and the service enforces it too, so an added call site
 * cannot reopen the hole by forgetting to filter.
 */
export async function readInsuranceCardAction(
  orgId: string,
  imageUrls: string[],
): Promise<InsuranceOcrActionResult> {
  if (!orgId) return { ok: false, error: 'Something went wrong. Please refresh and try again.' }
  const urls = (Array.isArray(imageUrls) ? imageUrls : []).filter(isAllowedAttachmentUrl).slice(0, 2)
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
  /** Language the patient filled the form in ('es' stamps their
   *  preferred-language field when it's still unset). */
  submittedLanguage?: 'en' | 'es'
}

/**
 * Public form submission. No auth — anyone with the form URL can fill
 * it. Re-validates the templateId actually belongs to the org so a
 * curious user can't post against an arbitrary org's templates.
 */
export async function submitIntakeForm(input: Input) {
  if (!input.orgId || !input.templateId) throw new Error('Something went wrong. Please refresh and try again.')
  const template = await getFormTemplate(input.orgId, input.templateId)
  if (!template || template.archivedAt) throw new Error('This form is no longer accepting responses.')

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

  // Filling the form in Spanish is the clearest signal we get — stamp the
  // patient's preferred language, only when still unset (a staff-set choice
  // always wins). Best-effort: never fails the submission.
  if (input.submittedLanguage === 'es' && input.submitterEmail) {
    try {
      const { and, eq, isNull } = await import('drizzle-orm')
      const { db, schema } = await import('@/lib/db')
      await db
        .update(schema.patient)
        .set({ preferredLanguage: 'es' })
        .where(
          and(
            eq(schema.patient.organizationId, input.orgId),
            eq(schema.patient.email, input.submitterEmail),
            isNull(schema.patient.preferredLanguage),
          ),
        )
    } catch (err) {
      console.warn('[intake] preferred-language stamp failed', err)
    }
  }
}
