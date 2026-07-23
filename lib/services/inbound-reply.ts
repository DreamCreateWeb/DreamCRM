import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  inboundReplyDomain,
  normalizeInboundEmail,
  parseInboundRecipientSlug,
  platformSendingDomain,
  type NormalizedInboundEmail,
} from '@/lib/inbound-email'
import { recordInboundMessage } from '@/lib/services/patient-messaging'

/**
 * Route one Resend `email.received` event into the right place. Two domains
 * are ours (2026-07-23, both MX → Resend Inbound):
 *
 *   slug@{INBOUND_REPLY_DOMAIN}   — the Reply-To on Tier-1 email (replies)
 *   slug@{platform sending domain} — the visible From address (patients who
 *                                    compose a fresh email to it instead of
 *                                    hitting reply)
 *
 * Either way the clinic flow is the same:
 *   known patient  → their /messages thread (unread badge + staff bell ride
 *                    recordInboundMessage)
 *   unknown sender → forwarded verbatim to the clinic's own inbox, so a reply
 *                    from a spouse's address / a brand-new contact is never
 *                    silently lost
 *
 * A sending-domain recipient whose local part matches NO clinic (hello@,
 * support@, a typo'd slug) forwards to the platform org's owners/admins —
 * those aliases are advertised on the marketing site and used as the
 * platform From, and they used to bounce. Anything else is ignored (wrong
 * domain, junk payload).
 *
 * Returns a short outcome string for the webhook's JSON (observability only).
 */
export async function handleInboundReply(data: unknown): Promise<string> {
  const replyDomain = inboundReplyDomain()
  if (!replyDomain) return 'ignored:not_configured'

  const norm = normalizeInboundEmail(data)
  if (!norm) return 'ignored:unparseable'

  let slug = parseInboundRecipientSlug(norm.to, replyDomain)
  let onSendingDomain = false
  const sendingDomain = platformSendingDomain()
  if (!slug && sendingDomain !== replyDomain) {
    slug = parseInboundRecipientSlug(norm.to, sendingDomain)
    onSendingDomain = slug !== null
  }
  if (!slug) return 'ignored:not_our_domain'

  const [org] = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  if (!org) {
    // Not a clinic address. On the sending domain that means a platform
    // alias (or a typo) — forward it to the platform team rather than let
    // mail to our own advertised addresses vanish.
    if (onSendingDomain) return forwardToPlatform(slug, sendingDomain, norm)
    return 'ignored:unknown_clinic'
  }

  // Svix redelivers on timeouts — the Resend email id makes replays no-ops.
  const externalId =
    data && typeof data === 'object' && typeof (data as Record<string, unknown>).email_id === 'string'
      ? ((data as Record<string, string>).email_id as string)
      : null
  if (externalId) {
    const [dupe] = await db
      .select({ id: schema.patientMessage.id })
      .from(schema.patientMessage)
      .where(
        and(
          eq(schema.patientMessage.organizationId, org.id),
          eq(schema.patientMessage.externalId, externalId),
        ),
      )
      .limit(1)
    if (dupe) return 'duplicate'
  }

  // The thread body: what they typed (quoted history already stripped), with
  // the subject as a fallback for subject-only replies. Clamped under the
  // message-body limit so a giant forward can't fail the insert.
  const body = (norm.body || norm.subject || '').slice(0, 7900).trim()

  const [patient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, org.id),
        eq(schema.patient.email, norm.fromEmail),
        isNull(schema.patient.mergedIntoPatientId),
      ),
    )
    .limit(1)

  if (patient && body) {
    await recordInboundMessage({
      organizationId: org.id,
      patientId: patient.id,
      body,
      channel: 'email',
      externalId: externalId ?? undefined,
    })
    return 'recorded'
  }

  // Unknown sender (or an empty body we can't thread) → forward to the
  // clinic's own inbox. Best-effort by design: if the clinic has no email on
  // file there is nowhere to forward, and we say so in the outcome.
  const [profile] = await db
    .select({ email: schema.clinicProfile.email })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, org.id))
    .limit(1)
  const clinicEmail = profile?.email?.trim()
  if (!clinicEmail || !clinicEmail.includes('@')) return 'ignored:no_clinic_email'

  const { sendNotificationEmail } = await import('@/lib/email')
  await sendNotificationEmail({
    to: clinicEmail,
    name: org.name ?? 'Team',
    title: norm.subject ? `Fwd: ${norm.subject}` : 'Fwd: patient email reply',
    body:
      `A reply arrived from ${norm.fromName ? `${norm.fromName} <${norm.fromEmail}>` : norm.fromEmail}, ` +
      `but no patient record matches that address — forwarding it so it isn't lost.\n\n` +
      `——\n\n${body || '(empty message)'}`,
  })
  return 'forwarded'
}

/**
 * Mail to a non-clinic address on the platform's own sending domain
 * (hello@, support@, …) → bell + forced email to the platform org's
 * owners/admins. These addresses are public (the marketing site, the
 * platform From header) and MUST NOT be a black hole now that the apex
 * accepts mail.
 */
async function forwardToPlatform(
  localPart: string,
  domain: string,
  norm: NormalizedInboundEmail,
): Promise<string> {
  const { getPlatformOrgId } = await import('@/lib/services/gsc')
  const { notifyOrgMembers } = await import('@/lib/services/notifications')
  const platformOrgId = await getPlatformOrgId()
  if (!platformOrgId) return 'ignored:no_platform_org'

  const from = norm.fromName ? `${norm.fromName} <${norm.fromEmail}>` : norm.fromEmail
  await notifyOrgMembers(
    platformOrgId,
    {
      bucket: 'comments',
      type: 'platform_inbound_email',
      title: `Mail to ${localPart}@${domain}: ${norm.subject || '(no subject)'}`,
      body:
        `From ${from}\n\n${(norm.body || '(empty message)').slice(0, 7900)}\n\n` +
        `Reply directly to ${norm.fromEmail} — this address only forwards.`,
      forceEmail: true,
    },
    { roles: ['owner', 'admin'] },
  )
  return 'forwarded:platform'
}
