import 'server-only'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lead, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { listPublishedPosts } from '@/lib/services/blog'

/**
 * SEO service. Two self-contained surfaces for v1 (no external deps):
 *
 *  - getSiteHealth: an on-page / content / structured-data audit of the
 *    clinic's OWN hosted site. Accurate because we control the markup.
 *  - getOrganicAttribution: the moat — how many leads + booked appointments
 *    arrived from organic search, computed from the referrer/UTM we capture
 *    on the public contact + booking forms. (Google Search Console clicks/
 *    queries layer on top in the next update.)
 */

// ── Organic detection ───────────────────────────────────────────────────────

const SEARCH_HOSTS = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'ecosia.', 'baidu.', 'yandex.', 'search.brave.']

/** True when a contact/booking arrived from organic search. An explicit
 * utm_medium wins (organic/seo = yes; cpc/paid/email/social/referral = no);
 * otherwise we fall back to the referrer host being a search engine. */
export function isOrganicReferrer(referrer?: string | null, utmMedium?: string | null): boolean {
  const m = (utmMedium ?? '').trim().toLowerCase()
  if (m === 'organic' || m === 'seo') return true
  if (m) return false // explicitly tagged as something else (cpc, email, social…)
  const r = (referrer ?? '').trim().toLowerCase()
  if (!r) return false
  let host = r
  try {
    host = new URL(r.startsWith('http') ? r : `https://${r}`).hostname
  } catch {
    /* not a parseable URL — match against the raw string below */
  }
  return SEARCH_HOSTS.some((h) => host.includes(h))
}

// ── Site Health audit ───────────────────────────────────────────────────────

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface SiteHealthCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface SiteHealth {
  score: number // 0-100
  checks: SiteHealthCheck[]
}

export async function getSiteHealth(organizationId: string): Promise<SiteHealth> {
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)

  const posts = await listPublishedPosts(organizationId)
  const services = (profile?.services as ClinicService[] | null) ?? []
  const staff = (profile?.staff as ClinicStaff[] | null) ?? []

  const checks: SiteHealthCheck[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail })

  // Title / clinic name
  add(
    'name',
    'Site title',
    profile?.displayName ? 'pass' : 'fail',
    profile?.displayName ? `Set to “${profile.displayName}”.` : 'Add a clinic name in Settings → Clinic.',
  )
  // Meta description source
  const hasDescription = Boolean(profile?.tagline?.trim() || profile?.about?.trim())
  add(
    'meta',
    'Meta description',
    hasDescription ? 'pass' : 'warn',
    hasDescription ? 'Drawn from your tagline / about copy.' : 'Add a tagline or About so search results read well.',
  )
  // NAP (name/address/phone) — a top local-SEO factor
  const hasNap = Boolean(profile?.addressLine1 && profile?.city && profile?.state && profile?.phone)
  add(
    'nap',
    'Name, address & phone',
    hasNap ? 'pass' : 'fail',
    hasNap ? 'Complete — feeds your local-pack ranking + Dentist schema.' : 'Add full address + phone (key for local search).',
  )
  // Services content depth
  add(
    'services',
    'Services content',
    services.length >= 4 ? 'pass' : 'warn',
    `${services.length} service${services.length === 1 ? '' : 's'} listed${services.length >= 4 ? '.' : ' — aim for at least 4.'}`,
  )
  // Team (E-E-A-T)
  add(
    'team',
    'Team / authorship (E-E-A-T)',
    staff.length >= 2 ? 'pass' : 'warn',
    staff.length >= 2 ? `${staff.length} team members — real bylines build trust.` : 'Add team members so posts can carry a real byline.',
  )
  // Published content
  add(
    'content',
    'Published content',
    posts.length >= 1 ? 'pass' : 'warn',
    posts.length >= 1 ? `${posts.length} published post${posts.length === 1 ? '' : 's'}.` : 'Publish a post or two to build topical authority.',
  )
  // Image alt coverage
  const withCover = posts.filter((p) => p.coverImageUrl)
  const missingAlt = withCover.filter((p) => !p.coverImageAlt?.trim()).length
  add(
    'alt',
    'Image alt text',
    withCover.length === 0 ? 'pass' : missingAlt === 0 ? 'pass' : 'warn',
    withCover.length === 0
      ? 'No cover images to describe yet.'
      : missingAlt === 0
        ? 'All cover images have alt text.'
        : `${missingAlt} post${missingAlt === 1 ? '' : 's'} missing cover alt text.`,
  )
  // Structured data (we emit it)
  const faqCount = posts.filter((p) => Array.isArray(p.faq) && (p.faq as unknown[]).length > 0).length
  add(
    'schema',
    'Structured data (schema.org)',
    'pass',
    `Dentist + ${posts.length} Article${posts.length === 1 ? '' : 's'}${faqCount ? ` + ${faqCount} FAQ page${faqCount === 1 ? '' : 's'}` : ''} emitted as JSON-LD.`,
  )
  // Crawlability
  add('crawl', 'Sitemap & robots.txt', 'pass', 'Per-clinic sitemap.xml + robots.txt are served automatically.')

  const weight = (s: CheckStatus) => (s === 'pass' ? 1 : s === 'warn' ? 0.5 : 0)
  const score = Math.round((checks.reduce((n, c) => n + weight(c.status), 0) / checks.length) * 100)
  return { score, checks }
}

// ── Organic attribution ─────────────────────────────────────────────────────

export interface OrganicAttribution {
  windowDays: number
  organicLeads: number
  totalLeads: number
  organicBookings: number
  totalBookings: number
}

export async function getOrganicAttribution(
  organizationId: string,
  windowDays = 30,
): Promise<OrganicAttribution> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const leads = await db
    .select({ referrer: lead.referrer, utmMedium: lead.utmMedium })
    .from(lead)
    .where(and(eq(lead.organizationId, organizationId), gte(lead.createdAt, since)))

  const bookings = await db
    .select({ referrer: appointment.referrer, utmMedium: appointment.utmMedium })
    .from(appointment)
    .where(
      and(
        eq(appointment.organizationId, organizationId),
        eq(appointment.source, 'booking_widget'),
        gte(appointment.createdAt, since),
      ),
    )

  return {
    windowDays,
    totalLeads: leads.length,
    organicLeads: leads.filter((l) => isOrganicReferrer(l.referrer, l.utmMedium)).length,
    totalBookings: bookings.length,
    organicBookings: bookings.filter((b) => isOrganicReferrer(b.referrer, b.utmMedium)).length,
  }
}
