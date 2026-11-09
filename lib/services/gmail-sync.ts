import 'server-only'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { listShutDownOrgIds } from '@/lib/services/billing-state'
import { reportAutomationFailure } from '@/lib/services/engine-failures'
import { SWEEP_BUDGET_MS, sweepClinics } from '@/lib/services/cron-sweep'
import { startBudget, walkWithinBudget } from '@/lib/cron-budget'
import {
  backfillRfcMessageIds,
  classifyPendingIntents,
  resolvePendingInlineImages,
  syncAccount,
} from '@/lib/services/mailbox'

/**
 * ML-59 — THE MAILBOX SYNCS BEHIND THE PAGE, NOT UNDER IT.
 *
 * /inbox renders from the synced copy in our database and never awaits Gmail.
 * Keeping that copy fresh is this module's job: a budgeted, resumable walk
 * over connected mailboxes (cron every 5 minutes), the Gmail push webhook for
 * the moment it matters (processHistoryEvent syncs THAT mailbox now), and a
 * rate-aware background kick the page fires for the mailbox a person has open.
 *
 * `email_account.wanted_at` is the priority signal: the page stamps it (one
 * cheap UPDATE, never a sync) and the sweep serves recently-wanted mailboxes
 * first, outside the round-robin cursor, so an open inbox is never starved by
 * the rotation. Every other mailbox walks the shared cursor
 * (`cronCursor:gmail-sync`) like the other sweeps.
 *
 * Every step is best-effort and isolated: one mailbox that throws counts as
 * walked, costs its clinic ONE engine-failure strike a day (`inbox_sync`),
 * and never stops the next mailbox. Walled (expired-trial) clinics are
 * skipped — expiry kills everything. Tokens are never logged here.
 */

/** A mailbox someone opened this recently is served first. */
export const WANTED_WINDOW_MS = 15 * 60 * 1000
/** Never re-sync a mailbox that landed this recently (push + cron + kick overlap). */
export const MIN_SYNC_GAP_MS = 2 * 60 * 1000
/** A `syncing` status older than this is a crashed run, not a live one. */
export const STUCK_SYNCING_MS = 10 * 60 * 1000
/** The page only re-stamps `wanted_at` when the stamp is older than this. */
export const WANTED_RESTAMP_MS = 30 * 1000

export interface MailboxSyncCandidate {
  id: string
  organizationId: string
  syncStatus: string
  lastSyncAt: Date | null
  wantedAt: Date | null
  updatedAt: Date
}

/** Pure: is this mailbox wanted right now? */
export function isWanted(m: Pick<MailboxSyncCandidate, 'wantedAt'>, now: Date): boolean {
  return !!m.wantedAt && now.getTime() - m.wantedAt.getTime() < WANTED_WINDOW_MS
}

/** Pure: should the sweep/kick sync this mailbox now? Idempotent and rate-aware. */
export function shouldSyncMailbox(m: MailboxSyncCandidate, now: Date): boolean {
  if (m.syncStatus === 'syncing' && now.getTime() - m.updatedAt.getTime() < STUCK_SYNCING_MS) return false
  if (!m.lastSyncAt) return true
  return now.getTime() - m.lastSyncAt.getTime() >= MIN_SYNC_GAP_MS
}

/**
 * Stamp the org's mailboxes as wanted. A cheap UPDATE (throttled to one write
 * per mailbox per 30s), tenant-scoped, never a sync. Best-effort: a failed
 * stamp costs priority, never the page.
 */
export async function markMailboxesWanted(
  organizationId: string,
  opts: { accountId?: string | null; now?: Date } = {},
): Promise<void> {
  const now = opts.now ?? new Date()
  try {
    await db
      .update(schema.emailAccount)
      .set({ wantedAt: now })
      .where(
        and(
          eq(schema.emailAccount.organizationId, organizationId),
          eq(schema.emailAccount.disabled, false),
          opts.accountId ? eq(schema.emailAccount.id, opts.accountId) : undefined,
          or(
            isNull(schema.emailAccount.wantedAt),
            lt(schema.emailAccount.wantedAt, new Date(now.getTime() - WANTED_RESTAMP_MS)),
          ),
        ),
      )
  } catch (e) {
    console.warn('[gmail-sync] could not stamp wanted_at', (e as Error).message)
  }
}

async function loadCandidates(organizationId?: string): Promise<MailboxSyncCandidate[]> {
  return db
    .select({
      id: schema.emailAccount.id,
      organizationId: schema.emailAccount.organizationId,
      syncStatus: schema.emailAccount.syncStatus,
      lastSyncAt: schema.emailAccount.lastSyncAt,
      wantedAt: schema.emailAccount.wantedAt,
      updatedAt: schema.emailAccount.updatedAt,
    })
    .from(schema.emailAccount)
    .where(
      and(
        eq(schema.emailAccount.disabled, false),
        eq(schema.emailAccount.provider, 'gmail'),
        organizationId ? eq(schema.emailAccount.organizationId, organizationId) : undefined,
      ),
    )
}

export interface MailboxSyncResult {
  synced: number
  added: number
  skipped: number
  failed: number
  wantedFirst: number
  walledSkipped: number
  completed: boolean
  remaining: number
  backfills: { classify: number; images: number; rfcIds: number; failed: number }
}

async function syncOne(m: MailboxSyncCandidate, result: MailboxSyncResult, now: Date) {
  if (!shouldSyncMailbox(m, now)) {
    result.skipped++
    return
  }
  try {
    const { added } = await syncAccount(m.id, m.organizationId, { limit: 50 })
    result.synced++
    result.added += added
  } catch (e) {
    result.failed++
    console.warn(`[gmail-sync] mailbox ${m.id} failed:`, (e as Error).message)
    await reportAutomationFailure(m.organizationId, 'inbox_sync', now)
  }
}

/** The three backfills, once per org, each best-effort and counted. */
async function runBackfills(orgIds: Set<string>, result: MailboxSyncResult) {
  const step = async (key: 'classify' | 'images' | 'rfcIds', fn: () => Promise<unknown>) => {
    try {
      await fn()
      result.backfills[key]++
    } catch (e) {
      result.backfills.failed++
      console.warn(`[gmail-sync] ${key} backfill failed:`, (e as Error).message)
    }
  }
  for (const orgId of Array.from(orgIds)) {
    await step('classify', () => classifyPendingIntents(orgId, { limit: 50 }))
    await step('images', () => resolvePendingInlineImages(orgId, { limit: 10 }))
    await step('rfcIds', () => backfillRfcMessageIds(orgId, { limit: 50 }))
  }
}

/**
 * The scheduled sweep. Wanted mailboxes first (no cursor — they are few and
 * recent), then every other mailbox round-robin inside the remaining budget.
 * `budget` is milliseconds.
 */
export async function syncMailboxes(
  opts: { now?: Date; budget?: number } = {},
): Promise<MailboxSyncResult> {
  const now = opts.now ?? new Date()
  const budgetMs = opts.budget ?? SWEEP_BUDGET_MS['gmail-sync']
  const budget = startBudget(budgetMs)
  const result: MailboxSyncResult = {
    synced: 0,
    added: 0,
    skipped: 0,
    failed: 0,
    wantedFirst: 0,
    walledSkipped: 0,
    completed: true,
    remaining: 0,
    backfills: { classify: 0, images: 0, rfcIds: 0, failed: 0 },
  }

  const [all, walled] = await Promise.all([loadCandidates(), listShutDownOrgIds(now)])
  const live = all.filter((m) => !walled.has(m.organizationId))
  result.walledSkipped = all.length - live.length

  const wanted = live.filter((m) => isWanted(m, now))
  const wantedIds = new Set(wanted.map((m) => m.id))
  const rest = live.filter((m) => !wantedIds.has(m.id))
  const touchedOrgs = new Set<string>()

  const wantedProgress = await walkWithinBudget(
    wanted,
    (m) => m.id,
    null,
    budget,
    async (m) => {
      touchedOrgs.add(m.organizationId)
      await syncOne(m, result, now)
    },
  )
  result.wantedFirst = wantedProgress.swept

  if (wantedProgress.completed) {
    const left = Math.max(0, budget.deadline - Date.now())
    const progress = await sweepClinics(
      'gmail-sync',
      rest,
      (m) => m.id,
      async (m) => {
        touchedOrgs.add(m.organizationId)
        await syncOne(m, result, now)
      },
      { budgetMs: left },
    )
    result.completed = progress.completed
    result.remaining = progress.remaining
  } else {
    result.completed = false
    result.remaining = wantedProgress.remaining + rest.length
  }

  await runBackfills(touchedOrgs, result)
  return result
}

/**
 * The page's background kick: sync THIS org's stale mailboxes, off the request
 * path (`after()`), idempotent and rate-aware via `shouldSyncMailbox`. Never
 * throws.
 */
export async function kickMailboxSync(
  organizationId: string,
  opts: { accountId?: string | null; now?: Date } = {},
): Promise<number> {
  const now = opts.now ?? new Date()
  try {
    if ((await listShutDownOrgIds(now)).has(organizationId)) return 0
    const mine = (await loadCandidates(organizationId)).filter(
      (m) => (!opts.accountId || m.id === opts.accountId) && shouldSyncMailbox(m, now),
    )
    let n = 0
    for (const m of mine) {
      try {
        await syncAccount(m.id, m.organizationId, { limit: 50 })
        n++
      } catch (e) {
        console.warn(`[gmail-sync] kick for ${m.id} failed:`, (e as Error).message)
      }
    }
    return n
  } catch (e) {
    console.warn('[gmail-sync] kick failed:', (e as Error).message)
    return 0
  }
}
