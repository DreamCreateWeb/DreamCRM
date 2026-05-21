import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { resolveAudience, type AudienceFilterT, type PatientAudienceFilterT, type ResolvedRecipient } from './marketing'

/**
 * Campaign CRUD + analytics. Send + tracking event recording live in
 * lib/services/marketing-send.ts.
 *
 * Body is stored twice: bodyHtml is the rendered HTML (what we send), bodyJson
 * is the Tiptap document. We keep both so we can reopen the editor on an
 * existing campaign and round-trip it.
 */

export const CampaignChannel = z.enum(['resend', 'gmail'])

export const CampaignInput = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(200).optional().nullable(),
  previewText: z.string().max(200).optional().nullable(),
  bodyHtml: z.string().max(200_000).optional().nullable(),
  bodyJson: z.any().optional().nullable(),
  audienceId: z.number().int().nullable().optional(),
  sendChannel: CampaignChannel.default('resend'),
  scheduledAt: z.string().datetime().optional().nullable(),
})

export const CampaignUpdate = CampaignInput.partial()

export type CampaignChannelT = z.infer<typeof CampaignChannel>

export interface CampaignStats {
  sent: number
  delivered: number
  open: number
  click: number
  bounce: number
  unsubscribe: number
  uniqueOpens: number
  uniqueClicks: number
}

export async function listMarketingCampaigns(organizationId: string) {
  return db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.organizationId, organizationId))
    .orderBy(desc(schema.campaigns.createdAt))
}

export async function getMarketingCampaign(organizationId: string, id: number) {
  const [row] = await db
    .select()
    .from(schema.campaigns)
    .where(
      and(eq(schema.campaigns.id, id), eq(schema.campaigns.organizationId, organizationId)),
    )
    .limit(1)
  return row ?? null
}

export async function createMarketingCampaign(
  organizationId: string,
  input: z.infer<typeof CampaignInput>,
  userId: string,
) {
  const data = CampaignInput.parse(input)
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      organizationId,
      name: data.name,
      subject: data.subject ?? null,
      previewText: data.previewText ?? null,
      bodyHtml: data.bodyHtml ?? null,
      bodyJson: data.bodyJson ?? null,
      audienceId: data.audienceId ?? null,
      sendChannel: data.sendChannel,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      createdBy: userId,
      status: 'draft',
    })
    .returning()
  return row
}

export async function updateMarketingCampaign(
  organizationId: string,
  id: number,
  input: Partial<z.infer<typeof CampaignInput>>,
) {
  // Hand-roll the patch so we don't clobber unsent fields with undefined
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name
  if (input.subject !== undefined) patch.subject = input.subject
  if (input.previewText !== undefined) patch.previewText = input.previewText
  if (input.bodyHtml !== undefined) patch.bodyHtml = input.bodyHtml
  if (input.bodyJson !== undefined) patch.bodyJson = input.bodyJson
  if (input.audienceId !== undefined) patch.audienceId = input.audienceId
  if (input.sendChannel !== undefined) patch.sendChannel = input.sendChannel
  if (input.scheduledAt !== undefined) {
    patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
  }

  const [row] = await db
    .update(schema.campaigns)
    .set(patch)
    .where(
      and(eq(schema.campaigns.id, id), eq(schema.campaigns.organizationId, organizationId)),
    )
    .returning()
  return row ?? null
}

export async function deleteMarketingCampaign(organizationId: string, id: number) {
  const rows = await db
    .delete(schema.campaigns)
    .where(
      and(eq(schema.campaigns.id, id), eq(schema.campaigns.organizationId, organizationId)),
    )
    .returning({ id: schema.campaigns.id })
  return { deleted: rows.length }
}

/** Aggregate counts across all event rows for one campaign. */
export async function getCampaignStats(campaignId: number): Promise<CampaignStats> {
  const rows = await db
    .select({
      type: schema.campaignEvents.type,
      count: sql<number>`count(*)::int`,
      unique: sql<number>`count(distinct ${schema.campaignEvents.recipientEmail})::int`,
    })
    .from(schema.campaignEvents)
    .where(eq(schema.campaignEvents.campaignId, campaignId))
    .groupBy(schema.campaignEvents.type)

  const stats: CampaignStats = {
    sent: 0,
    delivered: 0,
    open: 0,
    click: 0,
    bounce: 0,
    unsubscribe: 0,
    uniqueOpens: 0,
    uniqueClicks: 0,
  }
  for (const r of rows) {
    switch (r.type) {
      case 'sent': stats.sent = r.count; break
      case 'delivered': stats.delivered = r.count; break
      case 'open': stats.open = r.count; stats.uniqueOpens = r.unique; break
      case 'click': stats.click = r.count; stats.uniqueClicks = r.unique; break
      case 'bounce': stats.bounce = r.count; break
      case 'unsubscribe': stats.unsubscribe = r.count; break
    }
  }
  return stats
}

/** Per-recipient breakdown: 1 row per email that received this campaign,
 * with timestamps of their last-known event of each type. */
export async function getRecipientBreakdown(campaignId: number) {
  const rows = await db
    .select({
      email: schema.campaignEvents.recipientEmail,
      type: schema.campaignEvents.type,
      occurredAt: schema.campaignEvents.occurredAt,
      customerId: schema.campaignEvents.customerId,
    })
    .from(schema.campaignEvents)
    .where(eq(schema.campaignEvents.campaignId, campaignId))
    .orderBy(desc(schema.campaignEvents.occurredAt))

  const byEmail = new Map<
    string,
    {
      email: string
      customerId: number | null
      sentAt: Date | null
      openedAt: Date | null
      clickedAt: Date | null
      bouncedAt: Date | null
      unsubAt: Date | null
      failedAt: Date | null
    }
  >()
  for (const r of rows) {
    const cur = byEmail.get(r.email) ?? {
      email: r.email,
      customerId: r.customerId,
      sentAt: null,
      openedAt: null,
      clickedAt: null,
      bouncedAt: null,
      unsubAt: null,
      failedAt: null,
    }
    switch (r.type) {
      case 'sent':
      case 'delivered':
        if (!cur.sentAt) cur.sentAt = r.occurredAt
        break
      case 'open':
        if (!cur.openedAt) cur.openedAt = r.occurredAt
        break
      case 'click':
        if (!cur.clickedAt) cur.clickedAt = r.occurredAt
        break
      case 'bounce':
        if (!cur.bouncedAt) cur.bouncedAt = r.occurredAt
        break
      case 'unsubscribe':
        if (!cur.unsubAt) cur.unsubAt = r.occurredAt
        break
      case 'failed':
        if (!cur.failedAt) cur.failedAt = r.occurredAt
        break
    }
    byEmail.set(r.email, cur)
  }
  return Array.from(byEmail.values()).sort((a, b) =>
    (b.openedAt?.getTime() ?? 0) - (a.openedAt?.getTime() ?? 0),
  )
}

/**
 * Resolve the recipient list for a campaign. Returns the full ResolvedRecipient
 * shape so the send orchestrator has email + phone + opt-in state and can tag
 * events with the right discriminator (customerId vs patientId). Empty array
 * if no audience.
 */
export async function resolveCampaignRecipients(
  organizationId: string,
  campaignId: number,
): Promise<ResolvedRecipient[]> {
  const campaign = await getMarketingCampaign(organizationId, campaignId)
  if (!campaign?.audienceId) return []
  const [audience] = await db
    .select()
    .from(schema.audiences)
    .where(
      and(
        eq(schema.audiences.id, campaign.audienceId),
        eq(schema.audiences.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!audience) return []
  return resolveAudience(organizationId, {
    recipientSource: (audience.recipientSource ?? 'customers') as 'customers' | 'patients',
    filter: (audience.filter ?? {}) as AudienceFilterT,
    patientFilter: (audience.patientFilter ?? {}) as PatientAudienceFilterT,
  })
}
