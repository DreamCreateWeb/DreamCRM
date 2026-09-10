import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { eq, and, asc, desc, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, clinicLocation } from '@/lib/db/schema/platform'
import type { ClinicProfile, ClinicLocation } from '@/lib/db/schema/platform'
import { expandServedHosts } from '@/lib/services/custom-domain'
import { canEditClinic } from '@/lib/clinic-site-edit'
import { mergeWebsiteDraft, websiteDraftKeys } from '@/lib/website-draft'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/** Canonical base URL of the authenticated app (sign-in, dashboard, portal).
 *  Used for cross-domain links FROM a clinic public site (which may live on a
 *  subdomain or custom domain) back INTO the app. Always absolute. */
// Pure env-derived URL helpers — relocated to the client-safe helpers module
// so template renderers can use them without a value import from this
// server-only service. Re-exported here for the existing server callers.
export { appBaseUrl, clinicPortalSignInUrl } from '@/lib/clinic-site-helpers'

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
export interface ClinicTheme {
  orgId: string | null
  brand: string | null
  template: string | null
  /** True when THIS viewer is a verified editor with staged (unpublished)
   *  edits — the layout mounts the "you're seeing your draft" banner. */
  hasEditorDraft: boolean
}

/**
 * The PUBLISHED palette + template. No session is read here.
 *
 * The sibling of `loadPublishedSite`, and split for the same reason: the theme
 * loader carried the identical Draft→Publish overlay, and it runs on EVERY
 * public clinic page (`app/site/[slug]/layout.tsx`) and decides which template
 * renders the site (`lib/site-templates/resolve.ts`). Caching it as it stood
 * would have put a clinic's unpublished brand colour and design on their live
 * public site — quieter than leaking page copy, and just as public.
 *
 * `hasEditorDraft` is deliberately NOT part of this return. It means "this
 * viewer is an editor with staged edits", which is a fact about the viewer
 * rather than about the clinic, so it cannot exist on the published side at
 * all. `websiteDraft` rides along because the overlay above needs it; stripping
 * it belongs with the durable cache, where it is one change across both
 * loaders rather than two.
 */
async function loadPublishedTheme(slug: string): Promise<{
  /** Non-null by construction — a null return means "no clinic for this slug".
   *  Typed narrowly so the orgId handed to `canEditClinic` below needs no
   *  non-null assertion: an authorization argument is the last place to put
   *  one. */
  orgId: string
  /** Real column names, not the public `brand` alias — `mergeWebsiteDraft`
   *  keys off `WEBSITE_DRAFT_COLUMNS`, so the shape handed to it has to speak
   *  the schema's vocabulary. */
  brandColor: string | null
  template: string | null
  websiteDraft: unknown
} | null> {
  const [row] = await db
    .select({
      id: organization.id,
      type: organization.type,
      brandColor: clinicProfile.brandColor,
      template: clinicProfile.template,
      websiteDraft: clinicProfile.websiteDraft,
    })
    .from(organization)
    .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
    .where(eq(organization.slug, slug))
    .limit(1)

  if (!row || row.type !== 'clinic') return null

  return {
    orgId: row.id,
    brandColor: row.brandColor ?? null,
    template: row.template ?? null,
    websiteDraft: row.websiteDraft,
  }
}

export const getClinicThemeBySlug = cache(async (slug: string): Promise<ClinicTheme> => {
  const published = await loadPublishedTheme(slug)
  if (!published) return { orgId: null, brand: null, template: null, hasEditorDraft: false }

  // Draft→Publish overlay for the palette + template — same gate as loadSite's
  // content overlay, so a staged brand color / design shows for the editor
  // (and only the editor) on every page. Applied OUTSIDE the published read,
  // so the half that can be cached never contains one viewer's answer.
  const draftKeys = websiteDraftKeys(published.websiteDraft)
  if (draftKeys.length === 0 || !(await canEditClinic(published.orgId))) {
    return {
      orgId: published.orgId,
      brand: published.brandColor,
      template: published.template,
      hasEditorDraft: false,
    }
  }

  // Routed through `mergeWebsiteDraft` rather than re-implementing its rule.
  // The rule is not only "override the keys the draft carries" — it is also
  // `?? null`, so a field the clinic CLEARED in their draft reads as cleared
  // rather than falling back to the published value. Open-coding that here
  // made two homes for one rule, and the failure it buys is quiet: change the
  // null semantics in one place and a clinic previewing their draft gets the
  // colour under one rule and the tagline under another — two halves of a
  // single preview disagreeing.
  const merged = mergeWebsiteDraft(
    { brandColor: published.brandColor, template: published.template },
    published.websiteDraft,
  )
  return {
    orgId: published.orgId,
    brand: merged.brandColor ?? null,
    template: merged.template ?? null,
    hasEditorDraft: true,
  }
})

/**
 * The full public-site payload for a slug, deduped WITHIN a request.
 *
 * Every public clinic page loads this twice — once in `generateMetadata`, once
 * in the page body — because Next calls those separately and an uncached async
 * function has no memory between them. That doubled the org + profile +
 * locations reads on every hit of the slowest, lowest-throughput surface in
 * the product (`docs/LOAD-SANITY.md`: `/site/[slug]` saturates at concurrency
 * 8, and 8 -> 25 buys no throughput — the signature of a queue, not capacity).
 * `getClinicOrgIdBySlug` and `getClinicThemeBySlug` above were already wrapped
 * for exactly this reason; this loader was the one that was not.
 *
 * PER-REQUEST ONLY, and that is load-bearing rather than incidental.
 * `loadSite` merges the clinic's unpublished draft for a verified editor, so
 * its result depends on WHO is asking. React's `cache()` is scoped to a single
 * request, where the session is fixed, so memoizing is safe. A cross-request
 * cache here would hand one viewer's render to the next — and in the direction
 * that matters, that is a clinic's unpublished words on their live public site.
 *
 * Anyone adding a durable cache must FIRST split the published read out of
 * `loadSite` and apply the draft overlay outside it.
 * `tests/clinic-site/site-load-dedupe.test.ts` carries the reasoning.
 *
 * One new rule comes with the memo: every caller in a request now shares ONE
 * `ClinicSiteData` object. Sorting `data.locations` in place, or assigning to
 * a `data.profile` field, used to be private to whichever pass did it and now
 * leaks into the other. Copy before you mutate.
 */
export const getClinicSiteBySlug = cache(async (slug: string): Promise<ClinicSiteData | null> => {
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)

  if (!org || org.type !== 'clinic') return null

  return loadSite(org.id, org.slug, org.name)
})

/**
 * The custom-domain twin of `getClinicSiteBySlug`, wrapped the same way so the
 * two loaders cannot drift apart.
 *
 * It has NO production callers today: `middleware.ts:335,356` rewrites custom
 * domains to `/site/<slug>`, so that traffic goes through the slug loader like
 * everything else, and only a test references this one. The wrapper is
 * therefore unexercised rather than load-bearing — said plainly because the
 * first draft of this comment claimed a metadata-plus-body double-load that no
 * existing page performs.
 *
 * If it ever gains a caller, hoist the `trim().toLowerCase()` ABOVE the
 * `cache()` boundary: normalizing inside the memoized function means the key
 * is the raw argument, so `Foo.com` and `foo.com` would be two entries for one
 * clinic.
 */
export const getClinicSiteByDomain = cache(
  async (domain: string): Promise<ClinicSiteData | null> => {
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
  },
)

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
    // Deterministic order so, if a legacy duplicate host ever exists (pre-dates
    // the requestCustomDomain ownership guard + the unique index), routing is
    // STABLE first-write-wins rather than nondeterministic last-write-wins — a
    // duplicate can never silently flip a live domain to a different clinic.
    .orderBy(asc(clinicProfile.organizationId))

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

/**
 * The PUBLISHED site — what a visitor sees. No session is read here, and that
 * is the entire point of the function existing separately.
 *
 * Everything on this side of the line depends only on `orgId`, so it is the
 * part that can eventually be cached across requests and invalidated on
 * Draft→Publish. The viewer-dependent overlay lives in `loadSite` below,
 * OUTSIDE it. Keeping the two apart is what makes a durable cache safe to add:
 * caching a function that has already merged someone's draft would serve that
 * draft to the next visitor, which is a clinic's unpublished words on their
 * own live public site.
 *
 * The split is deliberately structural-only for now — nothing is cached yet.
 * `tests/clinic-site/site-load-dedupe.test.ts` fails if `unstable_cache`
 * appears in this file, and that assertion moves onto THIS function (not
 * `loadSite`) when the durable cache lands.
 */
async function loadPublishedSite(
  orgId: string,
  slug: string,
  orgName: string,
): Promise<ClinicSiteData | null> {
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

/**
 * The published site, plus the Draft→Publish overlay when — and only when —
 * the viewer is a verified editor of THIS clinic.
 *
 * A verified editor sees their staged (unpublished) edits merged over the live
 * columns everywhere on the site, including generateMetadata / OG / JSON-LD,
 * because every render flows through this one load. `canEditClinic` re-verifies
 * the session on every request, so a visitor can never see a draft; and the
 * session lookup is only paid when a draft actually exists.
 *
 * NOBODY MAY MUTATE THE RETURNED PAYLOAD — not the merged one, and not the
 * published one. An earlier version of this note said only that the merge
 * returns a new profile rather than mutating, which is true and misses the
 * path that matters: with no draft, `loadSite` returns `published` UNCHANGED,
 * and that is what essentially all traffic gets. So the object callers hold is
 * usually the one `loadPublishedSite` built — the very object a durable cache
 * would hand to the next request. An in-place `sort()` on `.locations` is a
 * private mistake today and a cross-request corruption tomorrow.
 *
 * Slice 2 freezes the published payload so that becomes a throw in dev rather
 * than documentation nobody reads.
 */
async function loadSite(orgId: string, slug: string, orgName: string): Promise<ClinicSiteData | null> {
  const published = await loadPublishedSite(orgId, slug, orgName)
  if (!published) return null

  const draftKeys = websiteDraftKeys(published.profile.websiteDraft)
  if (draftKeys.length === 0 || !(await canEditClinic(orgId))) return published

  return {
    ...published,
    profile: mergeWebsiteDraft(published.profile, published.profile.websiteDraft),
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
