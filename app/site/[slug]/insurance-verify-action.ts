'use server'

import { createLead } from '@/lib/services/leads'

/**
 * Public insurance-verifier form action.
 *
 * Creates a `lead` row scoped to the clinic org so the request lands in
 * the /leads triage queue with the same status/aging treatment as
 * regular contact-form leads. `sourcePage: 'insurance_verifier'` is the
 * discriminator — the existing leads UI renders it as the row's "from"
 * label, so staff can see at a glance which queue an inbound came from.
 *
 * Returns a discriminated result instead of throwing so the client form
 * can show a polite inline error without re-running through Next.js's
 * server-error machinery.
 *
 * Not an actual eligibility check (no payer API hookup). The success
 * message tells the patient we'll be in touch within one business day so
 * expectations stay honest.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Permissive — international + various US formats. Just need a few
// digits so the request is callable; full validation is a v1.1 polish.
const PHONE_DIGITS_MIN = 7

export type InsuranceVerifyResult =
  | { ok: true }
  | { ok: false; error: string }

export async function submitInsuranceVerifyRequest(
  formData: FormData,
): Promise<InsuranceVerifyResult> {
  const orgId = formData.get('orgId')?.toString().trim()
  const email = formData.get('email')?.toString().trim() || ''
  const phone = formData.get('phone')?.toString().trim() || ''
  const carrierRaw = formData.get('carrier')?.toString().trim() || ''

  if (!orgId) return { ok: false, error: 'Missing organization' }
  if (!email) return { ok: false, error: 'Email is required' }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address' }
  }
  if (!phone) return { ok: false, error: 'Phone is required' }
  if (phone.replace(/\D/g, '').length < PHONE_DIGITS_MIN) {
    return { ok: false, error: 'Please enter a valid phone number' }
  }

  // The lead row's name is required and there's no name field on this
  // form (insurance verification is intentionally a 2-field ask — email
  // + phone — so the bar to submit is low). Fall back to a clear sentinel
  // so the /leads triage page makes it obvious this came from the
  // insurance verifier and not a malformed contact submission.
  const name = 'Insurance verification request'
  const carrierLabel =
    !carrierRaw || carrierRaw === '__other__' ? 'unspecified' : carrierRaw
  const notes = `Insurance verification request: ${carrierLabel}`

  try {
    await createLead({
      organizationId: orgId,
      name,
      phone,
      email,
      message: notes,
      // The leads UI surfaces sourcePage as a "from {sourcePage}" label
      // on every row — so a literal 'insurance_verifier' token here is
      // the simplest way to make this queue visually distinct without
      // adding a new column. Front desk filters by it in their head.
      sourcePage: 'insurance_verifier',
    })
  } catch (err) {
    console.error('[insurance-verify] createLead failed', err)
    return {
      ok: false,
      error: 'Something went wrong. Please call us directly.',
    }
  }

  return { ok: true }
}
