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
import { postsAccessRedirect } from '../../access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Preview — DreamCRM' }

// Auth-gated "Preview as published" — renders any post (draft or published) in
// the exact public article layout so the office manager can see what it'll
// look like before publishing. Reads the latest SAVED state.
export default async function BlogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  const dest = postsAccessRedirect(ctx)
  if (dest) redirect(dest)

  const { id } = await params
  const post = await getBlogPost(ctx.organizationId, id)
  if (!post) notFound()

  // The platform org's posts publish to the marketing /blog, not a clinic
  // site — preview them in that register (the clinic chrome below would
  // notFound() for a non-clinic org anyway).
  if (ctx.tenantType === 'platform') {
    return (
      <div className="bg-white text-gray-950 antialiased">
        <div className="sticky top-0 z-50 bg-teal-600 text-white text-xs font-medium px-4 py-2 flex items-center justify-between">
          <span>
            Preview · {post.status === 'published' ? 'published' : 'draft'} — only you can see this
          </span>
          <Link href={`/posts/${post.id}`} className="underline hover:no-underline">
            Back to editor
          </Link>
        </div>
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <p className="text-[0.82rem] text-gray-500">Blog{post.category ? ` / ${post.category}` : ''}</p>
          <h1 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-tight sm:text-[2.4rem]">
            {post.title}
          </h1>
          <p className="mt-3 text-[0.85rem] font-medium text-gray-400">
            {post.authorName ?? 'The DreamCRM team'}
          </p>
          {post.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImageUrl}
              alt={post.coverImageAlt ?? ''}
              className="mt-7 w-full rounded-xl border border-gray-100 object-cover"
            />
          )}
          <div
            className="prose prose-gray mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-violet-600"
            dangerouslySetInnerHTML={{ __html: post.bodyHtml ?? '' }}
          />
        </article>
      </div>
    )
  }

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
      <div className="sticky top-0 z-50 bg-teal-600 text-white text-xs font-medium px-4 py-2 flex items-center justify-between">
        <span>
          Preview · {post.status === 'published' ? 'published' : 'draft'} — only you can see this
        </span>
        <Link href={`/posts/${post.id}`} className="underline hover:no-underline">
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
