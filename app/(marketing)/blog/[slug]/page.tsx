import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMarketingPostBySlug, getMarketingPosts } from '@/lib/services/marketing-blog'
import { excerptFromHtml } from '@/lib/utils'
import type { BlogFaqItem } from '@/lib/types/clinic-content'
import BlogViewBeacon from '@/components/clinic-site/blog-view-beacon'
import { PrimaryCta } from '@/components/marketing/ui'

export const dynamic = 'force-dynamic'

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = await getMarketingPostBySlug(slug)
  if (!post) return {}
  // Honor the editor's SEO panel — same precedence as the clinic renderer.
  const title = post.seoTitle?.trim() || `${post.title} — DreamCRM blog`
  const description =
    post.seoDescription?.trim() || post.excerpt?.trim() || excerptFromHtml(post.bodyHtml)
  const url = `${BASE}/blog/${post.slug}`
  // Posts without a cover fall back to the brand OG image — a page-level
  // openGraph block replaces the inherited one, so without this the share
  // card would have no image at all. '/opengraph-image' resolves absolute
  // via metadataBase (1200×630, so large-card works either way).
  const image = post.coverImageUrl
    ? { url: post.coverImageUrl, alt: post.coverImageAlt ?? post.title }
    : { url: '/opengraph-image', alt: title }
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'DreamCRM',
      type: 'article',
      ...(post.publishedAt ? { publishedTime: post.publishedAt.toISOString() } : {}),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
}

export default async function MarketingBlogPostPage({ params }: Props) {
  const { slug } = await params
  // Independent fetches — overlap them (cache() dedupes the org lookup).
  const [post, recent] = await Promise.all([
    getMarketingPostBySlug(slug),
    getMarketingPosts(4),
  ])
  if (!post) notFound()

  const others = recent.filter((p) => p.slug !== slug).slice(0, 3)
  const faq = (Array.isArray(post.faq) ? post.faq : []) as BlogFaqItem[]
  const url = `${BASE}/blog/${post.slug}`

  const blogPostingLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? excerptFromHtml(post.bodyHtml),
    url,
    ...(post.publishedAt ? { datePublished: post.publishedAt.toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt.toISOString() } : {}),
    ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
    author: { '@type': 'Organization', name: post.authorName ?? 'The DreamCRM team' },
    publisher: { '@type': 'Organization', name: 'Dream Create' },
  }
  const faqLd =
    faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }
      : null

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingLd) }} />
      {faqLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      )}
      <BlogViewBeacon postId={post.id} />

      <nav className="text-[0.82rem] text-gray-500" aria-label="Breadcrumb">
        <Link href="/blog" className="font-medium text-teal-600 hover:underline">
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

      {post.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverImageUrl}
          alt={post.coverImageAlt ?? ''}
          className="mt-7 w-full rounded-xl border border-gray-100 object-cover"
        />
      )}

      {/* bodyHtml is sanitized at write time (sanitizeBlogHtml) — same
          trust path as the clinic public blogs. */}
      <div
        className="prose prose-gray mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-teal-600"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
      />

      {faq.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[1.3rem] font-bold tracking-tight">Questions, answered</h2>
          <div className="mt-4 space-y-3">
            {faq.map((f, i) => (
              <details key={i} className="group rounded-xl border border-gray-200 px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.95rem] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="shrink-0 text-teal-600 transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[0.9rem] leading-relaxed text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <div className="mt-12 rounded-xl border border-teal-200 bg-teal-50/60 px-6 py-7 text-center">
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
                <Link href={`/blog/${p.slug}`} className="text-[0.92rem] font-semibold text-teal-600 hover:underline">
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
