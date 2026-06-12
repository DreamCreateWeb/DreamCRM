import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { getPublishedPostBySlug, resolvePostPeople, listRelatedPosts } from '@/lib/services/blog'
import { excerptFromHtml } from '@/lib/utils'
import { staffSlug } from '@/lib/clinic-site-helpers'
import { breadcrumbJsonLd } from '@/lib/clinic-site-jsonld'
import type { BlogFaqItem } from '@/lib/types/clinic-content'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import BlogArticle from '@/components/clinic-site/blog-article'
import BlogViewBeacon from '@/components/clinic-site/blog-view-beacon'

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
  const description =
    post.seoDescription?.trim() || post.excerpt?.trim() || excerptFromHtml(post.bodyHtml)
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

export default async function ClinicBlogPostPage({ params }: Props) {
  const { slug, postSlug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()
  const post = await getPublishedPostBySlug(data.orgId, postSlug)
  if (!post) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const name = data.profile.displayName ?? data.orgName
  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  const { author, reviewer } = await resolvePostPeople(data.orgId, post)
  const related = await listRelatedPosts(data.orgId, post.id, post.category, 3)
  const siteUrl = publicSiteUrl(data)
  const url = `${siteUrl}/blog/${post.slug}`

  // Author/reviewer get a `url` pointing at their /team/[slug] page when they're
  // a staff member with a resolvable slug — a real E-E-A-T author link, not a
  // bare name string.
  const authorSlug = author ? staffSlug(author) : null
  const reviewerSlug = reviewer ? staffSlug(reviewer) : null

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
    ...(author
      ? {
          author: {
            '@type': 'Person',
            name: author.name,
            ...(author.title ? { jobTitle: author.title } : {}),
            ...(authorSlug ? { url: `${siteUrl}/team/${authorSlug}` } : {}),
          },
        }
      : {}),
    ...(reviewer
      ? {
          reviewedBy: {
            '@type': 'Person',
            name: reviewer.name,
            ...(reviewer.title ? { jobTitle: reviewer.title } : {}),
            ...(reviewerSlug ? { url: `${siteUrl}/team/${reviewerSlug}` } : {}),
          },
        }
      : {}),
    publisher: {
      '@type': 'Organization',
      name,
      ...(data.profile.logoUrl ? { logo: { '@type': 'ImageObject', url: data.profile.logoUrl } } : {}),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  }

  // BreadcrumbList: Home › Blog › {post title}.
  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Home', url: siteUrl },
    { name: 'Blog', url: `${siteUrl}/blog` },
    { name: post.title },
  ])

  // FAQPage JSON-LD — a strong AI-Overview / voice-search signal for YMYL.
  const faq = ((post.faq as BlogFaqItem[] | null) ?? []).filter((f) => f?.q && f?.a)
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
    <BlogChrome data={data} basePath={basePath}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      )}
      <BlogViewBeacon postId={post.id} />
      <div data-edit-field="blog" data-edit-kind="modal" data-edit-label="blog posts">
        <BlogArticle
          post={post}
          author={author}
          reviewer={reviewer}
          related={related}
          brand={brand}
          basePath={basePath}
          isPro={isPro}
        />
      </div>
    </BlogChrome>
  )
}
