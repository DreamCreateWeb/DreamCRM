'use server'

import { eq } from 'drizzle-orm'
import { createLead } from '@/lib/services/leads'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { resolveClinicOrgIdBySlug } from '@/lib/services/clinic-site'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'

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
  // Resolve the org from the PUBLIC slug, never a client-posted orgId.
  const orgId = await resolveClinicOrgIdBySlug(formData.get('slug')?.toString() ?? '')
  if (!orgId) return { ok: false, error: 'We couldn’t find this clinic. Please try again.' }

  // Resolve the clinic's (possibly customised) field config from the DB so we
  // map every submitted value by its real definition — system fields to lead
  // columns, the rest to labelled note lines. Config is trusted (clinic-owned).
  const [row] = await db
    .select({ leadForms: clinicProfile.leadForms })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  const fields = resolveLeadForm((row?.leadForms as LeadFormsConfig | null) ?? null, 'insurance_verifier')

  let email = ''
  let phone = ''
  let name = ''
  const detailLines: string[] = []
  for (const f of fields) {
    const raw = formData.get(f.id)?.toString().trim() || ''
    if (f.required && !raw) return { ok: false, error: `${f.label} is required` }
    if (f.systemKey === 'email') email = raw
    else if (f.systemKey === 'phone') phone = raw
    else if (f.systemKey === 'name') name = raw
    else if (raw && raw !== '__other__') detailLines.push(`${f.label}: ${raw}`)
  }

  if (!email && !phone) {
    return { ok: false, error: 'Please give us an email or phone so we can reach you' }
  }
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address' }
  }
  if (phone && phone.replace(/\D/g, '').length < PHONE_DIGITS_MIN) {
    return { ok: false, error: 'Please enter a valid phone number' }
  }

  // The lead row's name is required; the default insurance form has no name
  // field (low-friction 2-field ask), so fall back to a clear sentinel that
  // makes the /leads queue obvious.
  const leadName = name || 'Insurance verification request'
  const notes =
    'Insurance verification request' +
    (detailLines.length > 0 ? ` — ${detailLines.join('. ')}.` : '.')

  try {
    await createLead({
      organizationId: orgId,
      name: leadName,
      phone,
      email: email || null,
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
