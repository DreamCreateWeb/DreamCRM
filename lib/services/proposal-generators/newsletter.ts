import 'server-only'
import { and, desc, eq, gt, isNull, like, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { fileProposal } from '@/lib/services/proposals'
import { clinicLocalDate, dayOfWeekForDateKey } from '@/lib/clinic-timezone'
import { POSTS_PER_ISSUE, NEWSLETTER_NAME_PREFIX, composeNewsletter } from '@/lib/services/newsletter'
import { listPublishedPosts } from '@/lib/services/blog'

/**
 * THE MONTHLY NEWSLETTER (ML-36, G3-12 — under ML-11's lane convention).
 *
 * The newsletter used to be a button the clinic had to remember to press. On
 * the clinic-local FIRST WEEKDAY of the month, for a practice that has
 * published at least one blog post since its last newsletter AND has someone
 * to send it to (an active patient with an email and marketing-email opt-in),
 * this files ONE ask-first card carrying the issue the one-click button would
 * have drafted (the 'email' artifact). The yes creates the DRAFT campaign in
 * the composer — it NEVER sends (the newsletter law stands: a newsletter never
 * leaves without a human look), and it is not grantable.
 *
 * AI-free: the issue is deterministic from the posts, so a practice with AI
 * off still gets its newsletter. Consent is only READ here (the opted-in
 * count); lib/sms-consent.ts and the campaign rails own every write.
 *
 * Dedupe: sourceKey `newsletter:<clinic-local YYYY-MM>` — one card per
 * clinic month, ever (a declined card is the answer about that month).
 */

/** With no newsletter ever, only posts this recent make an issue. */
export const NEWSLETTER_FIRST_ISSUE_LOOKBACK_DAYS = 60
/** The card retires itself before the next month's would be filed. */
const EXPIRES_DAYS = 25
const DAY_MS = 24 * 60 * 60 * 1000

export function newsletterMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** The day-of-month of the first Monday–Friday of a calendar month (1–3). */
export function firstWeekdayOfMonth(year: number, month: number): number {
  for (let d = 1; d <= 3; d++) {
    const dow = dayOfWeekForDateKey(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    if (dow >= 1 && dow <= 5) return d
  }
  return 1
}

export async function generateNewsletterProposals(
  organizationId: string,
  now: Date,
  timeZone: string,
): Promise<number> {
  const { year, month, day } = clinicLocalDate(now, timeZone)
  // The month gate: the clinic-local first weekday, nothing else.
  if (day !== firstWeekdayOfMonth(year, month)) return 0
  const sourceKey = `newsletter:${newsletterMonthKey(year, month)}`

  const [taken] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  if (taken) return 0

  // "Since the last newsletter": the newest campaign carrying the newsletter
  // name (a draft the clinic never sent still counts — it IS the last issue).
  const [last] = await db
    .select({ createdAt: schema.campaigns.createdAt })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        like(schema.campaigns.name, `${NEWSLETTER_NAME_PREFIX}%`),
      ),
    )
    .orderBy(desc(schema.campaigns.createdAt))
    .limit(1)
  const since = last?.createdAt ?? new Date(now.getTime() - NEWSLETTER_FIRST_ISSUE_LOOKBACK_DAYS * DAY_MS)

  const [fresh] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.blogPost)
    .where(
      and(
        eq(schema.blogPost.organizationId, organizationId),
        eq(schema.blogPost.status, 'published'),
        isNull(schema.blogPost.archivedAt),
        gt(schema.blogPost.publishedAt, since),
      ),
    )
  if (!fresh || Number(fresh.n) < 1) return 0

  const [aud] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        eq(schema.patient.isActive, 1),
        eq(schema.patient.marketingEmailOptIn, 1),
        sql`coalesce(trim(${schema.patient.email}), '') <> ''`,
      ),
    )
  const recipientCount = aud ? Number(aud.n) : 0
  if (recipientCount < 1) return 0

  const posts = await listPublishedPosts(organizationId, { limit: POSTS_PER_ISSUE })
  const issue = await composeNewsletter(organizationId, posts, { now, timeZone })
  if (!issue) return 0

  const { filed } = await fileProposal({
    organizationId,
    capability: 'newsletter',
    sourceKey,
    title: `This month’s newsletter is drafted — ${posts.length} ${posts.length === 1 ? 'post' : 'posts'} from your blog`,
    body: issue.bodyText,
    payload: {
      subject: issue.subject,
      name: issue.name,
      postIds: posts.map((p) => p.id),
      recipientCount,
      // The words as filed — the executor sends the styled issue only while the
      // body is untouched; an edited body goes through as the edited text.
      originalBody: issue.bodyText,
      monthKey: newsletterMonthKey(year, month),
    },
    expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY_MS),
  })
  return filed ? 1 : 0
}
