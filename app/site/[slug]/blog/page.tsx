import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { listPublishedPosts, listPublishedCategories, getPostAuthor } from '@/lib/services/blog'
import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'
import BlogChrome from '@/components/clinic-site/blog-chrome'
import { resolveSeoMeta, applySeoOverride } from '@/lib/types/seo-meta'
import { SITE_HEADING } from '@/components/clinic-site/tokens'
import { blogIndexJsonLd } from '@/lib/clinic-site-jsonld'


interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ category?: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/blog`
  const { title, description } = applySeoOverride(resolveSeoMeta(data.profile.seoMeta)['blog-index'], {
    title: `Blog — ${name}`,
    description: `Oral-health tips, treatment guides, and news from ${name}.`,
  })
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function ClinicBlogIndexPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { category } = await searchParams
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const brand = data.profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = SITE_HEADING
  const name = data.profile.displayName ?? data.orgName
  const bookHref = data.profile.selfBookingEnabled !== false ? `${basePath}/book` : `${basePath || '/'}#contact`

  const [posts, categories] = await Promise.all([
    listPublishedPosts(data.orgId, { category }),
    listPublishedCategories(data.orgId),
  ])
  const authors = await Promise.all(posts.map((p) => getPostAuthor(data.orgId, p)))

  // Pull a featured post forward when we're not in a filtered view and have
  // at least 3 posts. With <3 posts the grid alone reads better than a hero
  // card + 0-1 sidekick.
  const showFeatured = !category && posts.length >= 3
  const featured = showFeatured ? posts[0] : null
  const featuredAuthor = showFeatured ? authors[0] : null
  const restPosts = showFeatured ? posts.slice(1) : posts
  const restAuthors = showFeatured ? authors.slice(1) : authors

  // Blog JSON-LD — the index lists recent posts as BlogPosting stubs; each
  // post page carries the full BlogPosting. Only emitted when posts exist.
  const siteUrl = publicSiteUrl(data)
  const blogLd =
    posts.length > 0
      ? blogIndexJsonLd({
          name: `${name} blog`,
          url: `${siteUrl}/blog`,
          clinicName: name,
          posts: posts.slice(0, 20).map((p) => ({
            title: p.title,
            url: `${siteUrl}/blog/${p.slug}`,
            datePublished: p.publishedAt ? p.publishedAt.toISOString() : null,
            description: p.excerpt ?? null,
          })),
        })
      : null

  const { def: siteTemplate } = await resolveActiveSiteTemplate(slug)
  const Body = siteTemplate.pages.subpages.blogIndex
  return (
    <BlogChrome data={data} basePath={basePath}>
        <Body blogLd={blogLd} brand={brand} headingInk={headingInk} name={name} categories={categories} basePath={basePath} category={category} posts={posts} featured={featured} featuredAuthor={featuredAuthor} restPosts={restPosts} restAuthors={restAuthors} bookHref={bookHref} data={data} />
      </BlogChrome>
  )
}
