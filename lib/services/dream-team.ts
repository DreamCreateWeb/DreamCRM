import 'server-only'

/**
 * THE VETO RUNWAY's reads (docs/ai-operations.md, D4). One unified view of
 * everything the deep-sleep lanes have STAGED — scheduled social posts
 * (Zernio publishes them at their moment) and scheduled blog articles (the
 * publish-scheduled-posts cron flips them live) — so the Dream Team page
 * can show "Going out soon" with a Stop before anything ships.
 *
 * Read-only here; the stops live in the page's actions and call the owning
 * services (deleteSocialPost / unscheduleBlogPost) — the runway never grows
 * a second write path to either rail.
 */

import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

export interface RunwayItem {
  kind: 'social' | 'blog'
  id: string
  /** The work itself, trimmed for the queue row. */
  excerpt: string
  /** Where it lands ("Instagram, Google Business" / "your blog"). */
  destination: string
  goesOutAt: Date
}

const EXCERPT_LEN = 120

function trim(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > EXCERPT_LEN ? `${t.slice(0, EXCERPT_LEN - 1)}…` : t
}

/** Platform id → the label the composer uses (kept tiny + local: the queue
 *  names destinations, it doesn't manage them). */
function platformLabel(platform: string): string {
  switch (platform) {
    case 'google_business':
      return 'Google Business'
    case 'instagram':
      return 'Instagram'
    case 'facebook':
      return 'Facebook'
    case 'tiktok':
      return 'TikTok'
    case 'youtube':
      return 'YouTube'
    case 'linkedin':
      return 'LinkedIn'
    default:
      return platform
  }
}

export async function listRunway(organizationId: string, now: Date = new Date()): Promise<RunwayItem[]> {
  const [socialRows, blogRows] = await Promise.all([
    db
      .select({
        id: schema.socialPost.id,
        summary: schema.socialPost.summary,
        scheduledAt: schema.socialPost.scheduledAt,
      })
      .from(schema.socialPost)
      .where(
        and(
          eq(schema.socialPost.organizationId, organizationId),
          eq(schema.socialPost.status, 'scheduled'),
          gt(schema.socialPost.scheduledAt, now),
        ),
      )
      .orderBy(asc(schema.socialPost.scheduledAt)),
    db
      .select({
        id: schema.blogPost.id,
        title: schema.blogPost.title,
        scheduledFor: schema.blogPost.scheduledFor,
      })
      .from(schema.blogPost)
      .where(
        and(
          eq(schema.blogPost.organizationId, organizationId),
          eq(schema.blogPost.status, 'scheduled'),
          gt(schema.blogPost.scheduledFor, now),
        ),
      )
      .orderBy(asc(schema.blogPost.scheduledFor)),
  ])

  // Destinations for the social rows — one batched read.
  const destinations = new Map<string, string>()
  if (socialRows.length > 0) {
    const targets = await db
      .select({
        socialPostId: schema.socialPostTarget.socialPostId,
        platform: schema.socialPostTarget.platform,
      })
      .from(schema.socialPostTarget)
      .where(
        and(
          eq(schema.socialPostTarget.organizationId, organizationId),
          inArray(
            schema.socialPostTarget.socialPostId,
            socialRows.map((r) => r.id),
          ),
        ),
      )
    for (const t of targets) {
      const label = platformLabel(t.platform)
      const cur = destinations.get(t.socialPostId)
      destinations.set(t.socialPostId, cur ? (cur.includes(label) ? cur : `${cur}, ${label}`) : label)
    }
  }

  const items: RunwayItem[] = [
    ...socialRows
      .filter((r): r is typeof r & { scheduledAt: Date } => r.scheduledAt != null)
      .map((r) => ({
        kind: 'social' as const,
        id: r.id,
        excerpt: trim(r.summary ?? ''),
        destination: destinations.get(r.id) ?? 'your channels',
        goesOutAt: r.scheduledAt,
      })),
    ...blogRows
      .filter((r): r is typeof r & { scheduledFor: Date } => r.scheduledFor != null)
      .map((r) => ({
        kind: 'blog' as const,
        id: r.id,
        excerpt: trim(r.title ?? 'Untitled post'),
        destination: 'your blog',
        goesOutAt: r.scheduledFor,
      })),
  ]
  return items.sort((a, b) => a.goesOutAt.getTime() - b.goesOutAt.getTime())
}

/** The summons strip's cheap count — best-effort; a failed read is 0, and
 *  the strip simply doesn't mention the runway. */
export async function countRunway(organizationId: string, now: Date = new Date()): Promise<number> {
  try {
    const [[social], [blog]] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.socialPost)
        .where(
          and(
            eq(schema.socialPost.organizationId, organizationId),
            eq(schema.socialPost.status, 'scheduled'),
            gt(schema.socialPost.scheduledAt, now),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.blogPost)
        .where(
          and(
            eq(schema.blogPost.organizationId, organizationId),
            eq(schema.blogPost.status, 'scheduled'),
            gt(schema.blogPost.scheduledFor, now),
          ),
        ),
    ])
    return (social?.n ?? 0) + (blog?.n ?? 0)
  } catch {
    return 0
  }
}

/**
 * CYCLES (D7d): when this clinic's team last ran a pass. Null when no pass
 * has stamped yet (a brand-new clinic) or when the read fails — the caller
 * treats both the same way, because "we don't know" and "it hasn't happened"
 * are equally not a claim that it did.
 */
export async function getLastCycleAt(organizationId: string): Promise<Date | null> {
  try {
    const [row] = await db
      .select({ at: schema.clinicProfile.dreamTeamCycleAt })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    return row?.at ?? null
  } catch {
    return null
  }
}
