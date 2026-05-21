import 'server-only'
import { Resend } from 'resend'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { renderCampaignEmail } from '@/lib/marketing/render-email'
import { getAccessToken, sendMessage as sendGmailMessage } from './gmail'
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
 *   sends. Tags each send with `campaignId` + `customerId` so the webhook
 *   can map bounce/complaint events back to our rows.
 * - **Gmail** — sends from the org's connected mailbox, one-by-one. Warmer
 *   for cold outreach but rate-limited (~500/day per account) so we cap at
 *   100 per send invocation; you can re-run for the remainder.
 */

const FROM_DEFAULT = 'Dream Create <Hello@DreamCreateWeb.com>'
const POSTAL_ADDRESS = process.env.MARKETING_POSTAL_ADDRESS || ''

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
}

export interface SendResult {
  channel: 'resend' | 'gmail' | 'twilio_sms'
  attempted: number
  sent: number
  failed: number
  errors: { email: string; error: string }[]
}

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  return new Resend(key)
}

export async function sendCampaign(opts: SendOptions): Promise<SendResult> {
  const campaign = await getMarketingCampaign(opts.organizationId, opts.campaignId)
  if (!campaign) throw new Error('Campaign not found')
  if (!campaign.subject) throw new Error('Campaign missing subject')
  if (!campaign.bodyHtml) throw new Error('Campaign missing body')

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

  // Mark in-flight
  if (!opts.test) {
    await db
      .update(schema.campaigns)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(schema.campaigns.id, campaign.id))
  }

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
    result = await sendViaGmail({ ...opts, campaign, recipients })
  } else {
    result = await sendViaResend({ ...opts, campaign, recipients })
  }

  if (!opts.test) {
    await db
      .update(schema.campaigns)
      .set({
        status: 'completed',
        sentAt: new Date(),
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
        linkPath: `/marketing/campaigns/${campaign.id}`,
        meta: { campaignId: campaign.id, sent: result.sent, failed: result.failed },
      })
    }
  }

  return result
}

type InternalSendOpts = SendOptions & {
  campaign: NonNullable<Awaited<ReturnType<typeof getMarketingCampaign>>>
  recipients: ResolvedRecipient[]
}

/**
 * Filter recipients to those a given channel can actually send to. For email
 * channels we need a non-null email AND email opt-in. For SMS we need a
 * non-null phone AND sms opt-in. The audience filter already enforces opt-in,
 * but we double-check at send time so a downgraded audience definition can't
 * leak an opted-out recipient.
 */
function eligibleForChannel(
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
    const { html, text } = renderCampaignEmail({
      campaignId: opts.campaign.id,
      recipientEmail: r.email,
      recipientCustomerId: r.customerId ?? undefined,
      recipientPatientId: r.patientId ?? undefined,
      subject: opts.campaign.subject!,
      previewText: opts.campaign.previewText,
      bodyHtml: opts.campaign.bodyHtml!,
      fromName: opts.fromName,
      postalAddress: POSTAL_ADDRESS,
      tracking: !opts.test,
    })

    const tags = [
      { name: 'campaignId', value: String(opts.campaign.id) },
    ]
    if (r.customerId != null) tags.push({ name: 'customerId', value: String(r.customerId) })
    if (r.patientId != null) tags.push({ name: 'patientId', value: r.patientId })

    try {
      await resend.emails.send({
        from: opts.fromName ? `${opts.fromName} <Hello@DreamCreateWeb.com>` : FROM_DEFAULT,
        to: r.email,
        subject: opts.campaign.subject!,
        html,
        text,
        tags,
      })
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
    const { html, text } = renderCampaignEmail({
      campaignId: opts.campaign.id,
      recipientEmail: r.email,
      recipientCustomerId: r.customerId ?? undefined,
      recipientPatientId: r.patientId ?? undefined,
      subject: opts.campaign.subject!,
      previewText: opts.campaign.previewText,
      bodyHtml: opts.campaign.bodyHtml!,
      fromName: opts.fromName ?? account.displayName ?? undefined,
      postalAddress: POSTAL_ADDRESS,
      tracking: !opts.test,
    })

    try {
      await sendGmailMessage(accessToken, {
        from: fromHeader,
        to: [r.email],
        subject: opts.campaign.subject!,
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
