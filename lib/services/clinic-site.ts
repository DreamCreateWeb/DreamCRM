import 'server-only'
import { headers } from 'next/headers'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, clinicLocation } from '@/lib/db/schema/platform'
import type { ClinicProfile, ClinicLocation } from '@/lib/db/schema/platform'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/** Canonical base URL of the authenticated app (sign-in, dashboard, portal).
 *  Used for cross-domain links FROM a clinic public site (which may live on a
 *  subdomain or custom domain) back INTO the app. Always absolute. */
export function appBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  return env || `https://www.${SITE_DOMAIN}`
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
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.websiteDomain, domain))
    .limit(1)

  if (!profile) return null

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, profile.organizationId))
    .limit(1)

  if (!org) return null

  return loadSite(org.id, org.slug, org.name)
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
 * Build a schema.org `Dentist` JSON-LD object for the clinic homepage.
 * Google uses this for the Knowledge Panel + rich results; Bing + AI
 * search overlays read it too. Includes hours when set, address, phone,
 * aggregate rating when stats include a review count.
 */
export function clinicJsonLd(data: ClinicSiteData): Record<string, unknown> {
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

  // We deliberately do NOT emit an aggregateRating. There is no real star
  // rating stored anywhere — the Reviews module tracks review *requests*, not
  // a published aggregate — and schema.org / Google require a `ratingValue`
  // for a valid AggregateRating. Emitting a fabricated value (this code used
  // to hardcode `ratingValue: '4.9'`) is exactly the fake-review violation the
  // Reviews module is built to avoid (FTC 2024 Fake Reviews Rule + Google's
  // review-snippet guidelines). Real star rich-results arrive with the Google
  // Business Profile integration (roadmap), sourced from actual review data.

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    '@id': `${url}/#dentist`,
    name,
    url,
    ...(description ? { description } : {}),
    ...(phone ? { telephone: phone } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.logoUrl ? { logo: profile.logoUrl, image: profile.logoUrl } : {}),
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
    priceRange: '$$',
  }

  return ld
}
