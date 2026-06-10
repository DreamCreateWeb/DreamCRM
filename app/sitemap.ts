import type { MetadataRoute } from 'next'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'

// Root sitemap for the MARKETING site (www). Clinic public sites have their
// own per-slug sitemaps at {slug}.../sitemap.xml; authenticated app routes
// are deliberately absent (they redirect signed-out crawlers anyway).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')
  const now = new Date()

  const staticPages = ['', '/product', '/pricing', '/compare', '/docs', '/blog'].map((p) => ({
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

  return [...staticPages, ...comparePages, ...docPages]
}
