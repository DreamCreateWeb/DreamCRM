import { NextResponse } from 'next/server'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'

interface Params {
  slug: string
}

interface UrlEntry {
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: string
}

function buildSitemap(urls: UrlEntry[]): string {
  const body = urls
    .map((u) => {
      const lines = [`<loc>${escapeXml(u.loc)}</loc>`]
      if (u.lastmod) lines.push(`<lastmod>${u.lastmod}</lastmod>`)
      if (u.changefreq) lines.push(`<changefreq>${u.changefreq}</changefreq>`)
      if (u.priority) lines.push(`<priority>${u.priority}</priority>`)
      return `  <url>\n    ${lines.join('\n    ')}\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { slug } = await ctx.params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return new NextResponse('Not found', { status: 404 })

  const base = publicSiteUrl(data)
  const lastmod = data.profile.updatedAt
    ? new Date(data.profile.updatedAt).toISOString().slice(0, 10)
    : undefined
  const isPro =
    data.profile.planTier === 'pro' || data.profile.planTier === 'premium'

  const urls: UrlEntry[] = [
    { loc: `${base}/`, lastmod, changefreq: 'weekly', priority: '1.0' },
    { loc: `${base}/about`, lastmod, changefreq: 'monthly', priority: '0.8' },
    { loc: `${base}/services`, lastmod, changefreq: 'monthly', priority: '0.8' },
    { loc: `${base}/faq`, lastmod, changefreq: 'monthly', priority: '0.6' },
  ]
  if (isPro) {
    urls.push({ loc: `${base}/book`, lastmod, changefreq: 'monthly', priority: '0.8' })
  }

  // Published blog posts + the blog index (only when there's something to show).
  const posts = await listPublishedPosts(data.orgId)
  if (posts.length > 0) {
    urls.push({ loc: `${base}/blog`, lastmod, changefreq: 'weekly', priority: '0.7' })
    for (const p of posts) {
      urls.push({
        loc: `${base}/blog/${p.slug}`,
        lastmod: (p.publishedAt ?? p.updatedAt).toISOString().slice(0, 10),
        changefreq: 'monthly',
        priority: '0.6',
      })
    }
  }

  return new NextResponse(buildSitemap(urls), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
