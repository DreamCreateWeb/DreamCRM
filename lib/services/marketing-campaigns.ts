import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { resolveAudience, type AudienceFilterT } from './marketing'

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

/** Resolve the recipient list for a campaign. Empty array if no audience. */
export async function resolveCampaignRecipients(
  organizationId: string,
  campaignId: number,
): Promise<{ id: number; name: string; email: string }[]> {
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
  const rows = await resolveAudience(organizationId, (audience.filter ?? {}) as AudienceFilterT)
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email }))
}
