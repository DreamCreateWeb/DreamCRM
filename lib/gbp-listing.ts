/**
 * GBP LISTING TRUTH (the onboarding overhaul, Phase A slice 1 —
 * docs/onboarding-overhaul.md).
 *
 * Pure + client-safe: does the clinic's Google Business Profile actually
 * point patients at their real website?
 *
 * Born from a real incident: two beta clinics, same product — one's GBP
 * "Website" button pointed at their DreamCRM site (steady traffic), the
 * other's pointed at a dead legacy site (zero traffic, ever), and nothing
 * in the product knew the difference. This module is the knowing.
 *
 * Design rules:
 *  - COMPARISON IS FORGIVING: scheme, www, trailing slash, query and hash
 *    are all noise — `http://www.foo.com/?utm_x=1` and `https://foo.com`
 *    are the same destination. Google itself rewrites/strips parameters in
 *    this field, so a strict compare would cry mismatch on our own URL.
 *  - THE TARGET WE WRITE IS TAGGED: the URL we ask Google to carry rides
 *    UTM params (`utm_medium=organic` keeps GA4-style attribution sane;
 *    `utm_campaign=gbp-listing` is OUR marker), which is what finally lets
 *    lead attribution tell "came from the Google profile" from generic
 *    search. classifyLeadChannel reads the campaign marker via
 *    isGbpTaggedAttribution below.
 *  - NULL IS "UNKNOWN", NEVER "BROKEN": a clinic with no snapshot (never
 *    synced, or the field wasn't on the wire) must read as unknown — filing
 *    a fix-it card on a guess would tell a practice something untrue about
 *    their own listing.
 */

/** What the hourly GBP sync stamps into clinic_profile.gbp_listing. */
export interface GbpListingSnapshot {
  /** The listing's Website button target, verbatim from Google. Null when
   *  the listing has none; undefined never survives parsing. */
  websiteUri: string | null
  /** Google Maps Place ID (feeds the review link + JSON-LD). */
  placeId: string | null
  /** Google's own "write a review" URL for the place. */
  reviewUrl: string | null
  /** Public Google Maps URL for the location. */
  mapsUri: string | null
  /** Voice of Merchant — verified + live on Google. Null when the sync
   *  couldn't tell (older payloads without the summary block). */
  isVerified: boolean | null
  /** Business name as Google shows it. */
  title: string | null
  /** ISO instant the snapshot was pulled. */
  fetchedAt: string | null
}

/** Defensive jsonb → snapshot. Unknown shapes come back all-null (unknown),
 *  never a throw — this reads a column the sync writes best-effort. */
export function parseGbpListingSnapshot(raw: unknown): GbpListingSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    websiteUri: str(o.websiteUri),
    placeId: str(o.placeId),
    reviewUrl: str(o.reviewUrl),
    mapsUri: str(o.mapsUri),
    isVerified: typeof o.isVerified === 'boolean' ? o.isVerified : null,
    title: str(o.title),
    fetchedAt: str(o.fetchedAt),
  }
}

/**
 * The UTM params the machine appends when IT sets the listing's website —
 * one home, because the writer (the executor) and the reader
 * (isGbpTaggedAttribution → the 'gbp' lead channel) must agree forever.
 * `utm_medium=organic` on purpose: the 2025 practitioner consensus pattern
 * that keeps GBP clicks inside "organic search" for GA4-style tools while
 * the campaign marker still isolates them for US.
 */
export const GBP_UTM_SOURCE = 'google'
export const GBP_UTM_MEDIUM = 'organic'
export const GBP_UTM_CAMPAIGN = 'gbp-listing'
export const GBP_UTM_CONTENT_WEBSITE = 'website-button'

/** Append the GBP tracking params to the clinic's site URL. Tolerates an
 *  existing query string; never double-appends (re-running on an already
 *  tagged URL is a no-op). */
export function buildListingWebsiteUrl(siteUrl: string): string {
  const base = siteUrl.trim().replace(/\/+$/, '')
  if (/[?&]utm_campaign=/i.test(base)) return base
  const sep = base.includes('?') ? '&' : '?'
  return (
    `${base}${sep}utm_source=${GBP_UTM_SOURCE}&utm_medium=${GBP_UTM_MEDIUM}` +
    `&utm_campaign=${GBP_UTM_CAMPAIGN}&utm_content=${GBP_UTM_CONTENT_WEBSITE}`
  )
}

/** Whether a captured attribution is OUR GBP tag (→ the 'gbp' lead channel).
 *  Keys on the campaign marker alone: Google sometimes strips params one at
 *  a time, and source/medium ('google'/'organic') are deliberately generic. */
export function isGbpTaggedAttribution(a: { utmCampaign?: string | null }): boolean {
  const c = (a.utmCampaign ?? '').trim().toLowerCase()
  return c === GBP_UTM_CAMPAIGN || c.startsWith('gbp-') || c === 'gbp'
}

/**
 * Reduce a URL to its comparable identity: lowercase host without www,
 * plus the path without a trailing slash. Scheme, port, query, and hash
 * are dropped (see the forgiving-comparison rule above). Returns null for
 * anything unparseable — an unreadable listing value must become "unknown",
 * not a false mismatch.
 */
export function comparableUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  // Any non-web scheme (mailto:, tel:, ftp://…) is not a website value —
  // and without this guard `mailto:x@y.com` would parse as host "y.com".
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null
  let u: URL
  try {
    u = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (!host) return null
  const path = u.pathname.replace(/\/+$/, '')
  return `${host}${path}`
}

/**
 * Every URL identity the clinic's site legitimately lives at. The listing
 * pointing at ANY of these is correct — a clinic that connected a custom
 * domain but whose listing still carries the subdomain hasn't lost a
 * patient to it (the subdomain keeps serving), so it is not a mismatch.
 * Deliberately env-flag independent: the path-based form is always
 * accepted even when subdomain routing is on, and vice versa.
 */
export function acceptableSiteUrls(opts: {
  slug: string
  siteDomain: string
  customDomain?: string | null
}): string[] {
  const out: string[] = []
  const custom = opts.customDomain?.trim()
  if (custom) out.push(`https://${custom}`)
  out.push(`https://${opts.slug}.${opts.siteDomain}`)
  out.push(`https://${opts.siteDomain}/site/${opts.slug}`)
  return out
}

/** Whether the listing's website target is one of ours. */
export function listingPointsAtUs(
  listingUri: string | null | undefined,
  acceptable: string[],
): boolean {
  const got = comparableUrl(listingUri)
  if (!got) return false
  return acceptable.some((a) => comparableUrl(a) === got)
}

/**
 * The listing-website verdict:
 *  - 'unknown'  — no snapshot yet, or the value was unreadable. Say nothing.
 *  - 'missing'  — Google confirmed the listing has NO website link at all.
 *  - 'mismatch' — the button points somewhere that isn't the clinic's site.
 *  - 'ok'       — the button points at the clinic's site (any accepted form).
 */
export type ListingWebsiteState = 'unknown' | 'missing' | 'mismatch' | 'ok'

export function listingWebsiteState(
  snapshot: GbpListingSnapshot | null,
  acceptable: string[],
): ListingWebsiteState {
  if (!snapshot || !snapshot.fetchedAt) return 'unknown'
  if (snapshot.websiteUri == null) return 'missing'
  // A stored value that can't parse as a URL is indistinguishable from a
  // wrong one to a patient tapping the button — but to US it means we could
  // not read what Google holds, and a fix-it card built on an unreadable
  // value would show the clinic garbage. Unknown, let the next sync retry.
  if (comparableUrl(snapshot.websiteUri) == null) return 'unknown'
  return listingPointsAtUs(snapshot.websiteUri, acceptable) ? 'ok' : 'mismatch'
}
