import { NextResponse } from 'next/server'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import { resolveClinicServices } from '@/lib/services/service-library'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { staffSlug as resolveStaffSlug } from '@/lib/clinic-site-helpers'

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
    { loc: `${base}/faq`, lastmod, changefreq: 'monthly', priority: '0.6' },
    // Patients dropdown — Insurance + Payment & Financing always render (with
    // universal fallbacks when the clinic hasn't customized), so both go in
    // the sitemap unconditionally. /dental-plans is added below only when
    // the clinic has ≥1 active membership plan.
    { loc: `${base}/insurance`, lastmod, changefreq: 'monthly', priority: '0.7' },
    {
      loc: `${base}/payment-financing`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.7',
    },
  ]
  if (isPro) {
    urls.push({ loc: `${base}/book`, lastmod, changefreq: 'monthly', priority: '0.8' })
  }

  // /services only when the clinic actually has ≥1 resolved (library-linked)
  // service. A clinic with none renders an honest empty page, so it shouldn't
  // be advertised in the sitemap. Resolve the same way the page does so the
  // gate matches what renders.
  const resolvedServices = await resolveClinicServices(
    (data.profile.services as ClinicService[] | null) ?? null,
    {
      clinicName: data.profile.displayName ?? data.orgName,
      city: data.primaryLocation?.city ?? data.profile.city ?? null,
    },
  )
  if (resolvedServices.length > 0) {
    urls.push({ loc: `${base}/services`, lastmod, changefreq: 'monthly', priority: '0.8' })
  }

  // /careers + per-role detail pages — only when there are open postings (the
  // careers index renders, but the SEO value is the indexable JobPosting pages).
  const openJobs = await getOpenJobs(data.orgId)
  if (openJobs.length > 0) {
    urls.push({ loc: `${base}/careers`, lastmod, changefreq: 'weekly', priority: '0.6' })
    for (const j of openJobs) {
      if (!j.slug) continue
      urls.push({
        loc: `${base}/careers/${j.slug}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.5',
      })
    }
  }

  // /dental-plans only when there are active membership plans (the page
  // notFound()s otherwise).
  const membershipPlans = await listActivePlans(data.orgId)
  if (membershipPlans.length > 0) {
    urls.push({
      loc: `${base}/dental-plans`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.7',
    })
  }

  // /team — included when the clinic has ≥1 staff entry. Per-staff detail
  // pages get their own URLs (one entry per staff member). Empty staff =
  // the /team index renders a placeholder; we don't include it in the
  // sitemap when there's nothing to surface.
  const staff = (data.profile.staff as ClinicStaff[] | null) ?? []
  if (staff.length > 0) {
    urls.push({
      loc: `${base}/team`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.7',
    })
    for (const s of staff) {
      const personSlug = resolveStaffSlug(s)
      if (!personSlug) continue
      urls.push({
        loc: `${base}/team/${personSlug}`,
        lastmod,
        changefreq: 'monthly',
        priority: '0.5',
      })
    }
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
