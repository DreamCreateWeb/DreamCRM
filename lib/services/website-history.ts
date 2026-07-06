import 'server-only'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { websiteEditHistory } from '@/lib/db/schema/domain'

/**
 * Website Studio edit history — the safety net under a Studio where every
 * save goes live instantly. Each save records the previous value of every
 * column it overwrote; "Undo" restores the newest row's columns and deletes
 * the row (a one-way walk back through time — no redo, by design: simple to
 * reason about, impossible to tangle).
 */

/** Newest rows kept per org — deep-enough history without unbounded growth. */
export const WEBSITE_HISTORY_CAP = 20

/** Record one save's overwritten values. Caller passes the PREVIOUS values of
 *  exactly the columns it is about to overwrite (TS property names). */
export async function recordWebsiteEdit(
  organizationId: string,
  label: string,
  previous: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(previous).length === 0) return
  await db.insert(websiteEditHistory).values({ organizationId, label, previous })
  // Trim beyond the cap (newest first; anything past CAP goes).
  const stale = await db
    .select({ id: websiteEditHistory.id })
    .from(websiteEditHistory)
    .where(eq(websiteEditHistory.organizationId, organizationId))
    .orderBy(desc(websiteEditHistory.createdAt), desc(websiteEditHistory.id))
    .offset(WEBSITE_HISTORY_CAP)
  if (stale.length > 0) {
    await db.delete(websiteEditHistory).where(
      and(
        eq(websiteEditHistory.organizationId, organizationId),
        inArray(websiteEditHistory.id, stale.map((r) => r.id)),
      ),
    )
  }
}

export interface WebsiteEditHead {
  label: string
  createdAt: Date
}

/** The newest history entry (what "Undo" would restore), or null. */
export async function getLastWebsiteEdit(organizationId: string): Promise<WebsiteEditHead | null> {
  const [row] = await db
    .select({ label: websiteEditHistory.label, createdAt: websiteEditHistory.createdAt })
    .from(websiteEditHistory)
    .where(eq(websiteEditHistory.organizationId, organizationId))
    .orderBy(desc(websiteEditHistory.createdAt), desc(websiteEditHistory.id))
    .limit(1)
  return row ?? null
}

/**
 * Restore the newest entry's columns onto clinic_profile and delete the entry.
 * Returns what was undone + the next head (for the button label), or null when
 * there was nothing to undo. Deliberately does NOT record its own history row.
 */
export async function undoLastWebsiteEdit(
  organizationId: string,
): Promise<{ undone: string; next: WebsiteEditHead | null } | null> {
  const [head] = await db
    .select()
    .from(websiteEditHistory)
    .where(eq(websiteEditHistory.organizationId, organizationId))
    .orderBy(desc(websiteEditHistory.createdAt), desc(websiteEditHistory.id))
    .limit(1)
  if (!head) return null

  const previous = (head.previous ?? {}) as Record<string, unknown>
  if (Object.keys(previous).length > 0) {
    await db
      .update(clinicProfile)
      .set({ ...(previous as Partial<typeof clinicProfile.$inferInsert>), updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, organizationId))
  }
  await db.delete(websiteEditHistory).where(eq(websiteEditHistory.id, head.id))
  const next = await getLastWebsiteEdit(organizationId)
  return { undone: head.label, next }
}
