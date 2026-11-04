import 'server-only'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { websiteEditHistory } from '@/lib/db/schema/domain'
import { user } from '@/lib/db/schema/auth'
import { splitWebsiteValues } from '@/lib/website-draft'

/**
 * Website Studio edit history — the safety net under every Studio save.
 * Each save records the previous EFFECTIVE value of every column it
 * overwrote; "Undo" restores the newest row's columns and deletes the row
 * (a one-way walk back through time — no redo, by design: simple to
 * reason about, impossible to tangle).
 *
 * Draft→Publish routing: a normal entry's draftable columns restore into the
 * `website_draft` blob (undoing a STAGED edit must never push its previous
 * value straight to the live site); identity columns restore live, matching
 * where the original save wrote. A publish entry (previous carries the
 * `__publish` marker) restores LIVE columns — undoing a publish genuinely
 * reverts the live site, while any edits staged after the publish stay put.
 */

/** Newest rows kept per org — deep-enough history without unbounded growth. */
export const WEBSITE_HISTORY_CAP = 20

/** What the history rail calls an edit the machine made (the AI website edit,
 *  the customize-services cron) — and any row from before actors were kept. */
export const WEBSITE_HISTORY_MACHINE_ACTOR = 'Dream Team'

/** Record one save's overwritten values. Caller passes the PREVIOUS values of
 *  exactly the columns it is about to overwrite (TS property names), and the
 *  signed-in user who made the change (omit/null for the machine). */
export async function recordWebsiteEdit(
  organizationId: string,
  label: string,
  previous: Record<string, unknown>,
  actorUserId?: string | null,
): Promise<void> {
  if (Object.keys(previous).length === 0) return
  await db
    .insert(websiteEditHistory)
    .values({ organizationId, label, previous, actorUserId: actorUserId ?? null })
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

export interface WebsiteHistoryEntry {
  id: number
  label: string
  createdAt: Date
  /** "Dana", or "Dream Team" for the machine. */
  actorName: string
}

/** Newest-first history for the Studio's rail — the actor's display name via
 *  ONE left join (a deleted user / machine edit reads "Dream Team"). */
export async function listWebsiteHistory(
  organizationId: string,
  limit = WEBSITE_HISTORY_CAP,
): Promise<WebsiteHistoryEntry[]> {
  const rows = await db
    .select({
      id: websiteEditHistory.id,
      label: websiteEditHistory.label,
      createdAt: websiteEditHistory.createdAt,
      actorName: user.name,
    })
    .from(websiteEditHistory)
    .leftJoin(user, eq(user.id, websiteEditHistory.actorUserId))
    .where(eq(websiteEditHistory.organizationId, organizationId))
    .orderBy(desc(websiteEditHistory.createdAt), desc(websiteEditHistory.id))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.createdAt,
    actorName: r.actorName?.trim() || WEBSITE_HISTORY_MACHINE_ACTOR,
  }))
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

  const previous = { ...((head.previous ?? {}) as Record<string, unknown>) }
  const isPublish = previous.__publish === true
  // Strip markers — they're history metadata, never column names.
  for (const key of Object.keys(previous)) {
    if (key.startsWith('__')) delete previous[key]
  }
  if (Object.keys(previous).length > 0) {
    if (isPublish) {
      // Undo a publish: put the prior values back on the LIVE columns.
      await db
        .update(clinicProfile)
        .set({ ...(previous as Partial<typeof clinicProfile.$inferInsert>), updatedAt: new Date() })
        .where(eq(clinicProfile.organizationId, organizationId))
    } else {
      // Undo a save: draftable columns walk back inside the draft, identity
      // columns walk back live — exactly where the save wrote them.
      const { staged, direct } = splitWebsiteValues(previous)
      const update: Record<string, unknown> = { ...direct, updatedAt: new Date() }
      if (Object.keys(staged).length > 0) {
        update.websiteDraft = sql`COALESCE(${clinicProfile.websiteDraft}, '{}'::jsonb) || ${JSON.stringify(staged)}::jsonb`
      }
      await db
        .update(clinicProfile)
        .set(update as Partial<typeof clinicProfile.$inferInsert>)
        .where(eq(clinicProfile.organizationId, organizationId))
    }
  }
  await db.delete(websiteEditHistory).where(eq(websiteEditHistory.id, head.id))
  const next = await getLastWebsiteEdit(organizationId)
  return { undone: head.label, next }
}
