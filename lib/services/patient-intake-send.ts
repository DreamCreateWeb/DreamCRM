import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { sendIntakeRequestEmail } from '@/lib/email'
import { getDefaultFormTemplate } from '@/lib/services/forms'
import { publicSiteUrl } from '@/lib/services/clinic-site'

export interface SendIntakeRequestResult { sentTo: string }

/**
 * Email a patient the link to their clinic's default intake form. Used
 * by the "Send intake" CTA on the patient detail page; previously the
 * button was just a `<Link>` to the templates list and did NOT send
 * anything.
 *
 * Throws on the actionable failure cases (no patient, no email on file,
 * no default form configured) so the calling action can surface the
 * cause back to staff.
 */
export async function sendIntakeRequestToPatient(
  organizationId: string,
  patientId: string,
): Promise<SendIntakeRequestResult> {
  const [patient] = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      email: schema.patient.email,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)))
    .limit(1)
  if (!patient) throw new Error('Patient not found')
  if (!patient.email) throw new Error('Patient has no email on file. Add an email first.')

  const form = await getDefaultFormTemplate(organizationId)
  if (!form) {
    throw new Error('No default intake form set. Configure one in Intake Forms first.')
  }

  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  if (!org) throw new Error('Organization not found')

  const [profile] = await db
    .select({
      displayName: schema.clinicProfile.displayName,
      websiteDomain: schema.clinicProfile.websiteDomain,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)

  const base = publicSiteUrl({
    slug: org.slug,
    profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
  })
  const intakeFormUrl = `${base}/intake/${form.slug}`

  await sendIntakeRequestEmail(patient.email, {
    patientFirstName: patient.firstName,
    clinicName: profile?.displayName ?? 'Your dental clinic',
    intakeFormUrl,
  })

  return { sentTo: patient.email }
}
