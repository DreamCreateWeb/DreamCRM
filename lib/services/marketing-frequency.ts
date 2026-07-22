import 'server-only'
import { and, eq, gte, inArray, like, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * The cross-campaign frequency cap (campaigns phase 4, 2026-07-22): no
 * patient gets more than MAX_SENDS marketing emails in any rolling
 * WINDOW_DAYS — across manual campaigns AND the retention automations
 * (both write the same campaign_events 'sent' rows, so one query covers
 * every marketing sender). Transactional email (reminders, receipts,
 * portal invites) is not campaign email and never counts.
 */

export const FREQUENCY_MAX_SENDS = 2
export const FREQUENCY_WINDOW_DAYS = 7

/**
 * Partition recipients into those still under the cap and those already at
 * it. Org-scoped via the campaigns join (campaign_events has no org column
 * of its own). One grouped query regardless of list size.
 */
export async function partitionByFrequencyCap<R extends { email: string | null }>(
  organizationId: string,
  recipients: R[],
  now: Date = new Date(),
): Promise<{ allowed: R[]; suppressed: R[] }> {
  const emails = recipients.map((r) => r.email).filter((e): e is string => !!e)
  if (emails.length === 0) return { allowed: recipients, suppressed: [] }

  const since = new Date(now.getTime() - FREQUENCY_WINDOW_DAYS * 86_400_000)
  const rows = await db
    .select({ email: schema.campaignEvents.recipientEmail })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        eq(schema.campaignEvents.type, 'sent'),
        gte(schema.campaignEvents.occurredAt, since),
        inArray(schema.campaignEvents.recipientEmail, emails),
      ),
    )

  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.email, (counts.get(r.email) ?? 0) + 1)

  const allowed: R[] = []
  const suppressed: R[] = []
  for (const r of recipients) {
    if (r.email && (counts.get(r.email) ?? 0) >= FREQUENCY_MAX_SENDS) suppressed.push(r)
    else allowed.push(r)
  }
  return { allowed, suppressed }
}

/**
 * One-shot automation guard: partition out recipients who already received a
 * send from ANY campaign whose automationKey starts with `automationKeyPrefix`
 * (e.g. 'welcome:'). The weekly welcome key + 7-day audience window can
 * overlap by a few minutes of cron jitter at the week boundary — this makes
 * "welcomed exactly once" true by construction instead of by timing.
 */
export async function partitionByPriorAutomationSend<R extends { email: string | null }>(
  organizationId: string,
  automationKeyPrefix: string,
  recipients: R[],
  excludeCampaignId?: number,
): Promise<{ allowed: R[]; suppressed: R[] }> {
  const emails = recipients.map((r) => r.email).filter((e): e is string => !!e)
  if (emails.length === 0) return { allowed: recipients, suppressed: [] }

  const conditions = [
    eq(schema.campaigns.organizationId, organizationId),
    like(schema.campaigns.automationKey, `${automationKeyPrefix}%`),
    eq(schema.campaignEvents.type, 'sent'),
    inArray(schema.campaignEvents.recipientEmail, emails),
  ]
  if (excludeCampaignId !== undefined) conditions.push(ne(schema.campaigns.id, excludeCampaignId))

  const rows = await db
    .select({ email: schema.campaignEvents.recipientEmail })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(and(...conditions))

  const alreadySent = new Set(rows.map((r) => r.email))
  const allowed: R[] = []
  const suppressed: R[] = []
  for (const r of recipients) {
    if (r.email && alreadySent.has(r.email)) suppressed.push(r)
    else allowed.push(r)
  }
  return { allowed, suppressed }
}
