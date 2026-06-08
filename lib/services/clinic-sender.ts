import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicSenderFrom, deliverableReplyTo, type ClinicSender } from '@/lib/email-identity'

/**
 * Tier 1 sender identity: patient-facing clinic email goes out as
 * "{Clinic Name}" <{slug}@{sending-domain}> with Reply-To = the clinic's own
 * inbox. The display name (what patients actually read) is the clinic's, while
 * the address stays on the platform's already-verified domain — so clinics
 * never touch DNS. Name precedence: clinic-set email sender name → clinic
 * display name → org name → safe default.
 */

const SENDING_DOMAIN = process.env.EMAIL_SENDING_DOMAIN?.trim() || 'dreamcreatestudio.com'

export async function getClinicSenderIdentity(organizationId: string): Promise<ClinicSender> {
  const [[org], [profile]] = await Promise.all([
    db
      .select({ slug: schema.organization.slug, name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1),
    db
      .select({
        senderName: schema.clinicProfile.emailSenderName,
        displayName: schema.clinicProfile.displayName,
        email: schema.clinicProfile.email,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1),
  ])

  const name =
    profile?.senderName?.trim() ||
    profile?.displayName?.trim() ||
    org?.name?.trim() ||
    'Your dental office'

  return {
    name,
    from: clinicSenderFrom(name, org?.slug || 'clinic', SENDING_DOMAIN),
    replyTo: deliverableReplyTo(profile?.email),
  }
}
