import 'server-only'
import { randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Per-staff notification preferences. Today: the morning-digest opt-out — the
 * clinic enables the digest org-wide, but an individual mutes their own email
 * here. A missing row means "opted in" (gets the digest when the clinic has it
 * on), so we never need to backfill a row per user.
 */

function newId(): string {
  return `snp_${randomBytes(8).toString('hex')}`
}

/** True when this user has muted their own morning digest. */
export async function getDigestOptOut(organizationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ out: schema.staffNotificationPref.dailyDigestOptOut })
    .from(schema.staffNotificationPref)
    .where(
      and(
        eq(schema.staffNotificationPref.organizationId, organizationId),
        eq(schema.staffNotificationPref.userId, userId),
      ),
    )
    .limit(1)
  return row?.out === 1
}

/** Set (upsert) the per-staff digest opt-out. */
export async function setDigestOptOut(
  organizationId: string,
  userId: string,
  optedOut: boolean,
): Promise<void> {
  await db
    .insert(schema.staffNotificationPref)
    .values({ id: newId(), organizationId, userId, dailyDigestOptOut: optedOut ? 1 : 0 })
    .onConflictDoUpdate({
      target: [schema.staffNotificationPref.organizationId, schema.staffNotificationPref.userId],
      set: { dailyDigestOptOut: optedOut ? 1 : 0, updatedAt: new Date() },
    })
}

/** The set of userIds in this org who've muted the digest — one query the cron
 *  loads once per clinic instead of a per-staff round-trip. */
export async function getDigestOptOutUserIds(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: schema.staffNotificationPref.userId })
    .from(schema.staffNotificationPref)
    .where(
      and(
        eq(schema.staffNotificationPref.organizationId, organizationId),
        eq(schema.staffNotificationPref.dailyDigestOptOut, 1),
      ),
    )
  return new Set(rows.map((r) => r.userId))
}
