import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
import { getBlogPost, resolvePostPeople, listRelatedPosts } from '@/lib/services/blog'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import BlogArticle from '@/components/clinic-site/blog-article'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Preview — DreamCRM' }

// Auth-gated "Preview as published" — renders any post (draft or published) in
// the exact public article layout so the office manager can see what it'll
// look like before publishing. Reads the latest SAVED state.
export default async function BlogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const { id } = await params
  const post = await getBlogPost(ctx.organizationId, id)
  if (!post) notFound()

  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, ctx.organizationId))
    .limit(1)
  const data = org ? await getClinicSiteBySlug(org.slug) : null
  if (!data || !org) notFound()

  const basePath = `/site/${org.slug}`
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  const { author, reviewer } = await resolvePostPeople(ctx.organizationId, post)
  const related = await listRelatedPosts(ctx.organizationId, post.id, post.category, 3)

  return (
    <div>
      <div className="sticky top-0 z-50 bg-violet-600 text-white text-[13px] font-medium px-4 py-2 flex items-center justify-between">
        <span>
          Preview · {post.status === 'published' ? 'published' : 'draft'} — only you can see this
        </span>
        <Link href={`/blog/${post.id}`} className="underline hover:no-underline">
          Back to editor
        </Link>
      </div>
      <BlogChrome data={data} basePath={basePath}>
        <BlogArticle
          post={post}
          author={author}
          reviewer={reviewer}
          related={related}
          brand={brand}
          basePath={basePath}
          isPro={isPro}
        />
      </BlogChrome>
    </div>
  )
}
