import type { MetadataRoute } from 'next'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import { RESOURCE_GUIDES } from '@/lib/marketing/resources'
import { getMarketingPosts } from '@/lib/services/marketing-blog'

// Request-time: the blog posts come from the DB, which isn't reachable at
// build time (CodeBuild runs outside the VPC) — and the post list changes
// without deploys.
export const dynamic = 'force-dynamic'

// Root sitemap for the MARKETING site (www). Clinic public sites have their
// own per-slug sitemaps at {slug}.../sitemap.xml; authenticated app routes
// are deliberately absent (they redirect signed-out crawlers anyway).
/**
 * `lastmod` IS A CLAIM, SO IT IS ONLY MADE WHERE IT IS TRUE.
 *
 * Every entry used to carry `new Date()` — the moment of the REQUEST. A
 * crawler fetching this file twice saw sixty pages "modified" twice, which is
 * the pattern search engines document as the reason they stop reading the
 * field for a site at all (Google: it is used "if it's consistently and
 * verifiably accurate"; Bing asks for the true date for the same reason). A
 * date that is always now tells a crawler nothing about which page to come
 * back for, and costs the pages that DID change their signal.
 *
 * So a date appears only where the tree holds a real one:
 *  - a comparison page → the day its pricing was last re-read against the
 *    vendor's own page (`pricingChecked.on`); an unchecked entry has none;
 *  - a growth guide → the day it was written or last substantively revised;
 *  - a blog post → its own `updatedAt` / `publishedAt` from the database.
 * Everything else states no date rather than a manufactured one.
 *
 * Held by `tests/marketing/sitemap-dates.test.ts`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')

  const staticPages: MetadataRoute.Sitemap = ['', ...MARKETING_PUBLIC_PATHS].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.8,
  }))

  const comparePages: MetadataRoute.Sitemap = COMPARISONS.map((c) => ({
    url: `${base}/compare/${c.slug}`,
    ...(c.pricingChecked ? { lastModified: c.pricingChecked.on } : {}),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  const docPages: MetadataRoute.Sitemap = DOCS.map((d) => ({
    url: `${base}/docs/${d.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  const resourcePages: MetadataRoute.Sitemap = RESOURCE_GUIDES.map((g) => ({
    url: `${base}/resources/${g.slug}`,
    lastModified: g.datePublished,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  // Published marketing posts — best-effort: a DB hiccup must not 500 the
  // sitemap, so degrade to the static set.
  let postPages: MetadataRoute.Sitemap = []
  try {
    const posts = await getMarketingPosts()
    postPages = posts.map((post) => {
      const modified = post.updatedAt ?? post.publishedAt
      return {
        url: `${base}/blog/${post.slug}`,
        ...(modified ? { lastModified: modified } : {}),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }
    })
  } catch {
    postPages = []
  }

  return [...staticPages, ...comparePages, ...docPages, ...resourcePages, ...postPages]
}
