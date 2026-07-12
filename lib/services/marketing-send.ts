import 'server-only'
import { Resend } from 'resend'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { renderCampaignEmail, resolveMarketingFooterAddress, applyMergeFields } from '@/lib/marketing/render-email'
import { getAccessToken, sendMessage as sendGmailMessage } from './gmail'
import { getClinicSenderIdentity } from './clinic-sender'
import type { ClinicSender } from '@/lib/email-identity'
import {
  getMarketingCampaign,
  resolveCampaignRecipients,
} from './marketing-campaigns'
import type { ResolvedRecipient } from './marketing'
import { notify } from './notifications'

/**
 * Marketing send service. Two channels:
 *
 * - **Resend** — fast, signed by our domain, best deliverability for blast
 *   sends. Tags each send with `campaignId` + `customerId`/`patientId` so the
 *   webhook can map bounce/complaint events back to our rows. Each send carries
 *   RFC-8058 `List-Unsubscribe` + `List-Unsubscribe-Post` headers (Gmail/Yahoo
 *   bulk-sender requirement) and the SENDING clinic's postal address in the
 *   footer (CAN-SPAM).
 * - **Gmail** — sends from the org's connected mailbox, one-by-one. Warmer
 *   for cold outreach but rate-limited (~500/day per account) so we cap at
 *   100 per send invocation; you can re-run for the remainder.
 *
 * **Sender identity.** A clinic campaign goes out AS the clinic, not as the
 * platform: the Resend `from` is the clinic's Tier-1 identity (display name on
 * the platform's verified domain) with Reply-To = the clinic's contact inbox,
 * resolved via `getClinicSenderIdentity`. We deliberately do NOT route a
 * campaign blast through the clinic's connected Gmail (Tier 2) even when one is
 * set: campaigns can be hundreds of recipients, which would blow Gmail's
 * per-user rate limit and torch the mailbox's reputation. The Gmail *channel*
 * (`sendChannel='gmail'`) is the explicit, user-chosen "send from my mailbox,
 * one-by-one" path — that already sends from the connected account. Platform
 * (SaaS) campaigns fall back to the platform default identity from `EMAIL_FROM`.
 */

/** Platform-default From for SaaS (customers) campaigns. Mirrors lib/email.ts
 *  so a domain change is one env var, never a code edit. Never the stale
 *  hardcoded DreamCreateWeb.com string. Read at call-time so an env change
 *  takes effect on the next send (no module-load freezing). */
function platformFrom(): string {
  return process.env.EMAIL_FROM?.trim() || 'Dream Create <hello@dreamcreatestudio.com>'
}

/** Env fallback for the CAN-SPAM footer address (used when the sending clinic
 *  has no address on file, or for platform campaigns). Read at call-time. */
function envPostalAddress(): string {
  return process.env.MARKETING_POSTAL_ADDRESS || ''
}

export interface SendOptions {
  organizationId: string
  campaignId: number
  /** If set, only send to these recipient ids (test-send subset). Strings
   * are matched against ResolvedRecipient.id (which is stringified for
   * customer ids and the raw text id for patient ids). */
  recipientIdsOverride?: (number | string)[]
  /** When true, don't record opens/clicks (for test sends). */
  test?: boolean
  /** Required override for Gmail channel: which connected account to send from. */
  gmailAccountId?: string
  /** Display name used in footer + Gmail From header. */
  fromName?: string
  /** When the CALLER already atomically claimed the campaign off its prior
   *  status (the scheduled-send cron flips scheduled → active itself), skip the
   *  internal duplicate-send claim — otherwise the campaign is already 'active'
   *  and the internal claim (which only matches draft/scheduled/paused) fails,
   *  making every scheduled send a no-op. */
  alreadyClaimed?: boolean
}

export interface SendResult {
  channel: 'resend' | 'gmail' | 'twilio_sms'
  attempted: number
  sent: number
  failed: number
  errors: { email: string; error: string }[]
  /** Set when the send was refused before any recipient was contacted — e.g.
   *  a compliance gate (missing postal address) or a duplicate-send claim that
   *  found the campaign already sending/sent. The action surfaces this to the
   *  UI verbatim. */
  skipped?: 'already_sending' | 'missing_postal_address'
  /** Human-readable reason paired with `skipped`. */
  error?: string
}

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  return new Resend(key)
}

/**
 * Resolve the From identity + footer postal address for this campaign.
 *
 * - Clinic source ('patients') OR a clinic-typed org → Tier-1 clinic identity
 *   (display name on the verified domain) + Reply-To clinic inbox + the
 *   clinic's own postal address.
 * - Platform/customers source → platform default From + the env postal address.
 *
 * Returns `postalAddress: null` when nothing usable could be resolved; the
 * caller fails closed (we never send marketing without an address).
 */
async function resolveCampaignSender(
  organizationId: string,
  recipientSource: 'customers' | 'patients',
  fromNameOverride?: string,
): Promise<{
  from: string
  replyTo: string | null
  /** Display name for footer + branding header. */
  name: string
  clinicLogoUrl: string | null
  postalAddress: string | null
}> {
  if (recipientSource === 'patients') {
    const [sender, [profile]] = await Promise.all([
      getClinicSenderIdentity(organizationId),
      db
        .select({
          addressLine1: schema.clinicProfile.addressLine1,
          addressLine2: schema.clinicProfile.addressLine2,
          city: schema.clinicProfile.city,
          state: schema.clinicProfile.state,
          postalCode: schema.clinicProfile.postalCode,
          country: schema.clinicProfile.country,
          logoUrl: schema.clinicProfile.logoUrl,
        })
        .from(schema.clinicProfile)
        .where(eq(schema.clinicProfile.organizationId, organizationId))
        .limit(1),
    ])
    // If a fromName was explicitly passed (legacy callers), prefer it for the
    // visible name but keep the deliverable Tier-1 address from the identity.
    const name = fromNameOverride?.trim() || sender.name
    return {
      from: applyFromName(sender, name),
      replyTo: sender.replyTo,
      name,
      clinicLogoUrl: profile?.logoUrl ?? null,
      postalAddress: resolveMarketingFooterAddress(profile ?? null, envPostalAddress()),
    }
  }

  // Platform / SaaS customers campaign — platform identity, env postal address.
  const platform = platformFrom()
  const name = fromNameOverride?.trim()
  return {
    from: name ? withDisplayName(platform, name) : platform,
    replyTo: null,
    name: name || displayNameOf(platform),
    clinicLogoUrl: null,
    postalAddress: resolveMarketingFooterAddress(null, envPostalAddress()),
  }
}

/** Swap the display name on the clinic Tier-1 `from` header while keeping its
 *  address (`Name <addr>` → `Override <addr>`). */
function applyFromName(sender: ClinicSender, name: string): string {
  return withDisplayName(sender.from, name)
}

/** Replace the display-name portion of a `Name <addr>` header, sanitizing the
 *  override against header injection. Falls back to the original if it has no
 *  angle-bracket address. */
function withDisplayName(header: string, name: string): string {
  const safeName = name.replace(/[\r\n"<>]/g, '').trim().slice(0, 78)
  if (!safeName) return header
  const m = header.match(/<([^>]+)>/)
  if (!m) return header
  return `${safeName} <${m[1]}>`
}

/** Pull the human display name out of a `Name <addr>` header for the footer. */
function displayNameOf(header: string): string {
  const m = header.match(/^\s*"?([^"<]*?)"?\s*</)
  return m?.[1]?.trim() || header
}

export async function sendCampaign(opts: SendOptions): Promise<SendResult> {
  const campaign = await getMarketingCampaign(opts.organizationId, opts.campaignId)
  if (!campaign) throw new Error('Campaign not found')
  if (!campaign.subject) throw new Error('Campaign missing subject')
  if (!campaign.bodyHtml) throw new Error('Campaign missing body')

  const recipientSource = (campaign.recipientSource ?? 'customers') as 'customers' | 'patients'

  // Resolve sender identity + the CAN-SPAM footer address up front. A real
  // send (not a test) with no resolvable postal address fails closed — we will
  // not blast marketing without a physical address.
  const sender = await resolveCampaignSender(
    opts.organizationId,
    recipientSource,
    opts.fromName,
  )
  if (!opts.test && !sender.postalAddress) {
    return {
      channel: campaign.sendChannel,
      attempted: 0,
      sent: 0,
      failed: 0,
      errors: [],
      skipped: 'missing_postal_address',
      error:
        'Add your practice address in Settings → Clinic before sending marketing email.',
    }
  }

  let recipients = await resolveCampaignRecipients(opts.organizationId, opts.campaignId)
  if (opts.recipientIdsOverride?.length) {
    const allow = new Set(opts.recipientIdsOverride.map(String))
    recipients = recipients.filter((r) => allow.has(r.id))
  }
  // Drop recipients the channel can't send to (no email/phone, no opt-in).
  // This is a safety net — the audience resolver enforces opt-in too, but a
  // patient that has since opted out gets caught here.
  recipients = recipients.filter((r) => eligibleForChannel(r, campaign.sendChannel))
  if (!recipients.length) {
    return { channel: campaign.sendChannel, attempted: 0, sent: 0, failed: 0, errors: [] }
  }

  // Duplicate-send guard. Atomically claim the campaign by flipping it to
  // 'active' ONLY if it isn't already active/completed. A double-click or a
  // retry that races the first send claims nothing → we bail with a structured
  // 'already_sending' result instead of blasting the whole list twice. Test
  // sends don't claim (they don't mutate campaign state); `alreadyClaimed`
  // callers (the scheduled-send cron) already won the claim themselves.
  if (!opts.test && !opts.alreadyClaimed) {
    const claimed = await db
      .update(schema.campaigns)
      .set({ status: 'active', updatedAt: new Date() })
      .where(
        and(
          eq(schema.campaigns.id, campaign.id),
          inArray(schema.campaigns.status, ['draft', 'scheduled', 'paused']),
        ),
      )
      .returning({ id: schema.campaigns.id })
    if (!claimed.length) {
      return {
        channel: campaign.sendChannel,
        attempted: 0,
        sent: 0,
        failed: 0,
        errors: [],
        skipped: 'already_sending',
        error: 'This campaign is already sending or has already been sent.',
      }
    }
  }

  // `{{bookingUrl}}` target — only clinic (patient) campaigns carry one.
  const bookingUrl = recipientSource === 'patients'
    ? await resolveClinicBookingUrl(opts.organizationId)
    : null

  // Phase A: only email channels actually send. The 'twilio_sms' enum exists
  // so Phase B can layer the Twilio code path in without a migration, but
  // attempting an SMS send today no-ops with a clear error.
  let result: SendResult
  if (campaign.sendChannel === 'twilio_sms') {
    result = {
      channel: 'twilio_sms',
      attempted: recipients.length,
      sent: 0,
      failed: recipients.length,
      errors: recipients.map((r) => ({
        email: r.phone ?? r.email ?? '(unknown)',
        error: 'SMS channel is not enabled in this build (Phase B). Switch to email.',
      })),
    }
  } else if (campaign.sendChannel === 'gmail') {
    result = await sendViaGmail({ ...opts, campaign, recipients, sender, bookingUrl })
  } else {
    result = await sendViaResend({ ...opts, campaign, recipients, sender, bookingUrl })
  }

  if (!opts.test) {
    // If literally nothing went out (an SMS campaign in this email-only build,
    // or a total send failure), don't lock the campaign as 'completed' — leave
    // it a draft so the clinic can fix the channel/issue and re-send. A partial
    // success (≥1 sent) still completes.
    const nothingSent = result.sent === 0 && result.attempted > 0
    await db
      .update(schema.campaigns)
      .set({
        status: nothingSent ? 'draft' : 'completed',
        sentAt: nothingSent ? null : new Date(),
        sendStats: {
          attempted: result.attempted,
          sent: result.sent,
          failed: result.failed,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.campaigns.id, campaign.id))

    // Ping the campaign creator with the final tally
    if (campaign.createdBy) {
      const success = result.failed === 0
      await notify({
        userId: campaign.createdBy,
        organizationId: opts.organizationId,
        bucket: 'candidates',
        type: success ? 'campaign_sent' : 'campaign_sent_with_errors',
        title: success
          ? `Campaign sent: ${campaign.name}`
          : `Campaign sent with ${result.failed} failure${result.failed === 1 ? '' : 's'}`,
        body: success
          ? `Delivered to ${result.sent} recipient${result.sent === 1 ? '' : 's'}.`
          : `${result.sent} delivered, ${result.failed} failed. Click to review per-recipient status.`,
        linkPath: `/growth/campaigns/${campaign.id}`,
        meta: { campaignId: campaign.id, sent: result.sent, failed: result.failed },
      })
    }
  }

  return result
}

type CampaignSender = Awaited<ReturnType<typeof resolveCampaignSender>>

type InternalSendOpts = SendOptions & {
  campaign: NonNullable<Awaited<ReturnType<typeof getMarketingCampaign>>>
  recipients: ResolvedRecipient[]
  sender: CampaignSender
  /** Clinic booking/site URL for the `{{bookingUrl}}` merge token. Null for
   *  platform (customers) campaigns, which don't carry a booking link. */
  bookingUrl: string | null
}

/**
 * Resolve the clinic's `{{bookingUrl}}` target for a patient campaign: the live
 * `/book` page on pro/premium (where self-scheduling is offered), else the
 * public-site home (basic-tier routes "Book" to the contact form). Returns null
 * when the org has no slug or isn't a clinic — the token then strips to empty.
 */
async function resolveClinicBookingUrl(organizationId: string): Promise<string | null> {
  const [[org], [profile]] = await Promise.all([
    db
      .select({ slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1),
    db
      .select({
        websiteDomain: schema.clinicProfile.websiteDomain,
        planTier: schema.clinicProfile.planTier,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1),
  ])
  if (!org?.slug) return null
  const { publicSiteUrl } = await import('./clinic-site')
  const base = publicSiteUrl({
    slug: org.slug,
    profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
  })
  const tier = profile?.planTier ?? 'basic'
  return tier === 'pro' || tier === 'premium' ? `${base}/book` : base
}

/** Build the per-recipient merge map (firstName falls back to a warm default). */
function recipientMergeFields(r: ResolvedRecipient, bookingUrl: string | null): Record<string, string> {
  return {
    firstName: r.firstName?.trim() || 'there',
    bookingUrl: bookingUrl ?? '',
  }
}

export interface CampaignPreviewDraft {
  subject: string
  previewText: string
  bodyHtml: string
}

export interface CampaignPreviewResult {
  /** A full, ready-to-render email document (the same shell a recipient gets). */
  html: string
  /** Subject after merge-field substitution (may be empty for a draft). */
  subject: string
  /** First name used in the merge — a real audience member's, or a sample. */
  sampleName: string
  /** True when the sample is the first real audience member; false = synthetic. */
  realRecipient: boolean
  /** The visible From header, e.g. `Acme Dental <acme@dreamcreatestudio.com>`. */
  fromLabel: string
}

/**
 * Render a campaign EXACTLY as a recipient would receive it — same branded
 * shell, footer, postal address, and `{{firstName}}`/`{{bookingUrl}}` merge as
 * the live send path (reuses resolveCampaignSender + renderCampaignEmail), so a
 * clinic can spot-check personalization + layout BEFORE sending. Differences
 * from a real send: tracking is OFF (no open pixel / no link rewriting) and
 * every link is neutralized, so opening + clicking around the preview can't
 * fire a real open / click / unsubscribe against the sample recipient.
 *
 * The sample is the FIRST audience member that has an address (so the clinic
 * sees a true personalization); with no audience chosen — or one that resolves
 * to nobody — it falls back to a clearly-synthetic "Taylor". `defaultSource`
 * (derived from the caller's tenant type) picks the sender voice in that case;
 * when a real recipient exists, its own customer/patient identity decides.
 */
export async function buildCampaignPreview(
  organizationId: string,
  campaignId: number,
  draft: CampaignPreviewDraft,
  defaultSource: 'customers' | 'patients',
): Promise<CampaignPreviewResult> {
  const campaign = await getMarketingCampaign(organizationId, campaignId)
  if (!campaign) throw new Error('Campaign not found')

  const recipients = campaign.audienceId
    ? await resolveCampaignRecipients(organizationId, campaignId)
    : []
  // Prefer a recipient we could actually email so the preview is representative.
  const sample = recipients.find((r) => !!r.email) ?? recipients[0] ?? null
  const recipientSource: 'customers' | 'patients' =
    sample?.patientId != null
      ? 'patients'
      : sample?.customerId != null
        ? 'customers'
        : defaultSource

  const sender = await resolveCampaignSender(organizationId, recipientSource)
  const bookingUrl =
    recipientSource === 'patients' ? await resolveClinicBookingUrl(organizationId) : null

  const sampleName = sample ? sample.firstName?.trim() || 'there' : 'Taylor'
  const mergeFields = { firstName: sampleName, bookingUrl: bookingUrl ?? '' }
  const subject = applyMergeFields(draft.subject || '', mergeFields)

  const { html } = renderCampaignEmail({
    campaignId: campaign.id,
    recipientEmail: sample?.email || 'sample@example.com',
    recipientCustomerId: sample?.customerId ?? undefined,
    recipientPatientId: sample?.patientId ?? undefined,
    subject: subject || '(no subject yet)',
    previewText: draft.previewText || null,
    bodyHtml: draft.bodyHtml?.trim()
      ? draft.bodyHtml
      : '<p style="color:#a8a29e">Your email body is empty — add content to see it here.</p>',
    fromName: sender.name,
    clinicName: sender.name,
    clinicLogoUrl: sender.clinicLogoUrl,
    postalAddress: sender.postalAddress,
    tracking: false,
    mergeFields,
  })

  return {
    html: neutralizePreviewLinks(html),
    subject,
    sampleName,
    realRecipient: !!sample,
    fromLabel: sender.from,
  }
}

/** Strip every link target to `#` so a click inside the preview iframe can't
 *  navigate to a real tracking / unsubscribe endpoint (the UI also sandboxes
 *  the iframe, so this is defense in depth). */
export function neutralizePreviewLinks(html: string): string {
  return html.replace(/href=("|')([^"']*)\1/gi, 'href="#"')
}

/**
 * Filter recipients to those a given channel can actually send to. For email
 * channels we need a non-null email AND email opt-in. For SMS we need a
 * non-null phone AND sms opt-in. The audience filter already enforces opt-in,
 * but we double-check at send time so a downgraded audience definition can't
 * leak an opted-out recipient.
 */
export function eligibleForChannel(
  recipient: ResolvedRecipient,
  channel: 'resend' | 'gmail' | 'twilio_sms',
): boolean {
  if (channel === 'twilio_sms') {
    return !!recipient.phone && recipient.smsOptIn
  }
  return !!recipient.email && recipient.emailOptIn
}

async function sendViaResend(opts: InternalSendOpts): Promise<SendResult> {
  const resend = getResend()
  const errors: { email: string; error: string }[] = []
  let sent = 0
  const cap = Math.min(opts.recipients.length, 1000) // soft cap per invocation

  for (let i = 0; i < cap; i++) {
    const r = opts.recipients[i]
    if (!r.email) continue
    const mergeFields = recipientMergeFields(r, opts.bookingUrl)
    const subject = applyMergeFields(opts.campaign.subject!, mergeFields)
    const { html, text, unsubUrl } = renderCampaignEmail({
      campaignId: opts.campaign.id,
      recipientEmail: r.email,
      recipientCustomerId: r.customerId ?? undefined,
      recipientPatientId: r.patientId ?? undefined,
      subject,
      previewText: opts.campaign.previewText,
      bodyHtml: opts.campaign.bodyHtml!,
      fromName: opts.fromName ?? opts.sender.name,
      clinicName: opts.sender.name,
      clinicLogoUrl: opts.sender.clinicLogoUrl,
      postalAddress: opts.sender.postalAddress,
      tracking: !opts.test,
      mergeFields,
    })

    const tags = [
      { name: 'campaignId', value: String(opts.campaign.id) },
    ]
    if (r.customerId != null) tags.push({ name: 'customerId', value: String(r.customerId) })
    if (r.patientId != null) tags.push({ name: 'patientId', value: r.patientId })

    try {
      // Resend returns `{ data, error }` and does not throw — surface a send
      // failure so it's recorded as 'failed', not silently counted as 'sent'.
      const res = await resend.emails.send({
        from: opts.sender.from,
        to: r.email,
        subject,
        html,
        text,
        ...(opts.sender.replyTo ? { replyTo: opts.sender.replyTo } : {}),
        // RFC-8058 one-click unsubscribe — Gmail/Yahoo bulk-sender requirement.
        // Reuses the exact per-recipient token URL the footer link uses.
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags,
      })
      if (res?.error) throw new Error(res.error.message || 'Resend send failed')
      if (!opts.test) {
        await db.insert(schema.campaignEvents).values({
          campaignId: opts.campaign.id,
          recipientEmail: r.email.toLowerCase(),
          customerId: r.customerId,
          patientId: r.patientId,
          type: 'sent',
          meta: { channel: 'resend' },
        })
      }
      sent++
    } catch (err) {
      errors.push({ email: r.email, error: err instanceof Error ? err.message : 'unknown' })
      if (!opts.test) {
        await db.insert(schema.campaignEvents).values({
          campaignId: opts.campaign.id,
          recipientEmail: r.email.toLowerCase(),
          customerId: r.customerId,
          patientId: r.patientId,
          type: 'failed',
          meta: { channel: 'resend', error: err instanceof Error ? err.message : 'unknown' },
        })
      }
    }
  }

  return { channel: 'resend', attempted: cap, sent, failed: errors.length, errors }
}

async function sendViaGmail(opts: InternalSendOpts): Promise<SendResult> {
  if (!opts.gmailAccountId) throw new Error('Gmail channel requires gmailAccountId')

  // Verify account belongs to this org
  const [account] = await db
    .select({
      id: schema.emailAccount.id,
      emailAddress: schema.emailAccount.emailAddress,
      displayName: schema.emailAccount.displayName,
    })
    .from(schema.emailAccount)
    .where(
      and(
        eq(schema.emailAccount.id, opts.gmailAccountId),
        eq(schema.emailAccount.organizationId, opts.organizationId),
      ),
    )
    .limit(1)
  if (!account) throw new Error('Gmail account not found for this org')

  const accessToken = await getAccessToken(account.id)
  const fromHeader = account.displayName
    ? `${account.displayName} <${account.emailAddress}>`
    : account.emailAddress
  const errors: { email: string; error: string }[] = []
  let sent = 0
  // Conservative cap per invocation to stay under Gmail's per-user rate limits
  const cap = Math.min(opts.recipients.length, 100)

  for (let i = 0; i < cap; i++) {
    const r = opts.recipients[i]
    if (!r.email) continue
    const mergeFields = recipientMergeFields(r, opts.bookingUrl)
    const subject = applyMergeFields(opts.campaign.subject!, mergeFields)
    const { html, text } = renderCampaignEmail({
      campaignId: opts.campaign.id,
      recipientEmail: r.email,
      recipientCustomerId: r.customerId ?? undefined,
      recipientPatientId: r.patientId ?? undefined,
      subject,
      previewText: opts.campaign.previewText,
      bodyHtml: opts.campaign.bodyHtml!,
      fromName: opts.fromName ?? account.displayName ?? opts.sender.name,
      clinicName: opts.sender.name,
      clinicLogoUrl: opts.sender.clinicLogoUrl,
      postalAddress: opts.sender.postalAddress,
      tracking: !opts.test,
      mergeFields,
    })

    try {
      // The Gmail send path can't carry RFC-8058 List-Unsubscribe headers
      // (the gmail.ts message builder doesn't expose custom headers), but this
      // is the one-by-one warm-send channel — not a "bulk sender" in the
      // Gmail/Yahoo sense — so the body unsubscribe link satisfies CAN-SPAM.
      await sendGmailMessage(accessToken, {
        from: fromHeader,
        to: [r.email],
        subject,
        bodyText: text,
        bodyHtml: html,
      })
      if (!opts.test) {
        await db.insert(schema.campaignEvents).values({
          campaignId: opts.campaign.id,
          recipientEmail: r.email.toLowerCase(),
          customerId: r.customerId,
          patientId: r.patientId,
          type: 'sent',
          meta: { channel: 'gmail', from: account.emailAddress },
        })
      }
      sent++
      // Gentle pacing between sends to avoid tripping rate limits
      if (i + 1 < cap) await new Promise((res) => setTimeout(res, 150))
    } catch (err) {
      errors.push({ email: r.email, error: err instanceof Error ? err.message : 'unknown' })
      if (!opts.test) {
        await db.insert(schema.campaignEvents).values({
          campaignId: opts.campaign.id,
          recipientEmail: r.email.toLowerCase(),
          customerId: r.customerId,
          patientId: r.patientId,
          type: 'failed',
          meta: { channel: 'gmail', error: err instanceof Error ? err.message : 'unknown' },
        })
      }
    }
  }

  return { channel: 'gmail', attempted: cap, sent, failed: errors.length, errors }
}
