import 'server-only'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { resolveAudience, type AudienceFilterT, type PatientAudienceFilterT, type ResolvedRecipient } from './marketing'
import { getTemplate } from './marketing-templates'
import { emptyFunnel, type CampaignFunnel } from './campaign-funnel'

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
  /** Start-from template: seeds subject/preview/body at creation and is
   *  stamped on the row for provenance + attribution bucketing. */
  templateId: z.number().int().nullable().optional(),
  /** Who this campaign emails. Server actions stamp it from tenant type —
   *  clinic staff create 'patients' campaigns, the platform 'customers'.
   *  Everything at send time keys off this column (sender identity, the
   *  frequency cap, bookingUrl), so leaving it to the schema default
   *  ('customers') for a clinic campaign breaks all three. */
  recipientSource: z.enum(['customers', 'patients']).optional(),
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

export interface CampaignHistoryRow {
  id: number
  name: string
  subject: string | null
  status: string
  sendChannel: string
  sentAt: Date | null
  scheduledAt: Date | null
  updatedAt: Date
  automationKey: string | null
  funnel: CampaignFunnel
}

/**
 * The campaigns list + per-campaign funnel in two queries — feeds the
 * Outreach hub's history section (the clinic's one home for sends after
 * the phase-3 fold). Auto-send campaigns carry their automationKey so the
 * row can say "sent by the birthday automation".
 */
export async function listCampaignsWithFunnels(
  organizationId: string,
  opts?: { limit?: number },
): Promise<CampaignHistoryRow[]> {
  const rows = await db
    .select({
      id: schema.campaigns.id,
      name: schema.campaigns.name,
      subject: schema.campaigns.subject,
      status: schema.campaigns.status,
      sendChannel: schema.campaigns.sendChannel,
      sentAt: schema.campaigns.sentAt,
      scheduledAt: schema.campaigns.scheduledAt,
      updatedAt: schema.campaigns.updatedAt,
      automationKey: schema.campaigns.automationKey,
    })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.organizationId, organizationId))
    .orderBy(desc(schema.campaigns.createdAt))
    .limit(opts?.limit ?? 50)

  const funnels = new Map<number, CampaignFunnel>()
  if (rows.length > 0) {
    const events = await db
      .select({
        campaignId: schema.campaignEvents.campaignId,
        type: schema.campaignEvents.type,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.campaignEvents)
      .where(inArray(schema.campaignEvents.campaignId, rows.map((r) => r.id)))
      .groupBy(schema.campaignEvents.campaignId, schema.campaignEvents.type)
    for (const e of events) {
      const f = funnels.get(e.campaignId) ?? emptyFunnel()
      if (e.type === 'sent') f.sent += e.count
      else if (e.type === 'open') f.opened += e.count
      else if (e.type === 'click') f.clicked += e.count
      else if (e.type === 'booked') f.booked += e.count
      funnels.set(e.campaignId, f)
    }
  }
  return rows.map((r) => ({ ...r, funnel: funnels.get(r.id) ?? emptyFunnel() }))
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
  // "Start from" a template: seed the content fields the caller didn't set
  // and stamp templateId for provenance. getTemplate is org-scoped (system
  // templates + this org's custom ones) — a foreign id resolves to null and
  // is silently dropped, so a guessed id can never leak another org's copy.
  const tpl = data.templateId ? await getTemplate(organizationId, data.templateId) : null
  // recipientSource precedence: explicit (server actions stamp it from tenant
  // type) → the chosen audience's source → 'customers'. The column must match
  // who's actually emailed: sender identity, the frequency cap, and bookingUrl
  // all branch on it at send time.
  const recipientSource =
    data.recipientSource ??
    (data.audienceId ? await getAudienceRecipientSource(organizationId, data.audienceId) : null) ??
    'customers'
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      organizationId,
      name: data.name,
      subject: data.subject ?? tpl?.subject ?? null,
      previewText: data.previewText ?? tpl?.previewText ?? null,
      bodyHtml: data.bodyHtml ?? tpl?.bodyHtml ?? null,
      bodyJson: data.bodyJson ?? tpl?.bodyJson ?? null,
      audienceId: data.audienceId ?? null,
      sendChannel: data.sendChannel,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      templateId: tpl?.id ?? null,
      recipientSource,
      createdBy: userId,
      status: 'draft',
    })
    .returning()
  return row
}

/** The recipientSource of an org's audience, or null if it doesn't exist. */
export async function getAudienceRecipientSource(
  organizationId: string,
  audienceId: number,
): Promise<'customers' | 'patients' | null> {
  const [aud] = await db
    .select({ recipientSource: schema.audiences.recipientSource })
    .from(schema.audiences)
    .where(
      and(eq(schema.audiences.id, audienceId), eq(schema.audiences.organizationId, organizationId)),
    )
    .limit(1)
  return aud?.recipientSource === 'patients' || aud?.recipientSource === 'customers'
    ? aud.recipientSource
    : null
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
  if (input.audienceId !== undefined) {
    patch.audienceId = input.audienceId
    // Keep recipientSource true to the audience actually targeted — a stale
    // 'customers' on a patient campaign would skip the frequency cap and send
    // with platform branding.
    if (input.audienceId !== null) {
      const source = await getAudienceRecipientSource(organizationId, input.audienceId)
      if (source) patch.recipientSource = source
    }
  }
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

/** Minimum lead time for a scheduled send — guards against "schedule in the
 *  past / 30 seconds out" mistakes and gives the cron room to pick it up. */
export const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000

export type ScheduleResult = { ok: true } | { ok: false; error: string }

/**
 * Queue a campaign to send at `scheduledAt` (status → 'scheduled'). The
 * send-scheduled-campaigns cron dispatches it once the time arrives. Validates
 * the campaign is sendable (subject + body + audience) and the time is at least
 * SCHEDULE_MIN_LEAD_MS out — mirrors the "Send now" preconditions so a scheduled
 * send can't fail at dispatch for a reason we could catch now. Only draft or
 * already-scheduled campaigns can be (re)scheduled — never a completed/active one.
 */
export async function scheduleCampaign(
  organizationId: string,
  id: number,
  scheduledAtIso: string,
  now: Date = new Date(),
): Promise<ScheduleResult> {
  const campaign = await getMarketingCampaign(organizationId, id)
  if (!campaign) return { ok: false, error: 'Campaign not found' }
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return { ok: false, error: 'Only a draft campaign can be scheduled.' }
  }
  if (!campaign.subject) return { ok: false, error: 'Add a subject before scheduling.' }
  if (!campaign.bodyHtml) return { ok: false, error: 'Write the email body before scheduling.' }
  if (!campaign.audienceId) return { ok: false, error: 'Choose an audience before scheduling.' }

  const at = new Date(scheduledAtIso)
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'Invalid date/time.' }
  if (at.getTime() < now.getTime() + SCHEDULE_MIN_LEAD_MS) {
    return { ok: false, error: 'Pick a time at least 5 minutes from now.' }
  }

  await db
    .update(schema.campaigns)
    .set({ status: 'scheduled', scheduledAt: at, sentAt: null, updatedAt: new Date() })
    .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.organizationId, organizationId)))
  return { ok: true }
}

/** Pull a scheduled campaign back to draft (clears scheduledAt). No-op-safe:
 *  only flips rows currently 'scheduled', so it can't disturb one the cron just
 *  claimed (status would already be 'active'). */
export async function cancelScheduledCampaign(organizationId: string, id: number): Promise<ScheduleResult> {
  const rows = await db
    .update(schema.campaigns)
    .set({ status: 'draft', scheduledAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.campaigns.id, id),
        eq(schema.campaigns.organizationId, organizationId),
        eq(schema.campaigns.status, 'scheduled'),
      ),
    )
    .returning({ id: schema.campaigns.id })
  if (rows.length === 0) return { ok: false, error: 'Campaign is not scheduled (it may have already started sending).' }
  return { ok: true }
}

/** Aggregate counts across all event rows for one campaign. Org-scoped by an
 *  inner join to `campaigns` — `campaign_events` has no organization_id of its
 *  own, so a bare `campaignId` filter would be a cross-tenant read if any caller
 *  ever passed a foreign (guessable serial) id. The join makes it impossible to
 *  return another org's events regardless of the caller. */
export async function getCampaignStats(organizationId: string, campaignId: number): Promise<CampaignStats> {
  const rows = await db
    .select({
      type: schema.campaignEvents.type,
      count: sql<number>`count(*)::int`,
      unique: sql<number>`count(distinct ${schema.campaignEvents.recipientEmail})::int`,
    })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(
      and(
        eq(schema.campaignEvents.campaignId, campaignId),
        eq(schema.campaigns.organizationId, organizationId),
      ),
    )
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
 * with timestamps of their last-known event of each type. Org-scoped by the
 * same `campaigns` inner join as getCampaignStats — this returns recipient
 * emails + customer ids, so a bare campaignId filter would be a cross-tenant
 * PHI-adjacent leak if a foreign id ever reached it. */
export async function getRecipientBreakdown(organizationId: string, campaignId: number) {
  const rows = await db
    .select({
      email: schema.campaignEvents.recipientEmail,
      type: schema.campaignEvents.type,
      occurredAt: schema.campaignEvents.occurredAt,
      customerId: schema.campaignEvents.customerId,
    })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(
      and(
        eq(schema.campaignEvents.campaignId, campaignId),
        eq(schema.campaigns.organizationId, organizationId),
      ),
    )
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
