import 'server-only'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sitePageview } from '@/lib/db/schema/domain'
import { lead } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { resolveSeoMeta, compactSeoMeta, type PageSeoMeta } from '@/lib/types/seo-meta'

/**
 * Public-site traffic — the clinic's first real "how many people visit my
 * site" number. Backed by the `site_pageview` daily-rollup table the public
 * beacon (POST /api/site-view) upserts into. Read by /analytics (Acquisition)
 * + /seo ("Visits, your site" next to GSC clicks).
 *
 * Deliberately NOT a raw event log: one row per (org, day, normalized path),
 * no PII, no IP/UA. GSC clicks measure search-driven discovery (lagged ~2d);
 * THIS measures total visitors across every channel, today.
 */

/** Hard cap on a stored path so a hostile / generated URL can't bloat a row.
 *  Shared with the route so the upsert + the read agree on the shape. */
export const SITE_PATH_MAX_LEN = 256

/**
 * Normalize a request path into the bucket key we store:
 *  - strip the query string + fragment (counts the page, not the params)
 *  - drop a `?edit=1` Studio canvas (handled separately at the route, but we
 *    defend here too)
 *  - collapse a trailing slash (so `/about/` and `/about` are one bucket)
 *  - default to '/' for the homepage / empty
 *  - cap length
 *
 * The clinic site is served under /site/<slug>/... internally but the beacon
 * sends the PUBLIC path (what the visitor sees: '/', '/about', '/book', …), so
 * this operates on that public shape. Pure — exported for tests.
 */
export function normalizeSitePath(raw: string | null | undefined): string {
  if (!raw) return '/'
  let p = String(raw)
  // Drop query + fragment.
  const q = p.search(/[?#]/)
  if (q !== -1) p = p.slice(0, q)
  p = p.trim()
  if (!p || p === '') return '/'
  // Ensure a single leading slash.
  if (!p.startsWith('/')) p = '/' + p
  // Collapse duplicate slashes.
  p = p.replace(/\/{2,}/g, '/')
  // Trim a trailing slash (but keep the root '/').
  if (p.length > 1) p = p.replace(/\/+$/, '')
  if (!p) p = '/'
  return p.slice(0, SITE_PATH_MAX_LEN)
}

/** UTC calendar-day key ('YYYY-MM-DD') for a Date. Daily buckets are UTC so the
 *  rollup is stable regardless of server timezone. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Record one pageview — the atomic daily upsert behind the beacon.
 * INSERT (org, day, path, views=1) … ON CONFLICT (org, day, path)
 * DO UPDATE views = views + 1. Best-effort; the route swallows errors so the
 * beacon never surfaces a failure to the visitor.
 */
export async function recordSiteView(
  organizationId: string,
  rawPath: string | null | undefined,
  now: Date = new Date(),
): Promise<void> {
  const path = normalizeSitePath(rawPath)
  const day = dayKey(now)
  await db
    .insert(sitePageview)
    .values({ organizationId, day, path, views: 1 })
    .onConflictDoUpdate({
      target: [sitePageview.organizationId, sitePageview.day, sitePageview.path],
      set: { views: sql`${sitePageview.views} + 1`, updatedAt: new Date() },
    })
}

export interface SiteTrafficDay {
  /** 'YYYY-MM-DD' */
  day: string
  views: number
}

export interface SiteTrafficPage {
  path: string
  views: number
}

export interface SiteTraffic {
  windowDays: number
  /** Total views across the window. */
  total: number
  /** Total views in the PRIOR equal-length window (for a delta). */
  totalPrev: number
  /** One entry per calendar day in the window, oldest → newest, zero-filled. */
  daily: SiteTrafficDay[]
  /** Top pages by views in the window (capped). */
  topPages: SiteTrafficPage[]
}

const TOP_PAGES_LIMIT = 8

/**
 * Aggregate the daily rollup for an org over the last `days` days (inclusive of
 * today). Returns zero-filled daily totals (so the sparkline has a bar per day
 * even when traffic is sparse), a window total + a prior-window total for a
 * delta, and the top pages. All reads are scoped to the org.
 */
export async function getSiteTraffic(organizationId: string, days = 30): Promise<SiteTraffic> {
  const windowDays = days === 90 ? 90 : days === 7 ? 7 : 30
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  // Window start (inclusive) = today - (windowDays - 1). Prior window start =
  // window start - windowDays, so the two windows are equal-length + adjacent.
  const windowStart = new Date(today)
  windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1))
  const priorStart = new Date(windowStart)
  priorStart.setUTCDate(priorStart.getUTCDate() - windowDays)

  const windowStartKey = dayKey(windowStart)
  const priorStartKey = dayKey(priorStart)

  // Pull every row from the prior-window start forward in one query, then bucket
  // in JS (cheap — at most ~2 * windowDays * distinct-paths rows).
  const rows = await db
    .select({ day: sitePageview.day, path: sitePageview.path, views: sitePageview.views })
    .from(sitePageview)
    .where(and(eq(sitePageview.organizationId, organizationId), gte(sitePageview.day, priorStartKey)))

  // Zero-filled daily buckets for the CURRENT window.
  const dailyMap = new Map<string, number>()
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(windowStart)
    d.setUTCDate(d.getUTCDate() + i)
    dailyMap.set(dayKey(d), 0)
  }

  const pageMap = new Map<string, number>()
  let total = 0
  let totalPrev = 0

  for (const r of rows) {
    const v = Number(r.views) || 0
    // `day` comes back as a 'YYYY-MM-DD' string (date mode 'string').
    const dk = typeof r.day === 'string' ? r.day : dayKey(new Date(r.day as unknown as string))
    if (dk >= windowStartKey) {
      total += v
      dailyMap.set(dk, (dailyMap.get(dk) ?? 0) + v)
      pageMap.set(r.path, (pageMap.get(r.path) ?? 0) + v)
    } else if (dk >= priorStartKey) {
      totalPrev += v
    }
  }

  const daily: SiteTrafficDay[] = Array.from(dailyMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, views]) => ({ day, views }))

  const topPages: SiteTrafficPage[] = Array.from(pageMap.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, TOP_PAGES_LIMIT)

  return { windowDays, total, totalPrev, daily, topPages }
}

// ── Per-page SEO meta (Settings → Search appearance) ──────────────────────────
// Stored on clinic_profile.seo_meta. Read always returns the full resolved map
// (every page key present) so the editor + each page's generateMetadata can
// index without guards.

/** Read the clinic's per-page SEO overrides as a full resolved map. */
export async function getSeoMeta(organizationId: string): Promise<PageSeoMeta> {
  const [row] = await db
    .select({ seoMeta: clinicProfile.seoMeta })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return resolveSeoMeta(row?.seoMeta ?? null)
}

/**
 * Persist per-page SEO overrides. The form submits the full map; we sanitize +
 * compact it (only keys with a set field are stored; all-empty → null) so junk
 * can't poison the column. Returns the re-resolved map.
 */
export async function updateSeoMeta(
  organizationId: string,
  meta: PageSeoMeta,
): Promise<PageSeoMeta> {
  const cleaned = compactSeoMeta(resolveSeoMeta(meta))
  await db
    .update(clinicProfile)
    .set({ seoMeta: cleaned, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, organizationId))
  return resolveSeoMeta(cleaned)
}

// ── Website performance (the Studio's glance panel) ────────────────────────

export interface SitePerformance {
  traffic: SiteTraffic
  /** Website leads created in the same 30-day window (any status). */
  leads30d: number
  /** leads / visits as a whole-number percent; null until there's traffic. */
  conversionPct: number | null
}

/**
 * One read for "how is my website doing" — 30-day traffic + the leads it
 * produced + a visit→lead conversion rate. Powers the Studio performance
 * panel; the Overview tile uses getSiteTraffic(org, 7) directly.
 */
export async function getSitePerformance(organizationId: string): Promise<SitePerformance> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [traffic, leadRows] = await Promise.all([
    getSiteTraffic(organizationId, 30),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lead)
      .where(and(eq(lead.organizationId, organizationId), gte(lead.createdAt, since))),
  ])
  const leads30d = leadRows[0]?.n ?? 0
  const conversionPct =
    traffic.total > 0 ? Math.round((leads30d / traffic.total) * 1000) / 10 : null
  return { traffic, leads30d, conversionPct }
}

export interface WeeklySiteDigest {
  traffic: SiteTraffic
  /** Website leads created in the same 7-day window (any status). */
  leads7d: number
}

/**
 * The Monday-digest read: last-7-days traffic + the leads the site produced in
 * the same window. One call per clinic per Monday (the daily-digest cron), so
 * it stays a single pair of scoped queries.
 */
export async function getWeeklySiteDigest(organizationId: string): Promise<WeeklySiteDigest> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [traffic, leadRows] = await Promise.all([
    getSiteTraffic(organizationId, 7),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(lead)
      .where(and(eq(lead.organizationId, organizationId), gte(lead.createdAt, since))),
  ])
  return { traffic, leads7d: leadRows[0]?.n ?? 0 }
}
