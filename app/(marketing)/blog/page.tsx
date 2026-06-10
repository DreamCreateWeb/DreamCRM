import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getMarketingPosts } from '@/lib/services/marketing-blog'
import { PageHero } from '@/components/marketing/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Blog — DreamCRM',
  description:
    'Product announcements and essays on running a modern dental front office — from the team building DreamCRM.',
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

export default async function MarketingBlogPage() {
  // /blog was the clinic dashboard's post manager before it moved to /posts —
  // signed-in clinic staff following old bookmarks get a breadcrumb redirect
  // (matching the /calendar → /appointments convention). Platform staff and
  // signed-out visitors see the public marketing blog.
  const ctx = await getTenantContext()
  if (ctx?.tenantType === 'clinic') redirect('/posts')

  const posts = await getMarketingPosts()

  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Notes from the front office"
        sub="Product announcements and essays on running a modern dental practice — written by the team, not a content farm."
      />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {posts.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-gray-50/70 px-5 py-10 text-center text-[0.92rem] text-gray-600">
            First posts are on their way. Meanwhile, the{' '}
            <Link href="/docs" className="font-semibold text-violet-600 hover:underline">
              help docs
            </Link>{' '}
            cover the whole product.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/blog/${post.slug}`} className="group block py-7">
                  <p className="flex items-center gap-2 text-[0.78rem] font-semibold text-gray-400">
                    {post.category && <span className="text-violet-600">{post.category}</span>}
                    {post.category && <span aria-hidden="true">·</span>}
                    <time>{fmtDate(post.publishedAt)}</time>
                  </p>
                  <h2 className="mt-1.5 text-[1.35rem] font-bold leading-snug tracking-tight text-gray-950 group-hover:text-violet-700">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-2 text-[0.92rem] leading-relaxed text-gray-600">{post.excerpt}</p>
                  )}
                  <span className="mt-3 inline-block text-[0.85rem] font-semibold text-violet-600 group-hover:underline">
                    Read the post →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
