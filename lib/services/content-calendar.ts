import 'server-only'
import { and, eq, gte, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { formatClinicDayHeader } from '@/lib/format-datetime'
import {
  PLAN_HORIZON_DAYS,
  PUBLISH_HOUR,
  planDayOffsets,
  planKinds,
  type ContentKind,
  type PlannedItem,
} from '@/lib/content-calendar'

/**
 * THE CONTENT CALENDAR (Transformation Phase 5 — the first new limb), service
 * half.
 *
 * NOTHING NEW IS STORED. A plan is a proposal, and approving it creates the
 * rows the publishing rails already understand — a social_post scheduled
 * through the same composer service the clinic uses by hand, and a blog_post
 * with status='scheduled' that the existing publish-scheduled-posts cron
 * flips live. The doctrine's own instruction: nothing gets rewritten,
 * everything gets re-oriented. A content_plan table would have been a second
 * home for facts the schema already holds, which is the defect class the
 * Phase-4 audit spent sixteen rounds removing.
 *
 * That also means the forward view below is a read of REALITY rather than of
 * a plan document: it shows what is actually going out, whether the machine
 * lined it up or a human did. Provenance is deliberately NOT re-encoded on
 * the rows — the Action Ledger already holds "I lined up 3 posts and a blog
 * piece", and a second copy of that fact on social_post is exactly the kind
 * of pair that drifts.
 */

const HOUR_MS = 60 * 60 * 1000

export interface UpcomingPiece {
  kind: ContentKind
  /** Clinic-local day header — "Wednesday, July 29". */
  when: string
  at: Date
  /** Blog headline, or the post's opening words. */
  title: string
}

/**
 * What is already going out in the horizon, soonest first.
 *
 * Counts BOTH kinds because from the practice's side they are one thing —
 * something is coming — and the thin-horizon test that decides whether to
 * propose a plan has to see everything, or it will offer to fill a month
 * their own blog already fills.
 *
 * This is the STRICT read: either half failing throws, because a half-read
 * horizon looks thin and would talk the machine into proposing a month of
 * public writing over the top of work the practice already has queued. The
 * two callers then differ on purpose — countHorizon turns a throw into null
 * ("treat as full, stay quiet"), getUpcomingContent turns it into an empty
 * report ("the appendix says nothing rather than breaking the page").
 */
export async function readHorizon(
  organizationId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<UpcomingPiece[]> {
  const until = new Date(now.getTime() + PLAN_HORIZON_DAYS * 24 * HOUR_MS)
  const [social, blog] = await Promise.all([
    db
      .select({
        summary: schema.socialPost.summary,
        scheduledAt: schema.socialPost.scheduledAt,
      })
      .from(schema.socialPost)
      .where(
        and(
          eq(schema.socialPost.organizationId, organizationId),
          eq(schema.socialPost.status, 'scheduled'),
          gte(schema.socialPost.scheduledAt, now),
          lt(schema.socialPost.scheduledAt, until),
        ),
      ),
    db
      .select({
        title: schema.blogPost.title,
        scheduledFor: schema.blogPost.scheduledFor,
      })
      .from(schema.blogPost)
      .where(
        and(
          eq(schema.blogPost.organizationId, organizationId),
          eq(schema.blogPost.status, 'scheduled'),
          gte(schema.blogPost.scheduledFor, now),
          lt(schema.blogPost.scheduledFor, until),
        ),
      ),
  ])

  const pieces: UpcomingPiece[] = []
  for (const s of social) {
    if (!s.scheduledAt) continue
    pieces.push({
      kind: 'social',
      at: s.scheduledAt,
      when: formatClinicDayHeader(s.scheduledAt, timeZone),
      title: snippet(s.summary ?? ''),
    })
  }
  for (const b of blog) {
    if (!b.scheduledFor) continue
    pieces.push({
      kind: 'blog',
      at: b.scheduledFor,
      when: formatClinicDayHeader(b.scheduledFor, timeZone),
      title: b.title?.trim() || 'Untitled post',
    })
  }
  return pieces.sort((a, b) => a.at.getTime() - b.at.getTime())
}

/**
 * How many pieces are already coming — the number the thin-horizon test
 * reads.
 *
 * Returns null when the horizon could not be read, and every caller treats
 * null as FULL. Erring toward silence: a failed query must never be the
 * reason the machine proposes a month of public posts over the top of work
 * the practice already has queued. (The Phase-4 audit's recurring shape — a
 * failed read that reads as "nothing there" and then licenses an action.)
 */
export async function countHorizon(
  organizationId: string,
  now: Date = new Date(),
): Promise<number | null> {
  try {
    const pieces = await readHorizon(organizationId, 'UTC', now)
    return pieces.length
  } catch (e) {
    console.error('[content-calendar] horizon read failed', e)
    return null
  }
}

/**
 * Turn the plan's day offsets into real instants in the CLINIC's day.
 *
 * Clinic-local by law (CLAUDE.md's timezone rules): a post scheduled at
 * "10 AM" from a UTC server goes out at 5 AM for a Pacific practice, which
 * is the bug that rule exists to prevent. Same idiom as automationSendAt —
 * clinic-local midnight plus the hour.
 *
 * Resolved at APPROVE time, not at file time. A card drafted on Monday and
 * approved the following week would otherwise carry dates that are already
 * in the past, and both scheduling rails (scheduleBlogPost,
 * validateSocialPostInput) correctly refuse those — a whole plan would fail
 * for the crime of being thought about. The card says so in plain words.
 */
export function planSchedule(
  now: Date,
  timeZone: string,
  count: number,
): { offsets: number[]; dates: Date[] } {
  const offsets = planDayOffsets(clinicLocalDow(now, timeZone), count)
  return {
    offsets,
    dates: offsets.map(
      (offset) => new Date(clinicDayStart(now, timeZone, offset).getTime() + PUBLISH_HOUR * HOUR_MS),
    ),
  }
}

/** The clinic's own day-of-week (0 = Sunday) — the weekday-only spread has to
 *  reason in the practice's calendar, not the server's. Read from Intl for
 *  the same reason clinicLocalHour is: arithmetic on a UTC instant gets the
 *  day wrong for any clinic whose evening is the server's tomorrow. */
export function clinicLocalDow(now: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now)
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
  return idx < 0 ? 0 : idx
}

/** Attach kinds and dates to whatever the draft came back with, so the plan
 *  the practice reads is exactly the plan that gets scheduled. */
export function shapePlan(
  items: PlannedItem[],
  now: Date,
  timeZone: string,
): { items: PlannedItem[]; dates: Date[]; labels: string[] } {
  const kinds = planKinds(items.length)
  const { offsets, dates } = planSchedule(now, timeZone, items.length)
  return {
    items: items.map((item, i) => ({ ...item, kind: kinds[i] ?? item.kind, dayOffset: offsets[i] ?? 0 })),
    dates,
    labels: dates.map((d) => formatClinicDayHeader(d, timeZone)),
  }
}

function snippet(s: string): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  if (!clean) return 'Untitled post'
  return clean.length > 70 ? `${clean.slice(0, 67)}…` : clean
}

/** Everything in the horizon, for the forward REPORT. Best-effort: the
 *  report is an appendix and must never fail the page it sits on. */
export async function getUpcomingContent(
  organizationId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<UpcomingPiece[]> {
  try {
    return await readHorizon(organizationId, timeZone, now)
  } catch (e) {
    console.error('[content-calendar] upcoming read failed', e)
    return []
  }
}
