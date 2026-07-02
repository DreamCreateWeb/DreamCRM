import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { listPublishedPosts } from '@/lib/services/blog'
import { publicSiteUrl } from '@/lib/services/clinic-site'

/**
 * The blog-powered patient newsletter (RevenueWell/Solutionreach's newsletter,
 * with our unfair advantage: the clinic already HAS a content engine). One
 * click drafts a campaign from the latest published blog posts; the clinic
 * reviews/edits in the normal campaign composer and sends through the
 * compliant campaign rails (unsubscribe footer, tracking, {{firstName}}
 * merge). Always a DRAFT — a newsletter never leaves without a human look.
 */

const AUDIENCE_NAME = 'Newsletter — all patients (email opt-in)'
const POSTS_PER_ISSUE = 3

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
  const now = opts?.now ?? new Date()
  const posts = await listPublishedPosts(organizationId, { limit: POSTS_PER_ISSUE })
  if (posts.length === 0) {
    return {
      ok: false,
      error: 'Publish a blog post first — the newsletter is built from your latest posts.',
    }
  }

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
  if (!org) return { ok: false, error: 'Clinic not found.' }

  const clinicName = profile?.displayName || org.name
  const base = publicSiteUrl({
    slug: org.slug,
    profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
  })

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

  const audienceId = await findOrCreateNewsletterAudience(organizationId)
  const [row] = await db
    .insert(schema.campaigns)
    .values({
      organizationId,
      name: `Patient newsletter · ${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`,
      subject: `This month from ${clinicName}`,
      previewText: posts[0].excerpt?.trim() || posts[0].title,
      bodyHtml,
      audienceId,
      recipientSource: 'patients',
      sendChannel: 'resend',
      status: 'draft',
      createdBy: userId,
    })
    .returning({ id: schema.campaigns.id })
  return { ok: true, campaignId: row.id }
}
