import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { getPublishedPostBySlug, getPostAuthor } from '@/lib/services/blog'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'
import type { CSSProperties } from 'react'
import BlogChrome from '../blog-chrome'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

interface Props {
  params: Promise<{ slug: string; postSlug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug, postSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const post = await getPublishedPostBySlug(data.orgId, postSlug)
  if (!post) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/blog/${post.slug}`
  const title = post.seoTitle?.trim() || `${post.title} — ${name}`
  const description = post.seoDescription?.trim() || post.excerpt || `A post from ${name}.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: name,
      type: 'article',
      ...(post.publishedAt ? { publishedTime: post.publishedAt.toISOString() } : {}),
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl, alt: post.title }] } : {}),
    },
    twitter: {
      card: post.coverImageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(post.coverImageUrl ? { images: [post.coverImageUrl] } : {}),
    },
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function ClinicBlogPostPage({ params }: Props) {
  const { slug, postSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const post = await getPublishedPostBySlug(data.orgId, postSlug)
  if (!post) notFound()

  const basePath = `/site/${slug}`
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const name = data.profile.displayName ?? data.orgName
  const author = await getPostAuthor(data.orgId, post)
  const cleanHtml = sanitizeBlogHtml(post.bodyHtml)
  const url = `${publicSiteUrl(data)}/blog/${post.slug}`
  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath}#contact`

  // BlogPosting JSON-LD — author + publisher feed Google's E-E-A-T signals for
  // YMYL health content.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt.toISOString() } : {}),
    dateModified: post.updatedAt.toISOString(),
    ...(author ? { author: { '@type': 'Person', name: author.name, ...(author.title ? { jobTitle: author.title } : {}) } } : {}),
    publisher: {
      '@type': 'Organization',
      name,
      ...(data.profile.logoUrl ? { logo: { '@type': 'ImageObject', url: data.profile.logoUrl } } : {}),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  }

  const proseStyle = { ['--tw-prose-links' as keyof CSSProperties]: brand } as CSSProperties

  return (
    <BlogChrome data={data} basePath={basePath}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="max-w-[760px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <a href={`${basePath}/blog`} className="text-[13px] font-medium hover:underline" style={{ color: INK_MUTED }}>
          ← All posts
        </a>

        <header className="mt-6 mb-8">
          {post.category && (
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: brand }}>
              {post.category}
            </span>
          )}
          <h1 className="text-3xl sm:text-[42px] font-bold leading-[1.1] tracking-[-0.02em] mt-3 mb-5" style={{ color: INK }}>
            {post.title}
          </h1>
          <div className="flex items-center gap-3">
            {author?.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={author.photoUrl} alt={author.name} className="w-11 h-11 rounded-full object-cover" />
            ) : author ? (
              <span
                className="flex items-center justify-center w-11 h-11 rounded-full text-white text-sm font-bold"
                style={{ backgroundColor: brand }}
              >
                {author.name.charAt(0).toUpperCase()}
              </span>
            ) : null}
            <div className="text-sm" style={{ color: INK_MUTED }}>
              {author && (
                <span className="block font-semibold" style={{ color: INK }}>
                  {author.name}
                  {author.title ? `, ${author.title}` : ''}
                </span>
              )}
              <span>{fmtDate(post.publishedAt)}</span>
            </div>
          </div>
        </header>

        {post.coverImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={post.coverImageUrl}
            alt=""
            className="w-full aspect-[16/9] object-cover rounded-2xl mb-10"
          />
        )}

        <div
          className="prose prose-lg prose-stone max-w-none"
          style={proseStyle}
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />

        {author?.bio && (
          <div className="mt-12 pt-8 border-t" style={{ borderColor: BORDER }}>
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: INK_MUTED }}>
              About the author
            </p>
            <div className="flex items-start gap-4">
              {author.photoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={author.photoUrl} alt={author.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
              )}
              <div>
                <p className="font-semibold" style={{ color: INK }}>
                  {author.name}
                  {author.title ? `, ${author.title}` : ''}
                </p>
                <p className="text-[15px] leading-[1.55] mt-1" style={{ color: INK_MUTED }}>
                  {author.bio}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        <div
          className="mt-12 rounded-2xl p-8 text-center"
          style={{ backgroundColor: `${brand}14` }}
        >
          <p className="text-xl font-bold tracking-[-0.01em] mb-4" style={{ color: INK }}>
            Questions about your smile? We&apos;re happy to help.
          </p>
          <a
            href={bookHref}
            className="inline-flex items-center px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg hover:opacity-95"
            style={{ backgroundColor: brand }}
          >
            Book a Visit
          </a>
        </div>
      </article>
    </BlogChrome>
  )
}
