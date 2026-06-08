import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { sendIntakeRequestEmail } from '@/lib/email'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getDefaultFormTemplate, getFormTemplate } from '@/lib/services/forms'
import { publicSiteUrl } from '@/lib/services/clinic-site'

export interface SendIntakeRequestResult { sentTo: string; formTitle: string }

/**
 * Email a patient the link to an intake form. When `formId` is given (the
 * front desk picked a specific form from the dropdown) that form is used;
 * otherwise the clinic's default form is sent. Used by the "Send intake" CTA
 * on the patient detail page; previously the button was just a `<Link>` to the
 * templates list and did NOT send anything.
 *
 * Throws on the actionable failure cases (no patient, no email on file, the
 * chosen/default form is missing or archived) so the calling action can
 * surface the cause back to staff.
 */
export async function sendIntakeRequestToPatient(
  organizationId: string,
  patientId: string,
  formId?: string,
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

  const form = formId
    ? await getFormTemplate(organizationId, formId)
    : await getDefaultFormTemplate(organizationId)
  if (!form || form.archivedAt) {
    throw new Error(
      formId
        ? 'That intake form is no longer available — pick another one.'
        : 'No default intake form set. Configure one in Intake Forms first.',
    )
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

  await queueCommLogWriteBack(organizationId, patient.id, {
    note: `Intake form "${form.title}" sent to ${patient.email}.`,
    mode: 'Email',
  })

  return { sentTo: patient.email, formTitle: form.title }
}
