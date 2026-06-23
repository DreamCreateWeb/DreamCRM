import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aiUsageCounter } from '@/lib/db/schema/platform'
import { newId } from '@/lib/utils'

/**
 * Shared per-org / per-month AI-usage meter.
 *
 * Each AI feature tallies under its own `kind` in `ai_usage_counter`
 * (one row per org+period+kind, unique-indexed). This module is the single
 * implementation of the period math + the read + the atomic bump — the intake
 * AI services (insurance OCR, pre-visit summary, form translation) each used to
 * carry their own copy, which had drifted (read-then-bump vs over-cap helpers).
 * Callers keep their own KIND + monthly-cap constants and pass them in.
 */

/** 'YYYY-MM' (UTC) bucket key for the monthly counter. */
export function aiUsagePeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** This month's usage count for an org + feature `kind` (0 when none). */
export async function getAiUsageCount(
  orgId: string,
  kind: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ count: aiUsageCounter.count })
    .from(aiUsageCounter)
    .where(
      and(
        eq(aiUsageCounter.organizationId, orgId),
        eq(aiUsageCounter.period, aiUsagePeriod(now)),
        eq(aiUsageCounter.kind, kind),
      ),
    )
    .limit(1)
  return row?.count ?? 0
}

/** True when the org has hit/exceeded `cap` for `kind` this month. */
export async function isAiUsageOverCap(
  orgId: string,
  kind: string,
  cap: number,
  now: Date = new Date(),
): Promise<boolean> {
  return (await getAiUsageCount(orgId, kind, now)) >= cap
}

/** Atomically record one use of `kind` for an org this month. */
export async function bumpAiUsage(
  orgId: string,
  kind: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(aiUsageCounter)
    .values({ id: newId('aiu'), organizationId: orgId, period: aiUsagePeriod(now), kind, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageCounter.organizationId, aiUsageCounter.period, aiUsageCounter.kind],
      set: { count: sql`${aiUsageCounter.count} + 1`, updatedAt: new Date() },
    })
}
