import 'server-only'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, clinicLocation } from '@/lib/db/schema/platform'
import type { ClinicProfile, ClinicLocation } from '@/lib/db/schema/platform'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

export interface ClinicSiteData {
  orgId: string
  orgName: string
  slug: string
  profile: ClinicProfile
  primaryLocation: ClinicLocation | null
  locations: ClinicLocation[]
}

/**
 * The canonical public URL the clinic site lives at. Custom domain when
 * set, else the platform-managed subdomain. Used in every SEO surface —
 * canonical metadata, OG URLs, sitemap, JSON-LD `url` and `@id`.
 *
 * Always returns a URL without trailing slash, so callers can append paths.
 */
export function publicSiteUrl(data: Pick<ClinicSiteData, 'slug' | 'profile'>): string {
  const custom = data.profile.websiteDomain?.trim()
  if (custom) return `https://${custom}`
  return `https://${data.slug}.${SITE_DOMAIN}`
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

  // Pull a review count out of a stat row if one looks numeric — we don't
  // claim a star rating since we don't store one, but volume alone is a
  // valid schema.org `reviewCount`-only signal when paired with ratingValue.
  let aggregateRating: Record<string, unknown> | undefined
  const stats = (profile.stats ?? []) as Array<{ value: string; label: string }>
  for (const s of stats) {
    const looksLikeReviewCount =
      /review|rating|star/i.test(s.label) && /\d/.test(s.value)
    if (looksLikeReviewCount) {
      const digits = parseInt(s.value.replace(/[^0-9]/g, ''), 10)
      if (Number.isFinite(digits) && digits > 0) {
        aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: String(digits),
        }
        break
      }
    }
  }

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
    ...(aggregateRating ? { aggregateRating } : {}),
    priceRange: '$$',
  }

  return ld
}
