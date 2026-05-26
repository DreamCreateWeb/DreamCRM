import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { getBlogPost, listAuthorOptions, BLOG_CATEGORY_SUGGESTIONS } from '@/lib/services/blog'
import BlogEditor from './blog-editor'

export const metadata = { title: 'Edit post - DreamCRM' }
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ai?: string }>
}

export default async function BlogPostEditorPage({ params, searchParams }: Props) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const { id } = await params
  const { ai } = await searchParams
  const post = await getBlogPost(ctx.organizationId, id)
  if (!post) notFound()

  const authors = await listAuthorOptions(ctx.organizationId)

  const [profile] = await db
    .select({ websiteDomain: clinicProfile.websiteDomain })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, ctx.organizationId))
    .limit(1)
  const baseUrl = org
    ? publicSiteUrl({
        slug: org.slug,
        profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
      })
    : ''

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
        category: post.category ?? '',
        tags: (post.tags as string[] | null) ?? [],
        status: post.status,
        source: post.source,
        authorStaffId: post.authorStaffId ?? '',
        seoTitle: post.seoTitle ?? '',
        seoDescription: post.seoDescription ?? '',
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      }}
      authors={authors.map((s) => ({ id: s.id, name: s.name, title: s.title ?? null }))}
      categorySuggestions={[...BLOG_CATEGORY_SUGGESTIONS]}
      baseUrl={baseUrl}
      openAi={ai === '1'}
    />
  )
}
