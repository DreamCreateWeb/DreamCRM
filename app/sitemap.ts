import type { MetadataRoute } from 'next'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import { getMarketingPosts } from '@/lib/services/marketing-blog'

// Request-time: the blog posts come from the DB, which isn't reachable at
// build time (CodeBuild runs outside the VPC) — and the post list changes
// without deploys.
export const dynamic = 'force-dynamic'

// Root sitemap for the MARKETING site (www). Clinic public sites have their
// own per-slug sitemaps at {slug}.../sitemap.xml; authenticated app routes
// are deliberately absent (they redirect signed-out crawlers anyway).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')
  const now = new Date()

  const staticPages = ['', ...MARKETING_PUBLIC_PATHS].map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.8,
  }))

  const comparePages = COMPARISONS.map((c) => ({
    url: `${base}/compare/${c.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  const docPages = DOCS.map((d) => ({
    url: `${base}/docs/${d.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  // Published marketing posts — best-effort: a DB hiccup must not 500 the
  // sitemap, so degrade to the static set.
  let postPages: MetadataRoute.Sitemap = []
  try {
    const posts = await getMarketingPosts()
    postPages = posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.updatedAt ?? post.publishedAt ?? now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch {
    postPages = []
  }

  return [...staticPages, ...comparePages, ...docPages, ...postPages]
}
