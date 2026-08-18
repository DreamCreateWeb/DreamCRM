import 'server-only'
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm'
import { listShutDownOrgIds } from './billing-state'
import { db, schema } from '@/lib/db'
import { sendCampaign } from './marketing-send'
import { reportAutomationFailure } from '@/lib/services/engine-failures'

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

/**
 * Put campaigns stranded in 'active' back in the queue.
 *
 * The claim flips scheduled → active BEFORE sendCampaign walks the recipients.
 * If the process dies mid-walk (deploy, OOM, function timeout) the row is left
 * 'active' forever: the cron only ever re-selects 'scheduled', so nobody
 * finishes it, the un-mailed tail of the audience never hears anything, and
 * because nothing threw there is no Guardian signal either — the practice just
 * sees a campaign that says it sent.
 *
 * A live send updates the row when it finishes, so "active and untouched for
 * STUCK_AFTER_MS" is the honest signal for abandoned. The requeue is safe
 * because sendCampaign now drops recipients that already have a 'sent' event
 * for the campaign (dropAlreadySentRecipients) — the re-run finishes the tail
 * rather than re-mailing the half that got through.
 *
 * Mirrors requeueStuckScheduledMessages. Never throws: this runs at the top of
 * the cron and must not stop the due-campaign sweep behind it.
 */
export const STUCK_CAMPAIGN_AFTER_MS = 30 * 60 * 1000

export async function requeueStuckCampaigns(opts?: { now?: Date; olderThanMs?: number }): Promise<number> {
  const now = opts?.now ?? new Date()
  const cutoff = new Date(now.getTime() - (opts?.olderThanMs ?? STUCK_CAMPAIGN_AFTER_MS))
  try {
    const stuck = await db
      .select({ id: schema.campaigns.id })
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.status, 'active'),
          isNotNull(schema.campaigns.scheduledAt),
          lte(schema.campaigns.updatedAt, cutoff),
        ),
      )
    if (stuck.length === 0) return 0
    const ids = stuck.map((c) => c.id)
    await db
      .update(schema.campaigns)
      .set({ status: 'scheduled', updatedAt: now })
      .where(and(inArray(schema.campaigns.id, ids), eq(schema.campaigns.status, 'active')))
    console.warn('[marketing-scheduled] requeued stranded campaigns', { count: ids.length })
    return ids.length
  } catch (err) {
    console.warn('[marketing-scheduled] stuck-campaign requeue failed (non-fatal)', err)
    return 0
  }
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

  // THE KILL (owner ruling): a shut-down org's scheduled sends stay PARKED,
  // not claimed — skipped here without touching status, so the moment the
  // practice pays, the next tick sends them exactly as saved.
  const shutDown = await listShutDownOrgIds(now)

  for (const c of dueCampaigns) {
    if (c.organizationId && shutDown.has(c.organizationId)) {
      result.skipped++
      continue
    }
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
      // We already won the atomic claim above (scheduled → active), so tell
      // sendCampaign to skip its OWN claim — otherwise it sees 'active', fails
      // its draft/scheduled/paused claim, and every scheduled send no-ops.
      const send = await sendCampaign({ organizationId: c.organizationId, campaignId: c.id, alreadyClaimed: true })
      result.results.push({ campaignId: c.id, organizationId: c.organizationId, sent: send.sent, failed: send.failed })
      // TELL THE GUARDIAN when EVERY recipient failed. sendCampaign is
      // best-effort per recipient and never throws on a carrier/provider
      // failure, so an all-failed run returns normally — without this the
      // engine reads 'healthy' while nothing is going out (the reminders gap
      // Phase 4 fixed, in the campaigns path).
      if (send.attempted > 0 && send.sent === 0 && send.failed > 0) {
        await reportAutomationFailure(c.organizationId, 'campaigns')
      }
      // sendCampaign returns early (without touching status) when nobody was
      // sendable — but our atomic claim already set the row 'active'.
      if (send.attempted === 0) {
        if ((send.suppressed ?? 0) > 0) {
          // Everyone left was held back by the 7-day frequency cap. That's a
          // "not yet", not a "never": re-queue for tomorrow instead of dumping
          // an automation's campaign back to a zombie draft. The cap frees
          // within its 7-day window, so this always terminates.
          await db
            .update(schema.campaigns)
            .set({ status: 'scheduled', scheduledAt: new Date(now.getTime() + 86_400_000), updatedAt: new Date() })
            .where(eq(schema.campaigns.id, c.id))
        } else {
          // Empty audience → reset to 'draft' so it isn't left stuck 'active'
          // (it never sent anything). A real send (attempted>0) owns its own
          // final status inside sendCampaign.
          await db
            .update(schema.campaigns)
            .set({ status: 'draft', scheduledAt: null, updatedAt: new Date() })
            .where(eq(schema.campaigns.id, c.id))
        }
      }
    } catch (err) {
      result.failed++
      result.errors.push({ campaignId: c.id, error: err instanceof Error ? err.message : 'unknown' })
      // TELL THE GUARDIAN (Phase 4 open item #1). A scheduled campaign that
      // keeps failing to go out is invisible from inside the product — the
      // clinic sees an empty outbox, which looks exactly like a quiet week.
      if (c.organizationId) {
        await reportAutomationFailure(c.organizationId, 'campaigns')
      }
    }
  }

  return result
}
