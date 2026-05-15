import 'server-only'
import { and, desc, eq, ilike, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { CAMPAIGN_STATUSES, type CampaignStatus } from '@/lib/types/campaigns'

export { CAMPAIGN_STATUSES, type CampaignStatus }

export const CampaignInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(CAMPAIGN_STATUSES).default('draft'),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  budgetCents: z.number().int().min(0).default(0),
})

export async function listCampaigns(opts: { search?: string } = {}) {
  return db
    .select()
    .from(schema.campaigns)
    .where(opts.search ? ilike(schema.campaigns.name, `%${opts.search}%`) : undefined)
    .orderBy(desc(schema.campaigns.createdAt))
}

export async function getCampaignMembers(campaignIds: number[]) {
  if (!campaignIds.length) return []
  return db
    .select({
      campaignId: schema.campaignMembers.campaignId,
      userId: schema.users.id,
      name: schema.users.name,
      image: schema.users.image,
    })
    .from(schema.campaignMembers)
    .innerJoin(schema.users, eq(schema.campaignMembers.userId, schema.users.id))
    .where(inArray(schema.campaignMembers.campaignId, campaignIds))
}

export async function createCampaign(input: z.infer<typeof CampaignInput>, userId: string) {
  const data = CampaignInput.parse(input)
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      budgetCents: data.budgetCents,
      createdBy: userId,
    })
    .returning()
  // Owner joins as a member by default
  await db
    .insert(schema.campaignMembers)
    .values({ campaignId: row.id, userId, role: 'owner' })
    .onConflictDoNothing()
  return row
}

export async function deleteCampaign(id: number) {
  const rows = await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id)).returning({ id: schema.campaigns.id })
  return { deleted: rows.length }
}

export async function setCampaignStatus(id: number, status: CampaignStatus) {
  const [row] = await db
    .update(schema.campaigns)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.campaigns.id, id))
    .returning()
  return row
}
