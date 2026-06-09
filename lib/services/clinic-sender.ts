import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicSenderFrom, deliverableReplyTo, formatFromHeader, type ClinicSender } from '@/lib/email-identity'
import { resolveClinicTimeZone } from '@/lib/clinic-timezone'

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
        sendingAccountId: schema.clinicProfile.emailSendingAccountId,
        timezone: schema.clinicProfile.timezone,
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

  const sender: ClinicSender = {
    name,
    from: clinicSenderFrom(name, org?.slug || 'clinic', SENDING_DOMAIN),
    replyTo: deliverableReplyTo(profile?.email),
    timeZone: resolveClinicTimeZone(profile?.timezone),
  }

  // Tier 2 — when the clinic designated a connected Google mailbox, send AS
  // their real address. Validated here (org-scoped + not disabled), so a stale
  // reference simply falls back to the Tier 1 platform sender above.
  if (profile?.sendingAccountId) {
    const [acct] = await db
      .select({ id: schema.emailAccount.id, address: schema.emailAccount.emailAddress, disabled: schema.emailAccount.disabled })
      .from(schema.emailAccount)
      .where(
        and(
          eq(schema.emailAccount.id, profile.sendingAccountId),
          eq(schema.emailAccount.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (acct && !acct.disabled) {
      sender.gmail = { accountId: acct.id, from: formatFromHeader(name, acct.address) }
    }
  }

  return sender
}

/** Connected Google mailboxes available to use as the clinic's email sender. */
export async function listClinicGmailAccounts(
  organizationId: string,
): Promise<Array<{ id: string; emailAddress: string; displayName: string | null }>> {
  return db
    .select({
      id: schema.emailAccount.id,
      emailAddress: schema.emailAccount.emailAddress,
      displayName: schema.emailAccount.displayName,
    })
    .from(schema.emailAccount)
    .where(
      and(
        eq(schema.emailAccount.organizationId, organizationId),
        eq(schema.emailAccount.provider, 'gmail'),
        eq(schema.emailAccount.disabled, false),
      ),
    )
}
