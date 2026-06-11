import 'server-only'
import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { sendCampaign } from './marketing-send'

/**
 * Scheduled campaign sender.
 *
 * Campaigns can be saved with status='scheduled' + a future `scheduledAt`
 * (the editor's "Send later"). Until now nothing sent them — the demo even
 * seeds one and the list shows a "Scheduled" pill, but the time would pass and
 * nothing happened. This runs on a cron and dispatches every due one.
 *
 * Atomic claim: each due campaign is flipped scheduled → active with a guarded
 * UPDATE (`... WHERE id=$ AND status='scheduled' RETURNING`). The row is claimed
 * by exactly one runner — a second overlapping run (or a manual "Send now" that
 * raced) gets 0 rows back and skips, so a campaign can never double-send. The
 * winner then calls the existing `sendCampaign`, which owns the rest of the
 * lifecycle (recipient resolve, per-recipient send + events, final
 * completed/draft status + sendStats + creator notification).
 */

export interface ScheduledSendResult {
  /** Due campaigns found (scheduled + scheduledAt <= now). */
  due: number
  /** Campaigns this runner won the claim for + attempted to send. */
  claimed: number
  /** Claims lost to a concurrent runner / manual send (skipped, no double-send). */
  skipped: number
  /** Sends that errored after a successful claim. */
  failed: number
  results: Array<{ campaignId: number; organizationId: string | null; sent: number; failed: number }>
  errors: Array<{ campaignId: number; error: string }>
}

export async function sendDueScheduledCampaigns(opts?: { now?: Date }): Promise<ScheduledSendResult> {
  const now = opts?.now ?? new Date()
  const result: ScheduledSendResult = { due: 0, claimed: 0, skipped: 0, failed: 0, results: [], errors: [] }

  const dueCampaigns = await db
    .select({ id: schema.campaigns.id, organizationId: schema.campaigns.organizationId })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.status, 'scheduled'),
        isNotNull(schema.campaigns.scheduledAt),
        lte(schema.campaigns.scheduledAt, now),
      ),
    )

  result.due = dueCampaigns.length

  for (const c of dueCampaigns) {
    // Atomic claim: only one runner can move it off 'scheduled'.
    const claimed = await db
      .update(schema.campaigns)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(schema.campaigns.id, c.id), eq(schema.campaigns.status, 'scheduled')))
      .returning({ id: schema.campaigns.id })

    if (claimed.length === 0) {
      // Lost the race (another runner or a manual Send claimed it). Not an error.
      result.skipped++
      continue
    }

    result.claimed++
    if (!c.organizationId) {
      // Defensive: a campaign with no org can't be scoped-sent. Leave it 'active'
      // (claimed) and record the anomaly rather than throwing the whole batch.
      result.failed++
      result.errors.push({ campaignId: c.id, error: 'Campaign has no organization' })
      continue
    }

    try {
      const send = await sendCampaign({ organizationId: c.organizationId, campaignId: c.id })
      result.results.push({ campaignId: c.id, organizationId: c.organizationId, sent: send.sent, failed: send.failed })
      // sendCampaign returns early (without touching status) when the audience
      // resolved to zero recipients — but our atomic claim already set the row
      // 'active'. Reset it to 'draft' so an empty-audience scheduled send isn't
      // left stuck 'active' (it never sent anything). A real send (attempted>0)
      // owns its own final status inside sendCampaign.
      if (send.attempted === 0) {
        await db
          .update(schema.campaigns)
          .set({ status: 'draft', scheduledAt: null, updatedAt: new Date() })
          .where(eq(schema.campaigns.id, c.id))
      }
    } catch (err) {
      result.failed++
      result.errors.push({ campaignId: c.id, error: err instanceof Error ? err.message : 'unknown' })
    }
  }

  return result
}
