'use server'

import { getFormTemplate, submitForm } from '@/lib/services/forms'
import { readInsuranceCard, type InsuranceCardFields } from '@/lib/services/insurance-ocr'
import { PublicFormError, publicFormFailure, type PublicFormResult } from '@/lib/services/public-form-error'
import { isAllowedAttachmentUrl } from '@/lib/attachment-hosts'
import { resolveClinicOrgIdBySlug } from '@/lib/services/clinic-site'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'
import type { OcrScope } from './intake-form-runner'
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
 * uploaded and returns the fields for them to confirm.
 *
 * Every scan spends from the clinic's 400-a-month allowance, so WHOSE
 * allowance is the question this action has to answer honestly. It used to
 * take `orgId` straight from the browser with nothing checking it against the
 * page it was served from, and it was the one public-site action with no rate
 * limit — so anyone who could upload an image could point an ARBITRARY
 * clinic's cap at it and drain it. Three things close that, in the order they
 * run:
 *
 *  1. the per-IP rate limit every other public action already had;
 *  2. the org resolved from the PUBLIC SLUG, never a client-posted org id —
 *     the same law `submitContactRequest` and the insurance verifier follow;
 *  3. the form template re-validated against THAT org, so a caller has to name
 *     a real, unarchived intake form belonging to the clinic whose page they
 *     claim to be on. `submitIntakeForm` below has always done this, for
 *     exactly this reason.
 *
 * What (2) and (3) buy is narrower than "the clinic whose page served this",
 * and it is worth saying so: a slug and a form id are both PUBLIC, so a caller
 * can still name someone else's clinic. They stop an arbitrary org id and pin
 * the scan to a real practice with a real live form. The thing that actually
 * bounds the drain is (1).
 *
 * Storage stays gated too. `isAllowedAttachmentUrl` matches the exact hosts
 * our storage drivers mint — this used to be a hand-rolled SUBSTRING match on
 * the host that accepted any public S3 bucket on the internet — and the
 * service enforces it again, so an added call site cannot reopen that hole by
 * forgetting to filter.
 */
export async function readInsuranceCardAction(
  scope: OcrScope,
  imageUrls: string[],
): Promise<InsuranceOcrActionResult> {
  // First, before any lookup — a flood should not get us as far as the database.
  if (!(await rateLimitPublicAction('insurance_ocr', { limit: 6, windowMs: 10 * 60 * 1000 }))) {
    return { ok: false, error: 'Too many tries just now — please wait a moment, or type your details.' }
  }
  const siteSlug = scope?.siteSlug ?? ''
  const templateId = scope?.templateId ?? ''
  if (!siteSlug || !templateId) {
    return { ok: false, error: 'Something went wrong. Please refresh and try again.' }
  }
  const orgId = await resolveClinicOrgIdBySlug(siteSlug)
  if (!orgId) return { ok: false, error: 'Something went wrong. Please refresh and try again.' }
  // The scan has to belong to a real form on that clinic's site. A retired
  // form is not a door into the allowance either.
  const template = await getFormTemplate(orgId, templateId)
  if (!template || template.archivedAt) {
    return { ok: false, error: 'Something went wrong. Please refresh and try again.' }
  }
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
 *
 * Returns `{ ok }` rather than throwing: in production Next.js replaces a
 * server-action error message with an opaque digest, so "This form is no
 * longer accepting responses" reached the patient as an internal-render
 * sentence with nothing to act on. See `lib/services/public-form-error.ts`.
 *
 * ── THE RATE LIMIT, AND THE DECISION IN IT ──────────────────────────────────
 *
 * This was the last public clinic-site action without one. It is not a spend
 * path like the card scanner, which is why it was written down rather than
 * fixed alongside it — but it is an unauthenticated WRITE. Every call inserts a
 * `form_submission` row AND fires `submitForm`'s `intake_submitted` notice to
 * the org's owners and admins, so a script can bury a clinic's submissions list
 * and their inbox together, for free, for as long as it likes.
 *
 * The decision is the NUMBER, not whether to have one, and it is sized against
 * the legitimate traffic rather than against the other actions here. Two things
 * make this surface unlike them:
 *
 *  - A clinic's waiting-room iPad and its front-desk machines sit behind ONE
 *    egress IP, so a per-IP cap on intake caps a whole practice at once. The
 *    failure mode is turning away a real patient at the desk, which is worse
 *    than the flood.
 *  - A PACKET is N submissions, not one. `form_packet.formIds` has no cap, and
 *    the flow submits each form independently — a "New Patient Packet" is
 *    realistically 6–10, most of them one-tap consents that go through in
 *    seconds. One parent completing packets for two children is already 20.
 *
 * So the limit is deliberately loose: 40 submissions per 10 minutes, where
 * every other public action here sits at 3–8 per 5–10. Three people working
 * through a ten-form packet on the same waiting-room wifi is 30 and still fits.
 * What it buys is the floor, not precision: an unbounded flood becomes 240/hour
 * per IP. If a busy practice ever does hit this, RAISE it — a cap is the wrong
 * instrument against a real clinic and a blunt-enough one against a script.
 *
 * It runs FIRST, ahead of the template lookup, so a flood costs a counter
 * rather than a query — the same order `readInsuranceCardAction` uses above.
 * `checkRateLimit` fails OPEN, so a limiter outage never stands between a
 * patient and their forms.
 */
export async function submitIntakeForm(input: Input): Promise<PublicFormResult> {
  if (!(await rateLimitPublicAction('intake_submit', { limit: 40, windowMs: 10 * 60 * 1000 }))) {
    return {
      ok: false,
      error:
        'That’s a lot of submissions from this connection in a short time. Please wait a minute and send it again — your answers are still here.',
    }
  }
  try {
    await runIntakeSubmission(input)
    return { ok: true, data: null }
  } catch (err) {
    return publicFormFailure('clinic-site.intake', err)
  }
}

async function runIntakeSubmission(input: Input) {
  if (!input.orgId || !input.templateId) throw new PublicFormError('Something went wrong. Please refresh and try again.')
  const template = await getFormTemplate(input.orgId, input.templateId)
  if (!template || template.archivedAt) throw new PublicFormError('This form is no longer accepting responses.')

  // Clamp file/insurance fields to clean refs (client could POST arbitrary
  // URLs) + drop display-only values, then re-validate required fields
  // server-side (the client runner can be bypassed).
  const schema = template.schema as FormTemplateSchema
  const data = sanitizeSubmissionData(schema, input.data)
  const missing = firstMissingRequiredField(schema, data)
  if (missing) throw new PublicFormError(`${missing} is required`)

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
