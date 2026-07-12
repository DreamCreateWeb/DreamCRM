import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import {
  mergeWebsiteDraft,
  splitWebsiteValues,
  websiteDraftChanges,
  websiteDraftKeys,
  type WebsiteDraftChange,
} from '@/lib/website-draft'
import { recordWebsiteEdit } from './website-history'

/**
 * Server plumbing for the website Draft→Publish layer (pure core:
 * lib/website-draft.ts). EVERY writer of website-rendered clinic_profile
 * columns routes through `stageWebsiteValues` — the Studio's writeSection,
 * the AI edit bar, the services picker, and the SEO-meta form — so a
 * draftable column can never slip straight to live, and identity columns
 * (names/contact/hours/logo) always do.
 */

type ProfileRow = typeof clinicProfile.$inferSelect

/**
 * Route a mixed set of column writes: draftable columns merge atomically into
 * the `website_draft` blob (SQL-side `||` — two concurrent section saves
 * can't clobber each other's staged keys); identity columns write live.
 */
export async function stageWebsiteValues(
  organizationId: string,
  values: Record<string, unknown>,
): Promise<{ stagedKeys: string[] }> {
  const { staged, direct } = splitWebsiteValues(values)
  const update: Record<string, unknown> = { ...direct, updatedAt: new Date() }
  if (Object.keys(staged).length > 0) {
    update.websiteDraft = sql`COALESCE(${clinicProfile.websiteDraft}, '{}'::jsonb) || ${JSON.stringify(staged)}::jsonb`
  }
  await db
    .update(clinicProfile)
    .set(update as Partial<typeof clinicProfile.$inferInsert>)
    .where(eq(clinicProfile.organizationId, organizationId))
  return { stagedKeys: Object.keys(staged) }
}

/**
 * The profile as the EDITOR should see it — staged values merged over live.
 * Every Website-workspace surface (content/design/forms/pages/editor/hub)
 * loads through this, so a staged edit reads back exactly like a saved one.
 * `raw` is the live row (for the rare surface that must describe the live
 * site, e.g. the Pages manager's Live pills).
 */
export async function getEffectiveWebsiteProfile(organizationId: string): Promise<{
  profile: ProfileRow
  raw: ProfileRow
  draftKeys: string[]
} | null> {
  const [raw] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!raw) return null
  return {
    profile: mergeWebsiteDraft(raw, raw.websiteDraft),
    raw,
    draftKeys: websiteDraftKeys(raw.websiteDraft),
  }
}

export interface WebsiteDraftStatus {
  /** Staged keys that actually differ from live (the honest count). */
  count: number
  changes: WebsiteDraftChange[]
}

/** What's staged and not yet live — drives the hub card + Studio publish bar. */
export async function getWebsiteDraftStatus(
  organizationId: string,
): Promise<WebsiteDraftStatus> {
  const [raw] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!raw) return { count: 0, changes: [] }
  const changes = websiteDraftChanges(raw.websiteDraft, raw)
  return { count: changes.length, changes }
}

/**
 * Publish: apply every staged column to the live site in one write and clear
 * the draft. Records ONE undo-history entry holding the prior LIVE values
 * (with a `__publish` marker) — so "Undo: Published site changes" genuinely
 * reverts the live site, not just the draft.
 */
export async function publishWebsiteDraft(
  organizationId: string,
): Promise<{ published: number }> {
  const [raw] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!raw) return { published: 0 }
  const keys = websiteDraftKeys(raw.websiteDraft)
  if (keys.length === 0) {
    // Nothing draftable staged — clear any junk blob so status stays honest.
    if (raw.websiteDraft) {
      await db
        .update(clinicProfile)
        .set({ websiteDraft: null })
        .where(eq(clinicProfile.organizationId, organizationId))
    }
    return { published: 0 }
  }

  const changes = websiteDraftChanges(raw.websiteDraft, raw)
  const blob = raw.websiteDraft as Record<string, unknown>

  // History first (best-effort): the prior live value of every published
  // column, marked so undo restores LIVE columns instead of re-staging.
  try {
    const previous: Record<string, unknown> = { __publish: true }
    for (const key of keys) {
      previous[key] = (raw as Record<string, unknown>)[key] ?? null
    }
    await recordWebsiteEdit(organizationId, 'Published site changes', previous)
  } catch {
    /* history is a safety net, not a gate */
  }

  const apply: Record<string, unknown> = { websiteDraft: null, updatedAt: new Date() }
  for (const key of keys) apply[key] = blob[key] ?? null
  await db
    .update(clinicProfile)
    .set(apply as Partial<typeof clinicProfile.$inferInsert>)
    .where(eq(clinicProfile.organizationId, organizationId))
  return { published: changes.length }
}

/** Throw away everything staged — the live site was never touched. */
export async function discardWebsiteDraft(
  organizationId: string,
): Promise<{ discarded: number }> {
  const [raw] = await db
    .select({ websiteDraft: clinicProfile.websiteDraft })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  const count = websiteDraftKeys(raw?.websiteDraft).length
  if (raw?.websiteDraft) {
    await db
      .update(clinicProfile)
      .set({ websiteDraft: null, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, organizationId))
  }
  return { discarded: count }
}
