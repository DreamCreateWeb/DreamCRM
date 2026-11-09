import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { listPublishedPosts } from '@/lib/services/blog'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { clinicLocalDate } from '@/lib/clinic-timezone'

/**
 * The blog-powered patient newsletter (RevenueWell/Solutionreach's newsletter,
 * with our unfair advantage: the clinic already HAS a content engine). The
 * issue drafts itself from the latest published blog posts — ML-36: the Dream
 * Team files it as an ask-first card on the month's first weekday
 * (proposal-generators/newsletter.ts), and the one-click button stays for a
 * practice that wants an issue NOW. Either way the clinic reviews/edits in the
 * normal campaign composer and sends through the compliant campaign rails
 * (unsubscribe footer, tracking, {{firstName}} merge). Always a DRAFT — a
 * newsletter never leaves without a human look.
 */

const AUDIENCE_NAME = 'Newsletter — all patients (email opt-in)'
export const POSTS_PER_ISSUE = 3
/** The campaign-name prefix every newsletter draft carries — the "last
 *  newsletter" read keys on it. */
export const NEWSLETTER_NAME_PREFIX = 'Patient newsletter ·'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function findOrCreateNewsletterAudience(organizationId: string): Promise<number> {
  const [existing] = await db
    .select({ id: schema.audiences.id })
    .from(schema.audiences)
    .where(and(eq(schema.audiences.organizationId, organizationId), eq(schema.audiences.name, AUDIENCE_NAME)))
    .limit(1)
  if (existing) return existing.id
  const [row] = await db
    .insert(schema.audiences)
    .values({
      organizationId,
      name: AUDIENCE_NAME,
      description: 'Auto-managed: every active patient with email opt-in. Used by the monthly newsletter.',
      recipientSource: 'patients',
      filter: {},
      patientFilter: { requireEmailOptIn: true, requireSmsOptIn: false, includeArchived: false },
      createdBy: null,
    })
    .returning({ id: schema.audiences.id })
  return row.id
}

type NewsletterPost = Awaited<ReturnType<typeof listPublishedPosts>>[number]

export interface ComposedNewsletter {
  name: string
  subject: string
  previewText: string
  /** The styled HTML the one-click draft always used. */
  bodyHtml: string
  /** The same issue as plain text — what the Dream Team's card shows and staff
   *  edit; blank-line paragraphs, `{{firstName}}` / `{{bookingUrl}}` tokens. */
  bodyText: string
  clinicName: string
}

/**
 * Compose one issue from `posts` (no writes — the one-click button and the
 * Dream Team's monthly card both build the issue HERE, so the two can never
 * drift). The month in the name is the clinic's own when a tz is given.
 */
export async function composeNewsletter(
  organizationId: string,
  posts: NewsletterPost[],
  opts?: { now?: Date; timeZone?: string | null },
): Promise<ComposedNewsletter | null> {
  const now = opts?.now ?? new Date()
  if (posts.length === 0) return null
  const [profile] = await db
    .select({
      displayName: schema.clinicProfile.displayName,
      websiteDomain: schema.clinicProfile.websiteDomain,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: schema.organization.slug, name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1)
  if (!org) return null

  const clinicName = profile?.displayName || org.name
  const base = publicSiteUrl({
    slug: org.slug,
    profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
  })
  const { year, month } = opts?.timeZone
    ? clinicLocalDate(now, opts.timeZone)
    : { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }

  const postBlocks = posts
    .map((p) => {
      const url = `${base}/blog/${p.slug}`
      const excerpt = (p.excerpt ?? '').trim()
      return `<div style="margin:0 0 24px;padding:0 0 20px;border-bottom:1px solid #eee">
  <h2 style="margin:0 0 8px;font-size:19px;line-height:1.3"><a href="${url}" style="color:#1c1917;text-decoration:none">${escapeHtml(p.title)}</a></h2>
  ${excerpt ? `<p style="margin:0 0 10px;color:#57534e;font-size:15px;line-height:1.55">${escapeHtml(excerpt)}</p>` : ''}
  <a href="${url}" style="color:#0f766e;font-size:14px;font-weight:600;text-decoration:underline">Read on our site →</a>
</div>`
    })
    .join('\n')

  const bodyHtml = `<p>Hi {{firstName}},</p>
<p>A few things from the ${escapeHtml(clinicName)} team we thought you'd find useful — no sales pitch, just good info for your smile.</p>
${postBlocks}
<p style="color:#57534e;font-size:14px">Questions about anything here? Just reply — it comes straight to our front desk. And if you're due for a visit, <a href="{{bookingUrl}}" style="color:#0f766e">grabbing a time online</a> takes about a minute.</p>
<p>— The team at ${escapeHtml(clinicName)}</p>`

  const textPosts = posts
    .map((p) => {
      const excerpt = (p.excerpt ?? '').trim()
      return `${p.title}${excerpt ? `\n${excerpt}` : ''}\nRead on our site: ${base}/blog/${p.slug}`
    })
    .join('\n\n')
  const bodyText = `Hi {{firstName}},

A few things from the ${clinicName} team we thought you'd find useful — no sales pitch, just good info for your smile.

${textPosts}

Questions about anything here? Just reply — it comes straight to our front desk. And if you're due for a visit, grabbing a time online takes about a minute: {{bookingUrl}}

— The team at ${clinicName}`

  return {
    name: `${NEWSLETTER_NAME_PREFIX} ${MONTH_NAMES[month - 1]} ${year}`,
    subject: `This month from ${clinicName}`,
    previewText: posts[0].excerpt?.trim() || posts[0].title,
    bodyHtml,
    bodyText,
    clinicName,
  }
}

/** Insert the composed issue as a DRAFT campaign — never anything but a draft. */
export async function createNewsletterDraft(
  organizationId: string,
  userId: string | null,
  issue: { name: string; subject: string; previewText: string; bodyHtml: string },
): Promise<number> {
  const audienceId = await findOrCreateNewsletterAudience(organizationId)
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      organizationId,
      name: issue.name,
      subject: issue.subject,
      previewText: issue.previewText,
      bodyHtml: issue.bodyHtml,
      audienceId,
      recipientSource: 'patients',
      sendChannel: 'resend',
      status: 'draft',
      createdBy: userId,
    })
    .returning({ id: schema.campaigns.id })
  return row.id
}

/**
 * Draft this month's newsletter from the latest published posts. Returns the
 * new DRAFT campaign id (the caller redirects to the composer), or a friendly
 * error when there's nothing to send yet.
 */
export async function buildNewsletterDraft(
  organizationId: string,
  userId: string,
  opts?: { now?: Date },
): Promise<{ ok: true; campaignId: number } | { ok: false; error: string }> {
  const posts = await listPublishedPosts(organizationId, { limit: POSTS_PER_ISSUE })
  if (posts.length === 0) {
    return {
      ok: false,
      error: 'Publish a blog post first — the newsletter is built from your latest posts.',
    }
  }
  const issue = await composeNewsletter(organizationId, posts, { now: opts?.now })
  if (!issue) return { ok: false, error: 'Clinic not found.' }
  return { ok: true, campaignId: await createNewsletterDraft(organizationId, userId, issue) }
}
