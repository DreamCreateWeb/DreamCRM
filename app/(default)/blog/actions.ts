'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import {
  BlogPostInput,
  type BlogPostInputT,
  createBlankBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  archiveBlogPost,
  scheduleBlogPost,
  unscheduleBlogPost,
  createTopicStubs,
  BlogPublishError,
} from '@/lib/services/blog'
import { draftBlogPost, draftSocialCaption, suggestBlogTopics } from '@/lib/services/ai-blog'
import type { ClinicService } from '@/lib/types/clinic-content'

function ensureClinicAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('The blog is only available for clinic tenants.')
  }
  if (ctx.role === 'patient') {
    throw new Error('Patients cannot edit the blog.')
  }
}

/** "New post" — create an empty draft and jump straight into the editor. */
export async function createBlogPostAction() {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const post = await createBlankBlogPost(ctx.organizationId)
  revalidatePath('/blog')
  redirect(`/blog/${post.id}`)
}

/** "Draft with AI" — create an empty draft and open the editor with the AI
 * topic modal already showing (?ai=1). */
export async function createAiBlogPostAction() {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const post = await createBlankBlogPost(ctx.organizationId)
  revalidatePath('/blog')
  redirect(`/blog/${post.id}?ai=1`)
}

export async function updateBlogPostAction(id: string, input: BlogPostInputT) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const data = BlogPostInput.parse(input)
  const row = await updateBlogPost(ctx.organizationId, id, data)
  revalidatePath('/blog')
  revalidatePath(`/blog/${id}`)
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
  revalidatePath('/blog')
  revalidatePath(`/blog/${id}`)
  return { ok: true }
}

export async function unpublishBlogPostAction(id: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await unpublishBlogPost(ctx.organizationId, id)
  revalidatePath('/blog')
  revalidatePath(`/blog/${id}`)
}

export async function archiveBlogPostAction(id: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await archiveBlogPost(ctx.organizationId, id)
  revalidatePath('/blog')
  redirect('/blog')
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
  revalidatePath('/blog')
  revalidatePath('/blog/calendar')
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
  revalidatePath('/blog')
  revalidatePath('/blog/calendar')
  revalidatePath(`/blog/${id}`)
  return { ok: true }
}

export async function unscheduleBlogPostAction(id: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await unscheduleBlogPost(ctx.organizationId, id)
  revalidatePath('/blog')
  revalidatePath('/blog/calendar')
  revalidatePath(`/blog/${id}`)
}
