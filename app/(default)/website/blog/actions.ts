'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { assertPostsEditor } from './access'
import { blogPublicBaseUrl } from './public-base-url'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import {
  BlogPostInput,
  type BlogPostInputT,
  createBlankBlogPost,
  getBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  archiveBlogPost,
  scheduleBlogPost,
  unscheduleBlogPost,
  createTopicStubs,
  BlogPublishError,
} from '@/lib/services/blog'
import { draftBlogPost, draftSocialCaption, suggestBlogTopics, suggestFaqs } from '@/lib/services/ai-blog'
import { createMarketingCampaign } from '@/lib/services/marketing-campaigns'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import type { ClinicService } from '@/lib/types/clinic-content'

function ensureClinicAdmin(ctx: { tenantType: string; role: string }) {
  assertPostsEditor(ctx)
}

/** "New post" — create an empty draft and jump straight into the editor. */
export async function createBlogPostAction() {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const post = await createBlankBlogPost(ctx.organizationId)
  revalidatePath('/website/blog')
  redirect(`/website/blog/${post.id}`)
}

/** "Draft with AI" — create an empty draft and open the editor with the AI
 * topic modal already showing (?ai=1). */
export async function createAiBlogPostAction() {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const post = await createBlankBlogPost(ctx.organizationId)
  revalidatePath('/website/blog')
  redirect(`/website/blog/${post.id}?ai=1`)
}

export async function updateBlogPostAction(id: string, input: BlogPostInputT) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const data = BlogPostInput.parse(input)
  const row = await updateBlogPost(ctx.organizationId, id, data)
  revalidatePath('/website/blog')
  revalidatePath(`/website/blog/${id}`)
  return row
}

export type PublishResult = { ok: true } | { ok: false; error: string }

export async function publishBlogPostAction(id: string): Promise<PublishResult> {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  try {
    await publishBlogPost(ctx.organizationId, id)
  } catch (err) {
    if (err instanceof BlogPublishError) return { ok: false, error: err.message }
    throw err
  }
  revalidatePath('/website/blog')
  revalidatePath(`/website/blog/${id}`)
  return { ok: true }
}

export async function unpublishBlogPostAction(id: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await unpublishBlogPost(ctx.organizationId, id)
  revalidatePath('/website/blog')
  revalidatePath(`/website/blog/${id}`)
}

export async function archiveBlogPostAction(id: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await archiveBlogPost(ctx.organizationId, id)
  revalidatePath('/website/blog')
  redirect('/website/blog')
}

// ── AI (clinician-gated — never publishes) ──────────────────────────────────

export async function draftBlogPostAction(topic: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  if (!topic.trim() || topic.length > 2000) return null
  return draftBlogPost(topic)
}

export async function draftSocialCaptionAction(title: string, excerpt: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  if (!title.trim()) return null
  return draftSocialCaption(title.slice(0, 200), excerpt.slice(0, 400))
}

// ── Content Engine: ideation + scheduling ───────────────────────────────────

/** Generate clinic-specific topic ideas seeded from the clinic's services +
 * locality + season. Returns the ideas for the user to pick from (no DB write). */
export async function suggestTopicsAction(count?: number) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const [profile] = await db
    .select({ services: clinicProfile.services, city: clinicProfile.city, state: clinicProfile.state })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const services = ((profile?.services as ClinicService[] | null) ?? [])
    .map((s) => s?.name)
    .filter((n): n is string => Boolean(n))
  return suggestBlogTopics({ services, city: profile?.city ?? null, state: profile?.state ?? null, count })
}

/** Persist selected ideas as review-gated draft stubs. */
export async function createTopicStubsAction(
  ideas: Array<{ title: string; angle?: string | null; category?: string | null }>,
) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  if (!Array.isArray(ideas) || ideas.length === 0) return { created: 0 }
  const created = await createTopicStubs(ctx.organizationId, ideas.slice(0, 12))
  revalidatePath('/website/blog')
  revalidatePath('/website/blog/calendar')
  return { created }
}

export async function scheduleBlogPostAction(id: string, scheduledForISO: string): Promise<PublishResult> {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  try {
    await scheduleBlogPost(ctx.organizationId, id, new Date(scheduledForISO))
  } catch (err) {
    if (err instanceof BlogPublishError) return { ok: false, error: err.message }
    throw err
  }
  revalidatePath('/website/blog')
  revalidatePath('/website/blog/calendar')
  revalidatePath(`/website/blog/${id}`)
  return { ok: true }
}

export async function unscheduleBlogPostAction(id: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await unscheduleBlogPost(ctx.organizationId, id)
  revalidatePath('/website/blog')
  revalidatePath('/website/blog/calendar')
  revalidatePath(`/website/blog/${id}`)
}

/** AI-generate 3-5 FAQs grounded in the post (the editor previews them
 * before they're saved). */
export async function generateFaqsAction(title: string, bodyHtml: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  if (!title.trim() && !bodyHtml.trim()) return null
  return suggestFaqs(title.slice(0, 200), bodyHtml.slice(0, 60_000))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Repurpose a published post into a Recall & Outreach email: creates a draft
 * campaign pre-filled with the post, then drops the user in the campaign
 * editor to pick a patient audience + send (reuses the existing send path). */
export async function emailThisPostAction(id: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const post = await getBlogPost(ctx.organizationId, id)
  if (!post || post.status !== 'published') {
    throw new Error('Only a published post can be emailed.')
  }
  // Tenant-aware: platform posts live on the marketing site.
  const base = await blogPublicBaseUrl(ctx)
  const url = base ? `${base}/blog/${post.slug}` : ''
  const excerpt = post.excerpt?.trim() ?? ''
  const bodyHtml =
    `<p>${escapeHtml(excerpt) || 'We just published a new post you might find helpful.'}</p>` +
    (url ? `<p><a href="${url}">Read the full post →</a></p>` : '')
  const campaign = await createMarketingCampaign(
    ctx.organizationId,
    {
      name: `Blog: ${post.title}`.slice(0, 200),
      subject: post.title.slice(0, 200),
      previewText: excerpt.slice(0, 200) || null,
      bodyHtml,
      sendChannel: 'resend',
    },
    ctx.userId,
  )
  redirect(`/growth/campaigns/${campaign.id}`)
}
