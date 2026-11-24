import type { MetadataRoute } from 'next'
import { publicPages, type PublicPost } from '@/lib/marketing/public-pages'
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
 * crawler fetching this file twice saw every page "modified" twice, which is
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
 *
 * THE LIST ITSELF IS NOT HERE. `lib/marketing/public-pages.ts` is the one
 * list of what the marketing site publishes; this file renders it as a
 * sitemap, and the IndexNow notice (lib/services/indexnow.ts) reads the same
 * list, so the two cannot name different pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')

  // Published marketing posts — best-effort: a DB hiccup must not 500 the
  // sitemap, so degrade to the static set. (The IndexNow notice does the
  // opposite and ABORTS on the same failure: a sitemap missing its posts for
  // a minute is harmless, a notice that they were all deleted is not.)
  let posts: PublicPost[] = []
  try {
    posts = await getMarketingPosts()
  } catch {
    posts = []
  }

  return publicPages(posts).map((page) => ({
    url: `${base}${page.path === '/' ? '' : page.path}`,
    ...(page.lastModified ? { lastModified: page.lastModified } : {}),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
}
