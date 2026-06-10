import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMarketingPostBySlug, getMarketingPosts } from '@/lib/services/marketing-blog'
import { PrimaryCta } from '@/components/marketing/ui'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = await getMarketingPostBySlug(slug)
  if (!post) return {}
  return {
    title: `${post.title} — DreamCRM blog`,
    description: post.excerpt ?? undefined,
    openGraph: { title: post.title, description: post.excerpt ?? undefined, type: 'article' },
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function MarketingBlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await getMarketingPostBySlug(slug)
  if (!post) notFound()

  const others = (await getMarketingPosts(4)).filter((p) => p.slug !== slug).slice(0, 3)

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <nav className="text-[0.82rem] text-gray-500" aria-label="Breadcrumb">
        <Link href="/blog" className="font-medium text-violet-600 hover:underline">
          Blog
        </Link>
        {post.category && <> / {post.category}</>}
      </nav>
      <h1 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-tight sm:text-[2.4rem]">
        {post.title}
      </h1>
      <p className="mt-3 text-[0.85rem] font-medium text-gray-400">
        {post.authorName ?? 'The DreamCRM team'} · <time>{fmtDate(post.publishedAt)}</time>
      </p>

      {/* bodyHtml is sanitized at write time (sanitizeBlogHtml) — same
          trust path as the clinic public blogs. */}
      <div
        className="prose prose-gray mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-violet-600"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
      />

      <div className="mt-12 rounded-xl border border-violet-200 bg-violet-50/60 px-6 py-7 text-center">
        <p className="text-[1.05rem] font-bold tracking-tight">Run your front office from one system</p>
        <p className="mx-auto mt-1 max-w-md text-[0.88rem] text-gray-600">
          Website, booking, portal, reviews, recall — $99–199/mo, month-to-month.
        </p>
        <div className="mt-4">
          <PrimaryCta href="/signup">Start free setup</PrimaryCta>
        </div>
      </div>

      {others.length > 0 && (
        <aside className="mt-12 border-t border-gray-100 pt-8">
          <p className="text-[0.78rem] font-bold uppercase tracking-wider text-gray-400">More posts</p>
          <ul className="mt-3 space-y-2">
            {others.map((p) => (
              <li key={p.id}>
                <Link href={`/blog/${p.slug}`} className="text-[0.92rem] font-semibold text-violet-600 hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  )
}
