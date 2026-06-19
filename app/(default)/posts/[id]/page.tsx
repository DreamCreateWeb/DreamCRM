import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { getBlogPost, listAuthorOptions, BLOG_CATEGORY_SUGGESTIONS } from '@/lib/services/blog'
import BlogEditor from './blog-editor'
import { postsAccessRedirect } from '../access'
import { blogPublicBaseUrl } from '../public-base-url'

export const metadata = { title: 'Edit post - DreamCRM' }
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ai?: string }>
}

export default async function BlogPostEditorPage({ params, searchParams }: Props) {
  const ctx = await requireTenant()
  const dest = postsAccessRedirect(ctx)
  if (dest) redirect(dest)

  const [{ id }, { ai }] = await Promise.all([params, searchParams])
  // post / authors / baseUrl are independent — fetch in parallel instead of a
  // 3-deep await chain.
  const [post, authors, baseUrl] = await Promise.all([
    getBlogPost(ctx.organizationId, id),
    listAuthorOptions(ctx.organizationId),
    blogPublicBaseUrl(ctx),
  ])
  if (!post) notFound()

  return (
    <BlogEditor
      post={{
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? '',
        bodyHtml: post.bodyHtml ?? '',
        bodyJson: (post.bodyJson as Record<string, unknown> | null) ?? null,
        coverImageUrl: post.coverImageUrl ?? '',
        coverImageAlt: post.coverImageAlt ?? '',
        category: post.category ?? '',
        tags: (post.tags as string[] | null) ?? [],
        faq: (post.faq as { q: string; a: string }[] | null) ?? [],
        status: post.status,
        source: post.source,
        authorStaffId: post.authorStaffId ?? '',
        authorName: post.authorName ?? '',
        medicallyReviewedByStaffId: post.medicallyReviewedByStaffId ?? '',
        seoTitle: post.seoTitle ?? '',
        seoDescription: post.seoDescription ?? '',
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        scheduledFor: post.scheduledFor ? post.scheduledFor.toISOString() : null,
        viewCount: post.viewCount,
      }}
      authors={authors.map((s) => ({ id: s.id, name: s.name, title: s.title ?? null }))}
      categorySuggestions={[...BLOG_CATEGORY_SUGGESTIONS]}
      baseUrl={baseUrl}
      openAi={ai === '1'}
    />
  )
}
