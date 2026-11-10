import 'server-only'

import { and, eq, gt, inArray, isNotNull, isNull, not, notExists, notInArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { BAD_PHONE_STATUSES } from '@/lib/db/schema/prospecting'
import { CALLER_SERVABLE_STATUSES, HAND_RAISER_SIGNALS } from '@/lib/types/prospecting'

/**
 * THE ONE READ OF "CAN A CALLER DIAL THIS ROW" (P-02 fix pass).
 *
 * A prospect leaves a caller's reach by many hands — the email engine
 * classifies a reply (suppressed / not interested / a hand-raiser), the
 * verify pass disqualifies it or marks the number bad, a signup converts
 * it, the owner suppresses it, a demo gets booked. None of those writers
 * know about callers, and none should. So the predicate lives here, once,
 * and three readers share it:
 *
 *   - the caller's queue + their KPI (what the card shows is what counts);
 *   - the pool a caller claims from;
 *   - {@link releaseIfUnservable} — the hook every status writer calls after
 *     its own write, and {@link releaseUnservableAssignments}, the sweep
 *     that catches stragglers on the outreach tick.
 *
 * A booked demo still ahead is unservable too: the row stays with the
 * caller who earned it (off the dial card) until the meeting passes.
 */
export function callerServableWhere(now: Date) {
  return and(
    isNotNull(schema.prospect.phone),
    or(isNull(schema.prospect.phoneStatus), notInArray(schema.prospect.phoneStatus, [...BAD_PHONE_STATUSES])),
    inArray(schema.prospect.status, [...CALLER_SERVABLE_STATUSES]),
    or(isNull(schema.prospect.intentSignal), notInArray(schema.prospect.intentSignal, [...HAND_RAISER_SIGNALS])),
    notExists(
      db
        .select({ one: sql`1` })
        .from(schema.prospectMeeting)
        .where(
          and(
            eq(schema.prospectMeeting.prospectId, schema.prospect.id),
            eq(schema.prospectMeeting.status, 'booked'),
            gt(schema.prospectMeeting.scheduledAt, now),
          ),
        ),
    ),
  )
}

/**
 * Free the caller's slot the moment a row stops being servable — called by
 * every writer that can flip it (reply classification, suppression, the
 * verify pass, conversion, a call outcome). One UPDATE, self-checking: it
 * touches the row only while it is assigned AND fails the servable test, so
 * a writer may call it without knowing what it just did. Best-effort by
 * contract — the writer's own change already landed, the queue read filters
 * on the same predicate, and the sweep catches a miss on the next tick.
 */
export async function releaseIfUnservable(prospectId: string, now = new Date()): Promise<boolean> {
  try {
    const rows = await db
      .update(schema.prospect)
      .set({ assignedCallerId: null, assignedAt: null, updatedAt: now })
      .where(
        and(
          eq(schema.prospect.id, prospectId),
          isNotNull(schema.prospect.assignedCallerId),
          not(callerServableWhere(now) as NonNullable<ReturnType<typeof callerServableWhere>>),
        ),
      )
      .returning({ id: schema.prospect.id })
    return rows.length > 0
  } catch (err) {
    console.warn('[prospect-callers] release-if-unservable failed', prospectId, err instanceof Error ? err.message : err)
    return false
  }
}

/** The straggler sweep: every assigned row that is no longer servable goes
 *  back, whatever path flipped it. Runs on the outreach tick before the
 *  7-day sweep. Strict (throws) — the cron reports it. */
export async function releaseUnservableAssignments(now = new Date()): Promise<number> {
  const rows = await db
    .update(schema.prospect)
    .set({ assignedCallerId: null, assignedAt: null, updatedAt: now })
    .where(
      and(
        isNotNull(schema.prospect.assignedCallerId),
        not(callerServableWhere(now) as NonNullable<ReturnType<typeof callerServableWhere>>),
      ),
    )
    .returning({ id: schema.prospect.id })
  return rows.length
}
