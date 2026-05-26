'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  BlogPostInput,
  type BlogPostInputT,
  createBlankBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  archiveBlogPost,
  BlogPublishError,
} from '@/lib/services/blog'
import { draftBlogPost, draftSocialCaption } from '@/lib/services/ai-blog'

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
