import 'server-only'
import { connectPlatformSlug, type ZernioPlatform } from '@/lib/types/zernio'

/**
 * Lazy Zernio API client. Mirrors `lib/stripe.ts`'s "don't read the env at
 * module-eval time" discipline so `next build` runs without `ZERNIO_API_KEY`:
 * the key is read on the FIRST call to `zernioFetch`, never at import.
 *
 * Base: https://zernio.com/api/v1   Auth: `Authorization: Bearer ${key}`.
 * Our single platform key owns "profiles" (one per clinic org) → each holds
 * connected "accounts" (the clinic's GBP / IG / FB / …). Per-clinic scoping is
 * by `profileId` / `accountId`, never a per-clinic key.
 */

const BASE_URL = 'https://zernio.com/api/v1'

function getApiKey(): string {
  const key = process.env.ZERNIO_API_KEY
  if (!key) throw new Error('ZERNIO_API_KEY is not set')
  return key
}

/**
 * Low-level fetch against the Zernio REST API. Prefixes the base URL, sets the
 * Bearer header, parses JSON, and on a non-2xx response throws an Error that
 * includes the status + (truncated) body so callers can surface a useful
 * message. `path` should start with `/` (e.g. `/profiles`).
 */
export async function zernioFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const key = getApiKey()
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    // Zernio is a 3rd-party API — never cache through Next's fetch cache.
    cache: 'no-store',
  })

  if (!res.ok) {
    let body = ''
    try {
      body = await res.text()
    } catch {
      /* ignore */
    }
    const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body
    throw new Error(`Zernio API ${res.status} ${res.statusText} for ${path}${snippet ? `: ${snippet}` : ''}`)
  }

  // 204 No Content (some DELETEs) → return undefined-as-T.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ── Typed wrappers ──────────────────────────────────────────────────────────

/** Raw profile shape from `GET /profiles` / the create wrapper. */
export interface ZernioRawProfile {
  _id: string
  userId?: string
  name?: string
  description?: string
  color?: string
  isDefault?: boolean
}

/** `GET /profiles` → `{ profiles: [...] }`. */
export async function listProfiles(): Promise<ZernioRawProfile[]> {
  const data = await zernioFetch<{ profiles?: ZernioRawProfile[] }>('/profiles')
  return data.profiles ?? []
}

/** `POST /profiles` → `{ message, profile: { _id, ... } }` (a create wrapper —
 *  NOT the bare profile). Returns the created profile. */
export async function createProfile(name: string, opts?: { description?: string; color?: string }): Promise<ZernioRawProfile> {
  const data = await zernioFetch<{ profile?: ZernioRawProfile }>('/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, ...(opts?.description ? { description: opts.description } : {}), ...(opts?.color ? { color: opts.color } : {}) }),
  })
  if (!data.profile?._id) throw new Error('Zernio createProfile returned no profile id')
  return data.profile
}

/** `GET /connect/{platform}?profileId=…&redirect_url=…` → `{ authUrl, state }`.
 *  Standard (hosted) mode: Zernio shows the account picker, then redirects to
 *  `redirect_url` with `?connected={platform}&profileId=X&accountId=Y&username=Z`
 *  appended. `redirectUrl` is OPTIONAL — without it Zernio returns the user to
 *  its own dashboard (which is why the UI also polls on focus). */
export async function getConnectUrl(
  platform: ZernioPlatform,
  profileId: string,
  redirectUrl?: string,
): Promise<{ authUrl: string; state?: string }> {
  const qs = new URLSearchParams({ profileId })
  if (redirectUrl) qs.set('redirect_url', redirectUrl)
  const slug = connectPlatformSlug(platform)
  const data = await zernioFetch<{ authUrl?: string; state?: string }>(
    `/connect/${slug}?${qs.toString()}`,
  )
  if (!data.authUrl) throw new Error('Zernio getConnectUrl returned no authUrl')
  return { authUrl: data.authUrl, state: data.state }
}

/** Raw SocialAccount shape from `GET /accounts`. `profileId` may be a string OR
 *  an embedded Profile object. */
export interface ZernioRawAccount {
  _id: string
  platform: string
  profileId: string | { _id: string }
  username?: string | null
  displayName?: string | null
  profilePicture?: string | null
  profileUrl?: string | null
  isActive?: boolean
}

/** `GET /accounts` → `{ accounts: [...], hasAnalyticsAccess }`. Optional
 *  `profileId` filter scopes to one profile. */
export async function listAccounts(opts?: { profileId?: string }): Promise<{
  accounts: ZernioRawAccount[]
  hasAnalyticsAccess: boolean
}> {
  const qs = opts?.profileId ? `?profileId=${encodeURIComponent(opts.profileId)}` : ''
  const data = await zernioFetch<{ accounts?: ZernioRawAccount[]; hasAnalyticsAccess?: boolean }>(
    `/accounts${qs}`,
  )
  return { accounts: data.accounts ?? [], hasAnalyticsAccess: Boolean(data.hasAnalyticsAccess) }
}

/** `DELETE /accounts/{accountId}` — disconnect a single account at Zernio. The
 *  service layer treats this as best-effort (always drops our local rows even
 *  if Zernio errors). */
export async function deleteAccount(accountId: string): Promise<void> {
  await zernioFetch(`/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' })
}

/** True when `ZERNIO_API_KEY` is present (so the UI can render an honest
 *  "not configured on this instance" state instead of throwing). */
export function zernioConfigured(): boolean {
  return Boolean(process.env.ZERNIO_API_KEY)
}

// ── Google Business reviews ───────────────────────────────────────────────────
//
// Confirmed against the Zernio docs (llms.txt + the OpenAPI probe, 2026-06-15):
//   GET    /v1/google-business/gmb-reviews                  → list a GBP account's
//          reviews (ratings, comments, owner replies), paginated by pageToken.
//   POST   /v1/google-business/gmb-reviews/{reviewId}/reply → post/overwrite the
//          owner reply (PUT semantics — a second call overwrites; body `comment`).
//   DELETE /v1/google-business/gmb-reviews/{reviewId}/reply → remove the reply.
//
// We parse DEFENSIVELY. The review object follows Google's GBP API shape, which
// historically used enum star ratings ("FIVE"), while Zernio's newer schema
// surfaces a numeric `starRating` (+ a webhook `rating`). Likewise the comment
// can arrive as `comment` or `text`, the reviewer as `reviewer.{displayName,
// profilePhotoUrl}` OR `reviewer.{name,profileImage}`, and the reply as
// `reviewReply.{comment,updateTime}` OR `reply.{text,createdAt,updatedAt}`. The
// normalizer below tolerates every variant so a docs/version drift can't strand
// us. Star rating always lands as an integer 1–5 (or null when unreadable).

/** A normalized Google Business review, narrowed to the fields we persist +
 *  render. Star rating is an integer 1–5 (null when the platform omitted one —
 *  Google allows rating-only AND, rarely, comment-only states). */
export interface GoogleReview {
  /** Google's stable review id (the `id`/`reviewId`/`name` from the payload). */
  id: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  /** Integer 1–5, or null when unreadable/absent. */
  starRating: number | null
  comment: string | null
  /** Review creation time (ISO/RFC-3339 string as returned), null if absent. */
  createTime: string | null
  updateTime: string | null
  /** The clinic's existing owner reply text, null when none. */
  replyComment: string | null
  replyUpdateTime: string | null
}

const STAR_ENUM: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

/**
 * Normalize a star rating that may arrive as a number (1–5, or 0/"unspecified"),
 * a numeric string, or a Google enum string ("FIVE"). Returns an integer 1–5 or
 * null when it can't be read as a real rating. `STAR_UNSPECIFIED`/0 → null.
 */
export function normalizeStarRating(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    const n = Math.round(raw)
    return n >= 1 && n <= 5 ? n : null
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const upper = trimmed.toUpperCase()
    if (upper in STAR_ENUM) return STAR_ENUM[upper]
    const n = Number(trimmed)
    if (Number.isFinite(n)) return normalizeStarRating(n)
    return null
  }
  return null
}

/** Raw review shape — every variant field optional so parsing never throws. */
interface ZernioRawReview {
  id?: string
  reviewId?: string
  name?: string
  starRating?: number | string
  rating?: number | string
  comment?: string | null
  text?: string | null
  createTime?: string
  createdAt?: string
  updateTime?: string
  updatedAt?: string
  reviewer?: {
    displayName?: string | null
    name?: string | null
    profilePhotoUrl?: string | null
    profileImage?: string | null
  } | null
  reviewReply?: { comment?: string | null; text?: string | null; updateTime?: string; updatedAt?: string; createdAt?: string } | null
  reply?: { comment?: string | null; text?: string | null; updateTime?: string; updatedAt?: string; createdAt?: string } | null
}

function normalizeReview(raw: ZernioRawReview): GoogleReview | null {
  const id = raw.id ?? raw.reviewId ?? raw.name
  if (!id) return null // a review with no id can't be upserted idempotently
  const reviewer = raw.reviewer ?? null
  const replyObj = raw.reviewReply ?? raw.reply ?? null
  const replyComment = replyObj ? (replyObj.comment ?? replyObj.text ?? null) : null
  return {
    id: String(id),
    reviewerName: reviewer?.displayName ?? reviewer?.name ?? null,
    reviewerPhotoUrl: reviewer?.profilePhotoUrl ?? reviewer?.profileImage ?? null,
    starRating: normalizeStarRating(raw.starRating ?? raw.rating),
    comment: raw.comment ?? raw.text ?? null,
    createTime: raw.createTime ?? raw.createdAt ?? null,
    updateTime: raw.updateTime ?? raw.updatedAt ?? null,
    replyComment: replyComment || null,
    replyUpdateTime: replyObj ? (replyObj.updateTime ?? replyObj.updatedAt ?? replyObj.createdAt ?? null) : null,
  }
}

/**
 * `GET /v1/google-business/gmb-reviews?accountId=…[&locationId=…][&pageToken=…]`.
 * Returns every readable review for the account on this page plus the next page
 * token (null when none). The response array key varies between docs versions
 * (`reviews` / `data` / a bare array), so we read defensively.
 */
export async function listGoogleReviews(opts: {
  accountId: string
  locationId?: string
  pageToken?: string
  pageSize?: number
}): Promise<{ reviews: GoogleReview[]; nextPageToken: string | null }> {
  const qs = new URLSearchParams({ accountId: opts.accountId })
  if (opts.locationId) qs.set('locationId', opts.locationId)
  if (opts.pageToken) qs.set('pageToken', opts.pageToken)
  if (opts.pageSize) qs.set('pageSize', String(opts.pageSize))
  const data = await zernioFetch<
    | { reviews?: ZernioRawReview[]; data?: ZernioRawReview[]; nextPageToken?: string | null }
    | ZernioRawReview[]
  >(`/google-business/gmb-reviews?${qs.toString()}`)
  const rawList = Array.isArray(data) ? data : (data.reviews ?? data.data ?? [])
  const reviews = rawList.map(normalizeReview).filter((r): r is GoogleReview => r !== null)
  const nextPageToken = Array.isArray(data) ? null : (data.nextPageToken ?? null)
  return { reviews, nextPageToken }
}

/**
 * `POST /v1/google-business/gmb-reviews/{reviewId}/reply` — post or overwrite the
 * owner reply (PUT semantics on Google's side). Body field is `comment`. The
 * account is identified by `accountId` (query) — same param the list endpoint
 * takes, so the reply lands against the account the reviews were pulled from.
 */
export async function replyToGoogleReview(opts: {
  accountId: string
  reviewId: string
  comment: string
}): Promise<void> {
  const qs = new URLSearchParams({ accountId: opts.accountId })
  await zernioFetch(`/google-business/gmb-reviews/${encodeURIComponent(opts.reviewId)}/reply?${qs.toString()}`, {
    method: 'POST',
    body: JSON.stringify({ comment: opts.comment }),
  })
}

/**
 * `DELETE /v1/google-business/gmb-reviews/{reviewId}/reply` — remove the owner
 * reply (the review itself stays). Treated as best-effort by the service layer.
 */
export async function deleteGoogleReviewReply(opts: {
  accountId: string
  reviewId: string
}): Promise<void> {
  const qs = new URLSearchParams({ accountId: opts.accountId })
  await zernioFetch(`/google-business/gmb-reviews/${encodeURIComponent(opts.reviewId)}/reply?${qs.toString()}`, {
    method: 'DELETE',
  })
}

// ── Google Business location details (hours / address / phone / categories) ───
//
// Confirmed against the Zernio docs (llms.txt + the OpenAPI probe, 2026-06-15).
// The rendered `.mdx` pages are JS-only, so per-field detail came from the
// llms.txt endpoint descriptions ("Returns detailed GBP location info — hours,
// description, phone, website, categories, services") + the raw probe. The
// endpoint path itself read ambiguously across probes (the named-resource form
// `/google-business/get-google-business-location-details`, a flat
// `/google-business/location-details`, and an account-scoped
// `/accounts/{accountId}/google-business-location-details`); we follow the
// SHIPPED reviews precedent (the flat `/google-business/...` namespace with
// `accountId` as a query param — proven to work for `gmb-reviews`) and name the
// resource `location-details` / `media`. Every field is parsed DEFENSIVELY so a
// docs/version drift can't strand us; the underlying payload follows Google's
// Business Profile `locations.get` shape:
//   regularHours.periods[] = { openDay, openTime, closeDay, closeTime }
//     — openDay/closeDay are Google day enums (MONDAY…SUNDAY); openTime/
//       closeTime are "HH:MM" 24-hour strings (Google's newer schema; the older
//       schema nested `{ hours, minutes }` — we tolerate both).
//   storefrontAddress = { addressLines[], locality, administrativeArea,
//                         postalCode, regionCode }
//   phoneNumbers.primaryPhone = "(512) 555-0100"
//   categories.primaryCategory.displayName + additionalCategories[]
// Some integrations wrap the GBP object under `{ location: {...} }` or
// `{ data: {...} }`; the normalizer reaches through either.

/** Google Business day enum → our `clinic_profile.hours` day key. */
const GBP_DAY_TO_KEY: Record<string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
  MONDAY: 'mon',
  TUESDAY: 'tue',
  WEDNESDAY: 'wed',
  THURSDAY: 'thu',
  FRIDAY: 'fri',
  SATURDAY: 'sat',
  SUNDAY: 'sun',
}

/** A single open/close period as Google returns it (every field optional). */
interface GbpRawPeriod {
  openDay?: string
  closeDay?: string
  // Newer schema: "HH:MM" strings. Older schema: { hours, minutes } objects.
  openTime?: string | { hours?: number; minutes?: number }
  closeTime?: string | { hours?: number; minutes?: number }
}

/** Raw location-details payload — Google `locations.get` shape, all optional. */
interface GbpRawLocation {
  regularHours?: { periods?: GbpRawPeriod[] } | null
  storefrontAddress?: {
    addressLines?: string[] | null
    locality?: string | null
    administrativeArea?: string | null
    postalCode?: string | null
    regionCode?: string | null
  } | null
  phoneNumbers?: { primaryPhone?: string | null } | null
  // Older schema surfaced a bare `primaryPhone` at the top level.
  primaryPhone?: string | null
  categories?: {
    primaryCategory?: { displayName?: string | null } | null
    additionalCategories?: Array<{ displayName?: string | null }> | null
  } | null
}

/** One normalized open/close period in our `HH:MM` 24-hour shape. */
export interface GooglePeriod {
  /** Our day key ('mon'…'sun'), null when the enum was unreadable. */
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | null
  /** "HH:MM" 24-hour, or null when unparseable. */
  open: string | null
  /** "HH:MM" 24-hour, or null when unparseable. */
  close: string | null
}

/** A normalized GBP location, narrowed to what we sync into clinic_profile. */
export interface GoogleLocation {
  /** Open/close periods in our day-key + HH:MM shape (filtered to readable). */
  periods: GooglePeriod[]
  addressLines: string[]
  city: string | null
  /** Google's `administrativeArea` (a US state like "TX"). */
  state: string | null
  postalCode: string | null
  /** Google's `regionCode` (ISO country, e.g. "US"). */
  country: string | null
  phone: string | null
  /** Primary + additional category display names (for future SEO/metadata). */
  categories: string[]
}

/**
 * Normalize a Google open/close time that may be an "HH:MM" string (newer
 * schema), an `{ hours, minutes }` object (older schema), or "24:00" (Google's
 * end-of-day marker → "23:59" so it stays a valid HH:MM and our `open < close`
 * checks hold). Returns "HH:MM" or null when unreadable.
 */
export function normalizeGbpTime(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'object') {
    const o = raw as { hours?: number; minutes?: number }
    const h = typeof o.hours === 'number' && Number.isFinite(o.hours) ? o.hours : 0
    const m = typeof o.minutes === 'number' && Number.isFinite(o.minutes) ? o.minutes : 0
    if (h < 0 || h > 24 || m < 0 || m > 59) return null
    if (h === 24) return '23:59'
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    // Accept "9:00", "09:00", "0900", "24:00".
    const colon = /^(\d{1,2}):([0-5]\d)$/.exec(s)
    const compact = /^(\d{2})([0-5]\d)$/.exec(s)
    const m = colon ?? compact
    if (!m) return null
    const h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    if (h < 0 || h > 24 || min < 0 || min > 59) return null
    if (h === 24) return '23:59'
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  return null
}

/** Reach through `{ location }` / `{ data }` wrappers to the bare GBP object. */
function unwrapLocation(data: unknown): GbpRawLocation {
  if (!data || typeof data !== 'object') return {}
  const o = data as Record<string, unknown>
  if (o.location && typeof o.location === 'object') return o.location as GbpRawLocation
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) return o.data as GbpRawLocation
  return o as GbpRawLocation
}

function normalizeLocation(raw: GbpRawLocation): GoogleLocation {
  const periods: GooglePeriod[] = []
  for (const p of raw.regularHours?.periods ?? []) {
    const day = p.openDay ? (GBP_DAY_TO_KEY[p.openDay.toUpperCase()] ?? null) : null
    periods.push({
      day,
      open: normalizeGbpTime(p.openTime),
      close: normalizeGbpTime(p.closeTime),
    })
  }
  const addr = raw.storefrontAddress ?? null
  const categories: string[] = []
  const primary = raw.categories?.primaryCategory?.displayName
  if (primary) categories.push(primary)
  for (const c of raw.categories?.additionalCategories ?? []) {
    if (c?.displayName) categories.push(c.displayName)
  }
  return {
    periods,
    addressLines: Array.isArray(addr?.addressLines)
      ? addr!.addressLines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
      : [],
    city: addr?.locality?.trim() || null,
    state: addr?.administrativeArea?.trim() || null,
    postalCode: addr?.postalCode?.trim() || null,
    country: addr?.regionCode?.trim() || null,
    phone: (raw.phoneNumbers?.primaryPhone ?? raw.primaryPhone)?.trim() || null,
    categories,
  }
}

/**
 * `GET /v1/google-business/location-details?accountId=…[&locationId=…]` — the
 * clinic's verified Google Business Profile location: regular hours, storefront
 * address, primary phone, and categories. `locationId` is optional (Zernio uses
 * the account's selected location when omitted). Parsed defensively; throws on
 * a non-2xx (the service layer catches and stays best-effort).
 */
export async function getGoogleBusinessLocation(opts: {
  accountId: string
  locationId?: string
}): Promise<GoogleLocation> {
  const qs = new URLSearchParams({ accountId: opts.accountId })
  if (opts.locationId) qs.set('locationId', opts.locationId)
  const data = await zernioFetch<unknown>(`/google-business/location-details?${qs.toString()}`)
  return normalizeLocation(unwrapLocation(data))
}

// ── Google Business media (photos) ────────────────────────────────────────────
//
// `GET /v1/google-business/media?accountId=…[&locationId=…]` — the location's
// media items (photos). The GBP media item shape carries a `googleUrl` (a
// usable image URL) and/or a `sourceUrl` (the original uploaded URL), plus a
// `mediaFormat` ('PHOTO' | 'VIDEO') and a `locationAssociation.category` (e.g.
// 'EXTERIOR' / 'INTERIOR' / 'PROFILE'). We keep only PHOTO items and prefer
// `googleUrl`, falling back to `sourceUrl`. Response array key tolerated as
// `mediaItems` / `media` / `data` / a bare array.

interface GbpRawMediaItem {
  googleUrl?: string | null
  sourceUrl?: string | null
  thumbnailUrl?: string | null
  mediaFormat?: string | null
  locationAssociation?: { category?: string | null } | null
  category?: string | null
}

/** A normalized Google Business photo. */
export interface GooglePhoto {
  /** A usable image URL (googleUrl preferred, else sourceUrl). */
  url: string
  /** The original uploaded URL when distinct (kept for provenance). */
  sourceUrl: string | null
  /** GBP association category ('EXTERIOR' / 'INTERIOR' / …), null when absent. */
  category: string | null
}

function normalizeMediaItem(raw: GbpRawMediaItem): GooglePhoto | null {
  // Skip non-photos (e.g. VIDEO) when the format is declared.
  if (raw.mediaFormat && raw.mediaFormat.toUpperCase() !== 'PHOTO') return null
  const url = (raw.googleUrl ?? raw.sourceUrl ?? raw.thumbnailUrl ?? '').trim()
  if (!url) return null
  const sourceUrl = raw.sourceUrl?.trim()
  return {
    url,
    sourceUrl: sourceUrl && sourceUrl !== url ? sourceUrl : null,
    category: (raw.locationAssociation?.category ?? raw.category)?.trim() || null,
  }
}

/**
 * `GET /v1/google-business/media?accountId=…[&locationId=…]` — the photos on the
 * clinic's Google Business Profile. Returns usable image URLs (PHOTO items
 * only). Parsed defensively; throws on a non-2xx.
 */
export async function listGoogleBusinessMedia(opts: {
  accountId: string
  locationId?: string
}): Promise<GooglePhoto[]> {
  const qs = new URLSearchParams({ accountId: opts.accountId })
  if (opts.locationId) qs.set('locationId', opts.locationId)
  const data = await zernioFetch<
    | { mediaItems?: GbpRawMediaItem[]; media?: GbpRawMediaItem[]; data?: GbpRawMediaItem[] }
    | GbpRawMediaItem[]
  >(`/google-business/media?${qs.toString()}`)
  const rawList = Array.isArray(data) ? data : (data.mediaItems ?? data.media ?? data.data ?? [])
  return rawList.map(normalizeMediaItem).filter((p): p is GooglePhoto => p !== null)
}

// ── Google Business performance (local metrics) ───────────────────────────────
//
// Confirmed against the Zernio docs (llms-full.txt + the OpenAPI probe,
// 2026-06-15):
//   GET /v1/analytics/googlebusiness/performance
//     ?accountId=…[&metrics=CSV][&startDate=YYYY-MM-DD][&endDate=YYYY-MM-DD]
//       → daily performance for the connected GBP location. Defaults: startDate
//         = 30 days ago, endDate = today. Data lags 2-3 days; max 18 months back.
//       Response: { success, accountId, platform, dateRange, dataDelay,
//         metrics: { <METRIC_KEY>: { total, values:[…] } } } — each metric
//         carries a pre-summed `total` PLUS a daily series.
//   GET /v1/analytics/googlebusiness/search-keywords
//     ?accountId=…[&startMonth=YYYY-MM][&endMonth=YYYY-MM]
//       → search terms that triggered impressions, aggregated MONTHLY. Defaults:
//         startMonth = 3 months ago, endMonth = current. (Google hides terms
//         below a minimum-impression threshold.) Response: { …, keywords:
//         [{ keyword, impressions }] }.
//
// NOTE: the REST path is the flat `/analytics/googlebusiness/<resource>` form
// (proven by the docs' curl examples), NOT the named doc-page slug
// (`/analytics/get-google-business-performance`). We parse DEFENSIVELY: prefer
// Zernio's pre-summed `total`, but ALSO sum `values` as a fallback when `total`
// is missing, and tolerate a missing metric key (→ 0). Every field is optional
// so a docs/version drift can't strand us. (402 = the Analytics add-on isn't on
// the account — surfaced as the thrown status+body; the service layer catches it
// and stays best-effort, so the page still renders.)

/** The GBP performance metric keys we read. Google's Business Profile
 *  Performance API names; impressions are split desktop/mobile × Maps/Search,
 *  which we sum into one "impressions" total. */
export const GBP_PERFORMANCE_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
  'BUSINESS_BOOKINGS',
  'BUSINESS_CONVERSATIONS',
] as const

/** The four impression sub-series we sum into a single impressions figure. */
const GBP_IMPRESSION_KEYS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
] as const

/** One metric entry as Zernio returns it: a pre-summed `total` + a daily series.
 *  Each daily value may be `{ date, value }` or a bare number — both tolerated.
 *  Every field optional so parsing never throws. */
interface GbpRawMetric {
  total?: number | string | null
  values?: Array<{ date?: string; value?: number | string | null } | number | string | null> | null
}

/** The performance payload — `metrics` keyed by metric name. Some integrations
 *  wrap it under `{ data: {...} }`; the parser reaches through either. */
interface GbpRawPerformance {
  metrics?: Record<string, GbpRawMetric> | null
  data?: { metrics?: Record<string, GbpRawMetric> | null } | null
}

/** A normalized GBP performance snapshot — totals summed over the window. The
 *  four impression sub-series are folded into one `impressions`. */
export interface GoogleBusinessPerformance {
  /** Maps + Search, desktop + mobile, summed. */
  impressions: number
  /** Tap-to-call clicks ("Call" button on the listing). */
  calls: number
  /** Direction / route requests. */
  directions: number
  /** Clicks through to the clinic's website. */
  websiteClicks: number
  /** "Book" action completions on the listing. */
  bookings: number
  /** Messaging conversations started from the listing. */
  conversations: number
}

/** Coerce a number | numeric-string into a finite non-negative integer total,
 *  or null when unreadable. (GBP counts are whole; we round defensively.) */
function toFiniteCount(raw: unknown): number | null {
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

/**
 * Read a single metric's total over the window. Prefers Zernio's pre-summed
 * `total`; falls back to summing the daily `values` (each `{date,value}` or a
 * bare number); returns 0 when the metric key is absent or unreadable.
 */
function readMetricTotal(metrics: Record<string, GbpRawMetric>, key: string): number {
  const m = metrics[key]
  if (!m) return 0
  const total = toFiniteCount(m.total)
  if (total != null) return total
  // Fall back to summing the daily series.
  if (!Array.isArray(m.values)) return 0
  let sum = 0
  for (const v of m.values) {
    if (v == null) continue
    const n = typeof v === 'object' ? toFiniteCount(v.value) : toFiniteCount(v)
    if (n != null) sum += n
  }
  return sum
}

function unwrapPerformanceMetrics(data: GbpRawPerformance): Record<string, GbpRawMetric> {
  return data.data?.metrics ?? data.metrics ?? {}
}

/**
 * `GET /v1/analytics/googlebusiness/performance?accountId=…&startDate=…&endDate=…`
 * — the connected GBP location's local metrics over the window, normalized into
 * window totals (impression sub-series folded into one figure). Pass either an
 * explicit `{ startDate, endDate }` (YYYY-MM-DD) or a `{ days }` count (the
 * client computes the date range, ending today). Throws on a non-2xx (the
 * service layer catches and stays best-effort).
 */
export async function getGoogleBusinessPerformance(
  accountId: string,
  range: { startDate: string; endDate: string } | { days: number },
): Promise<GoogleBusinessPerformance> {
  const { startDate, endDate } = 'days' in range ? rangeFromDays(range.days) : range
  const qs = new URLSearchParams({
    accountId,
    startDate,
    endDate,
    metrics: GBP_PERFORMANCE_METRICS.join(','),
  })
  const data = await zernioFetch<GbpRawPerformance>(`/analytics/googlebusiness/performance?${qs.toString()}`)
  const metrics = unwrapPerformanceMetrics(data)
  let impressions = 0
  for (const k of GBP_IMPRESSION_KEYS) impressions += readMetricTotal(metrics, k)
  return {
    impressions,
    calls: readMetricTotal(metrics, 'CALL_CLICKS'),
    directions: readMetricTotal(metrics, 'BUSINESS_DIRECTION_REQUESTS'),
    websiteClicks: readMetricTotal(metrics, 'WEBSITE_CLICKS'),
    bookings: readMetricTotal(metrics, 'BUSINESS_BOOKINGS'),
    conversations: readMetricTotal(metrics, 'BUSINESS_CONVERSATIONS'),
  }
}

/** A normalized top-search-keyword entry. */
export interface GoogleBusinessKeyword {
  term: string
  /** Impressions the term drove over the window (summed across months). */
  count: number
}

/** Raw keyword entry — `keyword` + `impressions` per the docs; we also tolerate
 *  `searchKeyword` / `value` / `impressionsValue` aliases. Every field optional. */
interface GbpRawKeyword {
  keyword?: string | null
  searchKeyword?: string | null
  impressions?: number | string | null
  value?: number | string | null
  impressionsValue?: number | string | null
}

interface GbpRawKeywords {
  keywords?: GbpRawKeyword[] | null
  data?: { keywords?: GbpRawKeyword[] | null } | null
}

/**
 * `GET /v1/analytics/googlebusiness/search-keywords?accountId=…&startMonth=…&endMonth=…`
 * — the search terms that triggered impressions for the location, aggregated
 * monthly by Google. Pass either explicit `{ startMonth, endMonth }` (YYYY-MM)
 * or a `{ days }` count (mapped to a covering month span). Returns the merged,
 * impression-sorted list, capped to `limit` (default 8). Throws on a non-2xx.
 */
export async function getGoogleBusinessSearchKeywords(
  accountId: string,
  range: { startMonth: string; endMonth: string } | { days: number },
  limit = 8,
): Promise<GoogleBusinessKeyword[]> {
  const { startMonth, endMonth } = 'days' in range ? monthRangeFromDays(range.days) : range
  const qs = new URLSearchParams({ accountId, startMonth, endMonth })
  const data = await zernioFetch<GbpRawKeywords>(`/analytics/googlebusiness/search-keywords?${qs.toString()}`)
  const rawList = data.data?.keywords ?? data.keywords ?? []
  // Merge by term (a term can appear in multiple monthly buckets), summing impressions.
  const merged = new Map<string, number>()
  for (const k of rawList) {
    const term = (k.keyword ?? k.searchKeyword ?? '').trim()
    if (!term) continue
    const count = toFiniteCount(k.impressions ?? k.value ?? k.impressionsValue) ?? 0
    merged.set(term, (merged.get(term) ?? 0) + count)
  }
  return Array.from(merged.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(0, limit))
}

/** Compute a `{startDate,endDate}` (YYYY-MM-DD) window ending today, `days` wide. */
function rangeFromDays(days: number): { startDate: string; endDate: string } {
  const n = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
  const end = new Date()
  const start = new Date(end.getTime() - n * 24 * 60 * 60 * 1000)
  return { startDate: ymd(start), endDate: ymd(end) }
}

/** Map a `days` window to a covering month span (keywords are monthly-only). A
 *  30-day window maps to the last ~1-2 calendar months; 90 days to ~3-4. */
function monthRangeFromDays(days: number): { startMonth: string; endMonth: string } {
  const n = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
  const end = new Date()
  const start = new Date(end.getTime() - n * 24 * 60 * 60 * 1000)
  return { startMonth: ym(start), endMonth: ym(end) }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function ym(d: Date): string {
  return d.toISOString().slice(0, 7)
}
