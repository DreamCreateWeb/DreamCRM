import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { eq, and, desc, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, clinicLocation } from '@/lib/db/schema/platform'
import type { ClinicProfile, ClinicLocation } from '@/lib/db/schema/platform'
import { expandServedHosts } from '@/lib/services/custom-domain'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/** Canonical base URL of the authenticated app (sign-in, dashboard, portal).
 *  Used for cross-domain links FROM a clinic public site (which may live on a
 *  subdomain or custom domain) back INTO the app. Always absolute. */
export function appBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  return env || `https://www.${SITE_DOMAIN}`
}

/**
 * The clinic-scoped PATIENT-portal sign-in / sign-up URL — where a clinic's
 * public-site "Login" sends patients: to log into (or create) their account at
 * THIS clinic and land in this clinic's portal. NEVER the platform staff
 * sign-in (which would offer clinic onboarding — a patient could accidentally
 * create a whole new clinic). Absolute www URL so the better-auth POST is
 * same-origin: a subdomain `/portal` would rewrite to `/site/<slug>/portal` and
 * break the relative `/api/auth/*` call.
 */
export function clinicPortalSignInUrl(slug: string): string {
  return `${appBaseUrl()}/site/${encodeURIComponent(slug)}/portal`
}

/**
 * Resolve a clinic org id from its PUBLIC slug.
 *
 * The public form actions (contact / booking / insurance verifier) use this
 * instead of trusting an `orgId` posted in FormData. The slug is the clinic's
 * public identity (it's literally the page the form lives on), so resolving
 * server-side guarantees a submission can only ever land in a real clinic org
 * — never the platform org, an arbitrary id, or a non-clinic org. Returns null
 * when the slug doesn't map to a clinic.
 */
export async function resolveClinicOrgIdBySlug(slug: string): Promise<string | null> {
  const s = slug?.trim()
  if (!s) return null
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.slug, s), eq(organization.type, 'clinic')))
    .limit(1)
  return org?.id ?? null
}

/**
 * Resolve the prefix for in-page links on a clinic public site.
 *
 * The same `/site/[slug]` route is reachable two ways:
 *   • path-based — `www.<domain>/site/<slug>` — links need the `/site/<slug>`
 *     prefix.
 *   • subdomain / custom domain — `<slug>.<domain>/` (middleware rewrites it
 *     to `/site/<slug>`) — the site lives at the host ROOT, so links must be
 *     root-relative (`''` prefix).
 *
 * Hardcoding `/site/<slug>` broke every internal link on the subdomain: the
 * browser appended it to the subdomain host, re-entered the middleware rewrite
 * (`/site/<slug>/site/<slug>/…`) and 404'd. This reads the request host to pick
 * the correct prefix. Returns `''` (root) for subdomain/custom-domain serving,
 * `/site/<slug>` for path-based serving (apex, www, local dev).
 */
export async function resolveSiteBasePath(slug: string): Promise<string> {
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || '')
    .split(',')[0]
    .split(':')[0]
    .trim()
    .toLowerCase()
  const pathBasedHosts = new Set([
    SITE_DOMAIN,
    `www.${SITE_DOMAIN}`,
    `app.${SITE_DOMAIN}`,
  ])
  if (
    host === '' ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    pathBasedHosts.has(host)
  ) {
    return `/site/${slug}`
  }
  // Subdomain (`<slug>.<domain>`) or a clinic's custom domain — site is at root.
  return ''
}

export interface ClinicSiteData {
  orgId: string
  orgName: string
  slug: string
  profile: ClinicProfile
  primaryLocation: ClinicLocation | null
  locations: ClinicLocation[]
}

/**
 * The canonical public URL the clinic site lives at. Order of preference:
 *   1. Custom domain when configured
 *   2. Subdomain `<slug>.<SITE_DOMAIN>` — only when wildcard DNS is wired
 *      (opt in via `NEXT_PUBLIC_SITE_USE_SUBDOMAIN=true`)
 *   3. Path-based `<SITE_DOMAIN>/site/<slug>` — the safe default while
 *      wildcard DNS for *.<SITE_DOMAIN> is still pending
 *
 * Used in every SEO surface — canonical metadata, OG URLs, sitemap,
 * JSON-LD `url` and `@id`. Always returns a URL without trailing slash,
 * so callers can append paths.
 */
export function publicSiteUrl(data: Pick<ClinicSiteData, 'slug' | 'profile'>): string {
  const custom = data.profile.websiteDomain?.trim()
  if (custom) return `https://${custom}`
  if (process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN === 'true') {
    return `https://${data.slug}.${SITE_DOMAIN}`
  }
  return `https://${SITE_DOMAIN}/site/${data.slug}`
}

/**
 * Minimal, request-cached slug → clinic orgId resolver. Used by the
 * `/site/[slug]` layout to gate the Website Studio EditBridge without loading
 * the full profile + locations on every public page hit.
 */
export const getClinicOrgIdBySlug = cache(async (slug: string): Promise<string | null> => {
  const [org] = await db
    .select({ id: organization.id, type: organization.type })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)
  return org && org.type === 'clinic' ? org.id : null
})

/**
 * Minimal, request-cached slug → `{ orgId, brand, template }` resolver for the
 * site layout, which derives the whole CSS-variable palette from the brand
 * color THROUGH the active template's recipe on every public page hit. Kept
 * separate (+ tiny) from the full profile load so the layout doesn't pull
 * locations/services just to read two columns; `cache()` dedupes it within a
 * request. Returns all-null for a non-clinic / unknown slug so the layout can
 * fall back to the neutral default.
 */
export const getClinicThemeBySlug = cache(
  async (
    slug: string,
  ): Promise<{ orgId: string | null; brand: string | null; template: string | null }> => {
    const [row] = await db
      .select({
        id: organization.id,
        type: organization.type,
        brand: clinicProfile.brandColor,
        template: clinicProfile.template,
      })
      .from(organization)
      .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
      .where(eq(organization.slug, slug))
      .limit(1)
    if (!row || row.type !== 'clinic') return { orgId: null, brand: null, template: null }
    return { orgId: row.id, brand: row.brand ?? null, template: row.template ?? null }
  },
)

export async function getClinicSiteBySlug(slug: string): Promise<ClinicSiteData | null> {
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)

  if (!org || org.type !== 'clinic') return null

  return loadSite(org.id, org.slug, org.name)
}

export async function getClinicSiteByDomain(domain: string): Promise<ClinicSiteData | null> {
  const host = domain?.trim().toLowerCase()
  if (!host) return null
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.websiteDomain, host))
    .limit(1)

  if (!profile) return null

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, profile.organizationId))
    .limit(1)

  if (!org || org.type !== 'clinic') return null

  return loadSite(org.id, org.slug, org.name)
}

/**
 * Map of `customDomain → slug` for every clinic that has wired a custom domain.
 * Powers the middleware host-routing fetch (`/api/internal/custom-domains`): a
 * request arriving on `www.smilebright.com` is rewritten to that clinic's
 * `/site/<slug>` exactly like the subdomain branch.
 *
 * We include domains in `active` AND `pending_dns` state — once the clinic's
 * DNS resolves to App Runner the request will arrive here even before ACM
 * finishes binding, and serving the (TLS-terminated) site immediately is the
 * right behavior. `failed`/manual-without-records states still serve once DNS
 * points at us. We never block on AWS-reported state for routing; AWS owns the
 * cert, we own the rewrite.
 */
export async function listActiveCustomDomains(): Promise<Record<string, string>> {
  const rows = await db
    .select({
      slug: organization.slug,
      type: organization.type,
      domain: clinicProfile.websiteDomain,
      status: clinicProfile.customDomainStatus,
    })
    .from(clinicProfile)
    .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
    .where(isNotNull(clinicProfile.websiteDomain))

  const map: Record<string, string> = {}
  for (const r of rows) {
    if (r.type !== 'clinic') continue
    const host = r.domain?.trim().toLowerCase()
    if (!host || !r.slug) continue
    // Route EVERY host this clinic's site serves — an apex + its www. sibling
    // are a pair. Prefer the explicit served hosts / routing records stored on
    // the status; fall back to deriving them from the canonical domain so a
    // legacy row (no status) still routes both.
    const status = r.status as { servedHosts?: unknown; dnsRecords?: unknown } | null
    let hosts: string[] = []
    if (status && Array.isArray(status.servedHosts)) {
      hosts = status.servedHosts.filter((h): h is string => typeof h === 'string')
    } else if (status && Array.isArray(status.dnsRecords)) {
      hosts = (status.dnsRecords as Array<{ name?: unknown; purpose?: unknown }>)
        .filter((d) => d.purpose === 'routing' && typeof d.name === 'string')
        .map((d) => d.name as string)
    }
    if (hosts.length === 0) hosts = expandServedHosts(host)
    for (const h of hosts) {
      const key = h.trim().toLowerCase()
      if (key) map[key] = r.slug
    }
  }
  return map
}

async function loadSite(orgId: string, slug: string, orgName: string): Promise<ClinicSiteData | null> {
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  if (!profile) return null

  const locations = await db
    .select()
    .from(clinicLocation)
    .where(eq(clinicLocation.organizationId, orgId))
    .orderBy(desc(clinicLocation.isPrimary), clinicLocation.createdAt)

  return {
    orgId,
    orgName,
    slug,
    profile,
    primaryLocation: locations.find((l) => l.isPrimary === 1) ?? locations[0] ?? null,
    locations,
  }
}

const DAY_TO_SCHEMA: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

interface HoursEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
}

/**
 * A real, synced aggregate rating sourced ONLY from the clinic's Google
 * Business reviews (`getGoogleReviewStats`). Passed in by the caller — never
 * fabricated. `clinicJsonLd` emits an `AggregateRating` ONLY when this is
 * supplied with `count >= 1` AND a non-null `averageRating`.
 */
export interface ClinicAggregateRating {
  /** Mean star rating over rated Google reviews, rounded to 1 decimal. */
  averageRating: number | null
  /** Count of Google reviews carrying a 1–5 rating. */
  count: number
}

/**
 * Build a schema.org `Dentist` JSON-LD object for the clinic homepage.
 * Google uses this for the Knowledge Panel + rich results; Bing + AI
 * search overlays read it too. Includes hours when set, address, phone,
 * and — when `aggregateRating` is supplied from REAL synced Google reviews —
 * a legitimate `AggregateRating` (star rich-snippets). Never fabricated.
 */
export function clinicJsonLd(
  data: ClinicSiteData,
  aggregateRating?: ClinicAggregateRating | null,
): Record<string, unknown> {
  const url = publicSiteUrl(data)
  const name = data.profile.displayName ?? data.orgName
  const description =
    data.profile.tagline ?? (data.profile.about ? data.profile.about.slice(0, 200) : null)
  const loc = data.primaryLocation ?? null
  const profile = data.profile

  // Prefer location address; fall back to profile-level address.
  const streetAddress = loc?.addressLine1 ?? profile.addressLine1 ?? undefined
  const addressLocality = loc?.city ?? profile.city ?? undefined
  const addressRegion = loc?.state ?? profile.state ?? undefined
  const postalCode = loc?.postalCode ?? profile.postalCode ?? undefined
  const phone = loc?.phone ?? profile.phone ?? undefined

  const openingHoursSpecification: Array<Record<string, unknown>> = []
  const hours = (profile.hours ?? {}) as Record<string, HoursEntry | undefined>
  for (const [day, entry] of Object.entries(hours)) {
    if (!entry || entry.closed || !entry.open || !entry.close) continue
    const dayOfWeek = DAY_TO_SCHEMA[day]
    if (!dayOfWeek) continue
    openingHoursSpecification.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek,
      opens: entry.open,
      closes: entry.close,
    })
  }

  // AggregateRating is emitted ONLY from REAL synced Google Business reviews
  // (the Zernio GBP integration), passed in via `aggregateRating`. We require a
  // genuine count (>= 1 rated review) AND a non-null average; otherwise the key
  // is omitted entirely. This is the deliberate opposite of the old hardcoded
  // `ratingValue: '4.9'` — emitting a fabricated value is exactly the
  // fake-review violation the Reviews module + FTC 2024 Fake Reviews Rule +
  // Google's review-snippet guidelines forbid. No reviews → no rating.
  const emitRating =
    aggregateRating != null &&
    aggregateRating.count >= 1 &&
    aggregateRating.averageRating != null

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    '@id': `${url}/#dentist`,
    name,
    url,
    ...(description ? { description } : {}),
    ...(phone ? { telephone: phone } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.logoUrl ? { logo: profile.logoUrl } : {}),
    // `image` powers rich-result thumbnails; fall back to the hero photo when
    // the clinic hasn't uploaded a logo (the OG card already uses the hero).
    ...(profile.logoUrl || profile.heroImageUrl
      ? { image: profile.logoUrl ?? profile.heroImageUrl }
      : {}),
    ...(streetAddress || addressLocality
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(streetAddress ? { streetAddress } : {}),
            ...(addressLocality ? { addressLocality } : {}),
            ...(addressRegion ? { addressRegion } : {}),
            ...(postalCode ? { postalCode } : {}),
            ...(profile.country ? { addressCountry: profile.country } : { addressCountry: 'US' }),
          },
        }
      : {}),
    ...(openingHoursSpecification.length ? { openingHoursSpecification } : {}),
    ...(emitRating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: aggregateRating!.averageRating,
            reviewCount: aggregateRating!.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    // No fabricated priceRange — we don't know the clinic's pricing, and the
    // project rule is no fake values (the hardcoded ratingValue was dropped for
    // the same reason). schema.org Dentist treats priceRange as optional.
  }

  return ld
}
