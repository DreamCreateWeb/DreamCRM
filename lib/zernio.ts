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
  // Google Place ID candidates — Zernio's confirmed shape doesn't include one,
  // but we parse defensively across several field names in case a version does,
  // so a clinic's "review us on Google" link can auto-fill. Absent → the clinic
  // pastes their Place ID / review link manually.
  placeId?: string | null
  placeID?: string | null
  googlePlaceId?: string | null
  metadata?: {
    placeId?: string | null
    newReviewUri?: string | null
    mapsUri?: string | null
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
  /** Google Place ID, when Zernio surfaces one (defensively parsed). Feeds the
   *  "review us on Google" write link. Null when unavailable → manual entry. */
  placeId: string | null
}

/**
 * Pull a Google Place ID out of a "write a review" / maps URI when present.
 * Handles `…writereview?placeid=<ID>` and `…?...&placeid=<ID>` shapes. Pure;
 * returns null on no match.
 */
export function extractPlaceIdFromUri(uri: string | null | undefined): string | null {
  if (!uri || typeof uri !== 'string') return null
  const m = /[?&]placeid=([^&#]+)/i.exec(uri)
  return m ? decodeURIComponent(m[1]) : null
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
  const placeId =
    raw.placeId ??
    raw.placeID ??
    raw.googlePlaceId ??
    raw.metadata?.placeId ??
    extractPlaceIdFromUri(raw.metadata?.newReviewUri) ??
    extractPlaceIdFromUri(raw.metadata?.mapsUri) ??
    null
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
    placeId: typeof placeId === 'string' && placeId.trim() ? placeId.trim() : null,
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

// ── Google Business posts (Phase 2 — GBP posting) ─────────────────────────────
//
// Confirmed against the Zernio docs (llms.txt + llms-full.txt + the OpenAPI
// probe, 2026-06-15) — the GENERIC post primitives are confirmed; the
// GBP-specific options object is documented prose-only (the rendered `.mdx`
// pages are JS-only), so it is coded to the documented/precedent shape and
// parsed/serialized DEFENSIVELY (see the assumption note in
// docs/zernio-google-integration.md):
//
//   POST   /v1/posts   — create (publish-now OR schedule). Body (confirmed):
//          `profileId` (required), `content` (the post text; the docs also call
//          it `text` — we send BOTH keys so a version split can't strand us),
//          `socialAccountIds: string[]` (the target accounts — we ALSO send the
//          confirmed `platforms: [{ platform, accountId }]` shape), `scheduledAt`
//          / `scheduledFor` (ISO 8601 — Zernio PUBLISHES scheduled posts itself,
//          so we never run our own publish cron), `mediaUrls` (a public image
//          URL; sent as both a string and a 1-element array for tolerance). GBP
//          options ride a per-platform `options` / `googleBusiness` object:
//          `topicType` (`STANDARD` | `EVENT` | `OFFER`), `callToAction`
//          ({ `actionType`, `url` }), `event` ({ `title`, `schedule:{startDate,
//          endDate}` }), `offer` ({ `couponCode`, `redeemOnlineUrl`,
//          `termsConditions` }). We send the options under several keys so
//          whichever Zernio reads wins; extras are ignored server-side.
//   GET    /v1/posts?page&limit[&status] — list (newest first; `status` ∈
//          draft|scheduled|published|failed; post id is `_id`).
//   DELETE /v1/posts/{postId} — delete a post at Zernio.
//
// We surface a small READ-back from create (the new post `_id` + any per-account
// permalink Zernio returns) so the service can persist `zernioPostId` +
// `googleUrl`. Everything is optional-parsed so a drifted shape never throws on
// success.

/** Google Business post type (Zernio's GBP `topicType` enum). `standard` =
 *  a plain "What's new" update; `event` carries a date range; `offer` carries a
 *  coupon/redeem URL. (`product` / `alert` exist on Google but aren't surfaced
 *  by the composer — dental practices don't use them.) */
export const GBP_POST_TYPES = ['standard', 'event', 'offer'] as const
export type GbpPostType = (typeof GBP_POST_TYPES)[number]

/** Map our lowercase post type → Zernio/Google's UPPER `topicType` enum. */
const GBP_TOPIC_TYPE: Record<GbpPostType, string> = {
  standard: 'STANDARD',
  event: 'EVENT',
  offer: 'OFFER',
}

/** Google Business call-to-action button action types (Google's `actionType`
 *  enum). `CALL` uses the listing's phone number and needs no URL; every other
 *  type needs a destination URL. */
export const GBP_CTA_TYPES = ['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'] as const
export type GbpCtaType = (typeof GBP_CTA_TYPES)[number]

/** A normalized create-post result. `zernioPostId` is Zernio's post `_id`;
 *  `googleUrl` is the live GBP post permalink when Zernio returns one (Google
 *  doesn't always surface a stable URL synchronously). */
export interface GbpPostResult {
  zernioPostId: string | null
  googleUrl: string | null
}

/** The input the create wrapper serializes. Mirrors the service-level input but
 *  narrowed to the Zernio call (the service does validation + persistence). */
export interface CreateGbpPostInput {
  profileId: string
  accountId: string
  /** ≤1500 chars (validated upstream). */
  summary: string
  postType: GbpPostType
  /** A PUBLIC image URL (S3) Google/Zernio can fetch, or null. */
  imageUrl?: string | null
  /** CTA button. `url` is required unless `actionType === 'CALL'`. */
  cta?: { actionType: GbpCtaType; url?: string | null } | null
  /** EVENT fields (required when postType === 'event'). ISO datetimes. */
  event?: { title: string; startAt: string; endAt?: string | null } | null
  /** OFFER fields (postType === 'offer'). All optional per Google. */
  offer?: { couponCode?: string | null; redeemUrl?: string | null; terms?: string | null } | null
  /** ISO 8601 — when set, Zernio SCHEDULES the post (and publishes it itself). */
  scheduledAt?: string | null
}

/** Build the GBP per-platform options object Zernio attaches to a GBP post.
 *  Exported for unit tests (the body shape is the load-bearing contract). */
export function buildGbpPostOptions(input: CreateGbpPostInput): Record<string, unknown> {
  const opts: Record<string, unknown> = { topicType: GBP_TOPIC_TYPE[input.postType] }
  if (input.cta && input.cta.actionType) {
    opts.callToAction =
      input.cta.actionType === 'CALL'
        ? { actionType: 'CALL' }
        : { actionType: input.cta.actionType, url: input.cta.url ?? undefined }
  }
  if (input.postType === 'event' && input.event) {
    opts.event = {
      title: input.event.title,
      schedule: {
        startDate: input.event.startAt,
        ...(input.event.endAt ? { endDate: input.event.endAt } : {}),
      },
    }
  }
  if (input.postType === 'offer' && input.offer) {
    const offer: Record<string, unknown> = {}
    if (input.offer.couponCode) offer.couponCode = input.offer.couponCode
    if (input.offer.redeemUrl) offer.redeemOnlineUrl = input.offer.redeemUrl
    if (input.offer.terms) offer.termsConditions = input.offer.terms
    opts.offer = offer
  }
  return opts
}

/**
 * `POST /v1/posts` — create (publish now or schedule) a Google Business post.
 * Sends the confirmed generic body PLUS the GBP options under several tolerant
 * keys (`options` / `googleBusiness` / `platformOptions`) so whichever Zernio
 * honors wins. Returns the new post id + any permalink. Throws status+body on a
 * non-2xx (the service layer catches and records `status='failed'`).
 */
export async function createGbpPost(input: CreateGbpPostInput): Promise<GbpPostResult> {
  const options = buildGbpPostOptions(input)
  const body: Record<string, unknown> = {
    profileId: input.profileId,
    // Send both content + text — the generic docs use `content`, some examples
    // `text`; sending both is harmless (server ignores the unknown one).
    content: input.summary,
    text: input.summary,
    // The confirmed targeting shapes — a flat id array AND the platforms array.
    socialAccountIds: [input.accountId],
    platforms: [{ platform: 'googlebusiness', accountId: input.accountId }],
    // GBP options under tolerant keys.
    options,
    googleBusiness: options,
    platformOptions: { googlebusiness: options },
  }
  if (input.imageUrl) {
    // mediaUrls is documented as a comma-separated string; also send an array
    // form for tolerance (one image — GBP allows a single photo per post).
    body.mediaUrls = input.imageUrl
    body.media = [input.imageUrl]
  }
  if (input.scheduledAt) {
    body.scheduledAt = input.scheduledAt
    body.scheduledFor = input.scheduledAt
  } else {
    body.publishNow = true
  }

  const data = await zernioFetch<unknown>('/posts', { method: 'POST', body: JSON.stringify(body) })
  return normalizeCreateResult(data)
}

/** Input for a generic (social) post to a single connected account. No GBP
 *  options — just text + an optional image — so it works for Instagram /
 *  Facebook / TikTok / YouTube / LinkedIn. The service fans GBP and social
 *  targets to the right wrapper (GBP → `createGbpPost`, social → this). */
export interface CreateSocialPostInput {
  profileId: string
  /** The single Zernio account this post targets. */
  accountId: string
  platform: string
  /** The post body. */
  summary: string
  /** A PUBLIC image URL (S3) the platform can fetch, or null. */
  imageUrl?: string | null
  /** ISO 8601 — when set, Zernio SCHEDULES the post (and publishes it itself). */
  scheduledAt?: string | null
}

/**
 * `POST /v1/posts` — create (publish now or schedule) a generic social post on a
 * single connected account. Same `/posts` endpoint as the GBP create, but with
 * NO platform-specific options (the socials don't use GBP's topicType/CTA/event/
 * offer). Sends the confirmed generic body (content/text + socialAccountIds +
 * platforms + mediaUrls + schedule). Returns the new post id + any permalink.
 * Throws status+body on a non-2xx (the service catches → records `failed`).
 */
export async function createSocialPost(input: CreateSocialPostInput): Promise<GbpPostResult> {
  const body: Record<string, unknown> = {
    profileId: input.profileId,
    content: input.summary,
    text: input.summary,
    socialAccountIds: [input.accountId],
    platforms: [{ platform: input.platform, accountId: input.accountId }],
  }
  if (input.imageUrl) {
    body.mediaUrls = input.imageUrl
    body.media = [input.imageUrl]
  }
  if (input.scheduledAt) {
    body.scheduledAt = input.scheduledAt
    body.scheduledFor = input.scheduledAt
  } else {
    body.publishNow = true
  }
  const data = await zernioFetch<unknown>('/posts', { method: 'POST', body: JSON.stringify(body) })
  return normalizeCreateResult(data)
}

/** Pull a post id + permalink out of a create response, tolerating wrappers. */
function normalizeCreateResult(data: unknown): GbpPostResult {
  if (!data || typeof data !== 'object') return { zernioPostId: null, googleUrl: null }
  const o = data as Record<string, unknown>
  // The post may be the root object, or under `post` / `data`.
  const post =
    (o.post && typeof o.post === 'object' ? (o.post as Record<string, unknown>) : null) ??
    (o.data && typeof o.data === 'object' && !Array.isArray(o.data) ? (o.data as Record<string, unknown>) : null) ??
    o
  const id = post._id ?? post.id ?? post.postId
  return {
    zernioPostId: id != null ? String(id) : null,
    googleUrl: extractPermalink(post) ?? extractPermalink(o),
  }
}

/** Find a live post URL in a post object — Zernio may surface it as a flat
 *  field or per-account under `results`/`accounts`/`platforms`. Best-effort. */
function extractPermalink(obj: Record<string, unknown>): string | null {
  const flat = obj.permalink ?? obj.searchUrl ?? obj.url ?? obj.postUrl ?? obj.link
  if (typeof flat === 'string' && flat.startsWith('http')) return flat
  for (const key of ['results', 'accounts', 'platforms', 'platformResults']) {
    const arr = obj[key]
    if (Array.isArray(arr)) {
      for (const entry of arr) {
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>
          const u = e.permalink ?? e.searchUrl ?? e.url ?? e.postUrl ?? e.link
          if (typeof u === 'string' && u.startsWith('http')) return u
        }
      }
    }
  }
  return null
}

/** A post as listed by `GET /v1/posts`, narrowed to what the history view uses.
 *  Defensive — every field optional in the raw payload. */
export interface ZernioPostListItem {
  id: string
  status: string | null
  content: string | null
  scheduledAt: string | null
  publishedAt: string | null
  googleUrl: string | null
}

interface ZernioRawPost {
  _id?: string
  id?: string
  status?: string | null
  content?: string | null
  text?: string | null
  scheduledAt?: string | null
  scheduledFor?: string | null
  publishedAt?: string | null
  permalink?: string | null
  url?: string | null
  searchUrl?: string | null
}

/**
 * `GET /v1/posts?page&limit[&status]` — list posts for the account, newest
 * first. We primarily track posts in our own `gbp_post` table (so the history
 * view never depends on this), but expose it for an optional status reconcile +
 * tests. Tolerates `posts` / `data` / a bare array. Throws on a non-2xx.
 */
export async function listPosts(opts: { page?: number; limit?: number; status?: string } = {}): Promise<ZernioPostListItem[]> {
  const qs = new URLSearchParams()
  if (opts.page) qs.set('page', String(opts.page))
  if (opts.limit) qs.set('limit', String(opts.limit))
  if (opts.status) qs.set('status', opts.status)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const data = await zernioFetch<{ posts?: ZernioRawPost[]; data?: ZernioRawPost[] } | ZernioRawPost[]>(
    `/posts${suffix}`,
  )
  const rawList = Array.isArray(data) ? data : (data.posts ?? data.data ?? [])
  return rawList
    .map((p): ZernioPostListItem | null => {
      const id = p._id ?? p.id
      if (!id) return null
      return {
        id: String(id),
        status: p.status ?? null,
        content: p.content ?? p.text ?? null,
        scheduledAt: p.scheduledAt ?? p.scheduledFor ?? null,
        publishedAt: p.publishedAt ?? null,
        googleUrl:
          [p.permalink, p.searchUrl, p.url].find((u) => typeof u === 'string' && u.startsWith('http')) ?? null,
      }
    })
    .filter((p): p is ZernioPostListItem => p !== null)
}

/**
 * `DELETE /v1/posts/{postId}` — delete a post at Zernio (removes a scheduled
 * post before it runs, or the published GBP post). Best-effort at the service
 * layer (we always drop our local row regardless). Throws on a non-2xx.
 */
export async function deletePost(postId: string): Promise<void> {
  await zernioFetch(`/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' })
}

// ── Post comments + per-post engagement (the "manage your post" surface) ──────
//
// Confirmed against the Zernio OpenAPI (v1.0.4, 2026-06-24):
//   COMMENTS (require the INBOX add-on → a 403 when absent):
//     GET    /v1/inbox/comments/{postId}?accountId=…&limit=&cursor=
//            → { status, comments:[{ id, message, createdTime, from:{name,username,
//              picture,isOwner}, likeCount, replyCount, url, replies[], canReply,
//              canDelete, canHide, canLike, isHidden, isLiked, likeUri, cid }], pagination }
//     POST   /v1/inbox/comments/{postId}          body { accountId, message, commentId? }
//     DELETE /v1/inbox/comments/{postId}?accountId=…&commentId=…
//     POST   /v1/inbox/comments/{postId}/{commentId}/hide   body { accountId }
//     DELETE /v1/inbox/comments/{postId}/{commentId}/hide?accountId=…           (unhide)
//     POST   /v1/inbox/comments/{postId}/{commentId}/like   body { accountId, cid? }
//     DELETE /v1/inbox/comments/{postId}/{commentId}/like?accountId=…&likeUri=  (unlike)
//   ENGAGEMENT (requires the ANALYTICS add-on → a 402 when absent):
//     GET /v1/analytics/post-timeline?postId=…  → daily cumulative totals per platform
//       row: { date, platform, platformPostId, impressions, reach, likes, comments,
//              shares, saves, clicks, views } — the LATEST row per platform = current totals.
//
// Comment capability is PER-PLATFORM and PER-COMMENT: the API returns can*
// flags on every comment (canReply/canDelete/canHide/canLike) so the UI drives
// its buttons off the data, not a hardcoded matrix. Of our shortlist, comments
// exist for Instagram / Facebook / YouTube / LinkedIn (NOT Google Business —
// that's reviews — and NOT TikTok). Parsed DEFENSIVELY against field drift.

/** A normalized comment on a published post (client-safe shape). */
export interface ZernioComment {
  id: string
  message: string
  createdTime: string | null
  authorName: string
  authorHandle: string | null
  authorPicture: string | null
  isOwner: boolean
  likeCount: number
  replyCount: number
  /** Permalink to the comment on the platform, when the API returns one. */
  url: string | null
  /** Per-comment capability flags (what THIS comment supports on its platform). */
  canReply: boolean
  canDelete: boolean
  canHide: boolean
  canLike: boolean
  isHidden: boolean
  isLiked: boolean
  /** Bluesky-only handles carried through so like/unlike round-trips work. */
  likeUri: string | null
  cid: string | null
  /** Nested replies (one level; same shape). */
  replies: ZernioComment[]
}

interface RawComment {
  id?: string
  commentId?: string
  message?: string | null
  text?: string | null
  createdTime?: string | null
  createdAt?: string | null
  from?: { name?: string | null; username?: string | null; picture?: string | null; isOwner?: boolean } | null
  author?: { name?: string | null; username?: string | null; picture?: string | null } | null
  likeCount?: number | null
  replyCount?: number | null
  url?: string | null
  permalink?: string | null
  canReply?: boolean
  canDelete?: boolean
  canHide?: boolean
  canLike?: boolean
  isHidden?: boolean
  isLiked?: boolean
  likeUri?: string | null
  cid?: string | null
  replies?: RawComment[] | null
}

function normalizeComment(raw: RawComment): ZernioComment | null {
  const id = raw.id ?? raw.commentId
  if (!id) return null
  const from = raw.from ?? raw.author ?? null
  return {
    id: String(id),
    message: raw.message ?? raw.text ?? '',
    createdTime: raw.createdTime ?? raw.createdAt ?? null,
    authorName: from?.name ?? from?.username ?? 'Someone',
    authorHandle: from?.username ?? null,
    authorPicture: from?.picture ?? null,
    isOwner: Boolean(raw.from?.isOwner),
    likeCount: Number(raw.likeCount ?? 0) || 0,
    replyCount: Number(raw.replyCount ?? 0) || 0,
    url: [raw.url, raw.permalink].find((u) => typeof u === 'string' && u.startsWith('http')) ?? null,
    canReply: Boolean(raw.canReply),
    canDelete: Boolean(raw.canDelete),
    canHide: Boolean(raw.canHide),
    canLike: Boolean(raw.canLike),
    isHidden: Boolean(raw.isHidden),
    isLiked: Boolean(raw.isLiked),
    likeUri: raw.likeUri ?? null,
    cid: raw.cid ?? null,
    replies: Array.isArray(raw.replies)
      ? raw.replies.map(normalizeComment).filter((c): c is ZernioComment => c !== null)
      : [],
  }
}

/** `GET /inbox/comments/{postId}` — the comment thread for a published post.
 *  Requires the Inbox add-on (a 403 throws — the service treats that as
 *  "add-on off"). */
export async function listPostComments(
  postId: string,
  accountId: string,
  opts?: { limit?: number; cursor?: string },
): Promise<{ comments: ZernioComment[]; hasMore: boolean; cursor: string | null }> {
  const qs = new URLSearchParams({ accountId })
  if (opts?.limit) qs.set('limit', String(opts.limit))
  if (opts?.cursor) qs.set('cursor', opts.cursor)
  const data = await zernioFetch<{
    comments?: RawComment[]
    pagination?: { hasMore?: boolean; cursor?: string | null } | null
  }>(`/inbox/comments/${encodeURIComponent(postId)}?${qs.toString()}`)
  const comments = (data.comments ?? []).map(normalizeComment).filter((c): c is ZernioComment => c !== null)
  return { comments, hasMore: Boolean(data.pagination?.hasMore), cursor: data.pagination?.cursor ?? null }
}

/** `POST /inbox/comments/{postId}` — reply to the post, or to a specific comment
 *  when `commentId` is set. Returns the new comment id. */
export async function replyToPostComment(
  postId: string,
  input: { accountId: string; message: string; commentId?: string },
): Promise<{ commentId: string | null }> {
  const data = await zernioFetch<{ data?: { commentId?: string } | null }>(
    `/inbox/comments/${encodeURIComponent(postId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        accountId: input.accountId,
        message: input.message,
        ...(input.commentId ? { commentId: input.commentId } : {}),
      }),
    },
  )
  return { commentId: data.data?.commentId ?? null }
}

/** `DELETE /inbox/comments/{postId}?accountId&commentId` — delete a comment. */
export async function deletePostComment(postId: string, accountId: string, commentId: string): Promise<void> {
  const qs = new URLSearchParams({ accountId, commentId })
  await zernioFetch(`/inbox/comments/${encodeURIComponent(postId)}?${qs.toString()}`, { method: 'DELETE' })
}

/** Hide (POST) or unhide (DELETE) a comment. */
export async function setPostCommentHidden(
  postId: string,
  commentId: string,
  accountId: string,
  hidden: boolean,
): Promise<void> {
  const path = `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/hide`
  if (hidden) {
    await zernioFetch(path, { method: 'POST', body: JSON.stringify({ accountId }) })
  } else {
    await zernioFetch(`${path}?${new URLSearchParams({ accountId }).toString()}`, { method: 'DELETE' })
  }
}

/** Like (POST) or unlike (DELETE) a comment. Returns the Bluesky likeUri when
 *  liking (needed to unlike later); null otherwise. */
export async function setPostCommentLiked(
  postId: string,
  commentId: string,
  accountId: string,
  liked: boolean,
  opts?: { cid?: string | null; likeUri?: string | null },
): Promise<{ likeUri: string | null }> {
  const path = `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/like`
  if (liked) {
    const data = await zernioFetch<{ likeUri?: string | null }>(path, {
      method: 'POST',
      body: JSON.stringify({ accountId, ...(opts?.cid ? { cid: opts.cid } : {}) }),
    })
    return { likeUri: data.likeUri ?? null }
  }
  const qs = new URLSearchParams({ accountId })
  if (opts?.likeUri) qs.set('likeUri', opts.likeUri)
  await zernioFetch(`${path}?${qs.toString()}`, { method: 'DELETE' })
  return { likeUri: null }
}

/** Per-post engagement totals (one platform). All fields are counts. */
export interface ZernioPostEngagement {
  likes: number
  comments: number
  shares: number
  saves: number
  impressions: number
  reach: number
  views: number
  clicks: number
}

interface RawTimelineRow {
  date?: string
  platform?: string
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  impressions?: number
  reach?: number
  views?: number
  clicks?: number
}

/** `GET /analytics/post-timeline?postId=…` — daily cumulative totals per
 *  platform. We reduce to the LATEST row per platform (current totals) and
 *  return a per-platform map. Requires the Analytics add-on (a 402 throws — the
 *  service treats that as "analytics off"). */
export async function getPostEngagement(postId: string): Promise<Record<string, ZernioPostEngagement>> {
  const data = await zernioFetch<{ timeline?: RawTimelineRow[] }>(
    `/analytics/post-timeline?${new URLSearchParams({ postId }).toString()}`,
  )
  const latestByPlatform = new Map<string, RawTimelineRow>()
  for (const row of data.timeline ?? []) {
    const platform = row.platform ?? 'unknown'
    const prev = latestByPlatform.get(platform)
    // Rows are daily cumulative; the latest date wins.
    if (!prev || String(row.date ?? '') >= String(prev.date ?? '')) latestByPlatform.set(platform, row)
  }
  const out: Record<string, ZernioPostEngagement> = {}
  latestByPlatform.forEach((row, platform) => {
    out[platform] = {
      likes: Number(row.likes ?? 0) || 0,
      comments: Number(row.comments ?? 0) || 0,
      shares: Number(row.shares ?? 0) || 0,
      saves: Number(row.saves ?? 0) || 0,
      impressions: Number(row.impressions ?? 0) || 0,
      reach: Number(row.reach ?? 0) || 0,
      views: Number(row.views ?? 0) || 0,
      clicks: Number(row.clicks ?? 0) || 0,
    }
  })
  return out
}

/** True when a non-2xx Zernio error is a 403 (Inbox add-on) — used by the
 *  service to degrade gracefully instead of throwing. */
export function isInboxAddonError(e: unknown): boolean {
  return e instanceof Error && /\b403\b/.test(e.message)
}

/** True when a Zernio error is a 402 (Analytics add-on required). */
export function isAnalyticsAddonError(e: unknown): boolean {
  return e instanceof Error && (/\b402\b/.test(e.message) || /analytics_addon_required/i.test(e.message))
}

// ── Facebook reviews / recommendations (Phase 3 PR 4) ─────────────────────────
//
// Confirmed against the Zernio docs (llms.txt + llms-full.txt + the OpenAPI
// probe, 2026-06-15):
//   - Google Business reviews have a DEDICATED endpoint (`/google-business/
//     gmb-reviews`, wired above).
//   - There is NO Facebook-only reviews endpoint. The OpenAPI probe surfaced a
//     UNIFIED review surface — `GET /v1/comments/reviews` (the same review/inbox
//     surface the CLI `inbox:reviews` reads, documented as covering "Facebook,
//     Google Business"), filterable by platform — but the exact field shape for
//     a Facebook *recommendation* (recommend / don't-recommend, which has NO
//     1–5 star value) is NOT spelled out in the rendered docs (they're JS-only).
//   - Facebook REPLIES are NOT exposed via a Zernio reply endpoint (only GBP has
//     `gmb-reviews/{id}/reply`). So FB recommendations are READ-ONLY for us — the
//     UI shows them + a "Reply on Facebook" link-out (honest; no fake reply box).
//
// Because the FB review shape is unconfirmed, this wrapper parses ENTIRELY
// DEFENSIVELY and the service layer treats it as best-effort (any failure →
// empty, never destructive). When Zernio confirms/ships the shape, the demo
// already exercises the render path; only this normalizer may need a tweak.
//
// Facebook's recommendation model: each review carries either a
// `recommendationType` (`'positive'`/`'negative'` on FB's Graph API, sometimes
// surfaced as `'recommended'`/`'not_recommended'`) OR, on older/normalized
// shapes, a `rating` 1–5. We map both: a star rating (when present) lands as
// 1–5; otherwise the recommendation maps to recommended/not_recommended (and we
// leave starRating null — FB recommendations have no star value, which is why
// they're deliberately EXCLUDED from the public AggregateRating).

/** A normalized Facebook review/recommendation. Either `starRating` (rare —
 *  legacy FB page ratings were 1–5) OR `recommendationType` is set; usually the
 *  recommendation. `comment` may be null (a bare recommendation). */
export interface FacebookReview {
  /** Facebook's stable review id (the `id`/`reviewId`/`openGraphStoryId`). */
  id: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  /** Integer 1–5 when FB surfaced a legacy star rating, else null. */
  starRating: number | null
  /** FB recommendation, normalized: 'recommended' | 'not_recommended' | null. */
  recommendationType: 'recommended' | 'not_recommended' | null
  comment: string | null
  createTime: string | null
  updateTime: string | null
  /** A permalink to the recommendation on Facebook, when surfaced. */
  permalink: string | null
}

/** Normalize a Facebook recommendation flag from its several documented shapes
 *  (`recommendationType`, `recommendation`, `isRecommended`, `type`) into our
 *  enum, or null when unreadable. FB Graph uses 'positive'/'negative'. */
export function normalizeRecommendation(raw: unknown): 'recommended' | 'not_recommended' | null {
  if (raw == null) return null
  if (typeof raw === 'boolean') return raw ? 'recommended' : 'not_recommended'
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase()
    if (!v) return null
    if (['positive', 'recommended', 'recommend', 'yes', 'true', 'up'].includes(v)) return 'recommended'
    if (['negative', 'not_recommended', 'notrecommended', "doesn't recommend", 'no', 'false', 'down'].includes(v))
      return 'not_recommended'
    return null
  }
  return null
}

/** Raw FB review shape — every variant field optional so parsing never throws. */
interface ZernioRawFbReview {
  id?: string
  reviewId?: string
  openGraphStoryId?: string
  name?: string
  rating?: number | string
  starRating?: number | string
  recommendationType?: string | boolean
  recommendation?: string | boolean
  isRecommended?: boolean
  type?: string
  comment?: string | null
  text?: string | null
  reviewText?: string | null
  message?: string | null
  createTime?: string
  createdAt?: string
  createdTime?: string
  updateTime?: string
  updatedAt?: string
  reviewer?: {
    displayName?: string | null
    name?: string | null
    profilePhotoUrl?: string | null
    profileImage?: string | null
    picture?: string | null
  } | null
  permalink?: string | null
  permalinkUrl?: string | null
  url?: string | null
}

function normalizeFbReview(raw: ZernioRawFbReview): FacebookReview | null {
  const id = raw.id ?? raw.reviewId ?? raw.openGraphStoryId ?? raw.name
  if (!id) return null // a review with no id can't be upserted idempotently
  const reviewer = raw.reviewer ?? null
  const star = normalizeStarRating(raw.starRating ?? raw.rating)
  const rec = normalizeRecommendation(raw.recommendationType ?? raw.recommendation ?? raw.isRecommended ?? raw.type)
  const permalink = [raw.permalink, raw.permalinkUrl, raw.url].find(
    (u) => typeof u === 'string' && u.startsWith('http'),
  )
  return {
    id: String(id),
    reviewerName: reviewer?.displayName ?? reviewer?.name ?? null,
    reviewerPhotoUrl: reviewer?.profilePhotoUrl ?? reviewer?.profileImage ?? reviewer?.picture ?? null,
    // A FB recommendation has no star value — only keep a star when there was no
    // recommendation flag (legacy page rating) so the AggregateRating stays
    // Google-only and FB never injects a fabricated star.
    starRating: rec ? null : star,
    recommendationType: rec,
    comment: raw.comment ?? raw.text ?? raw.reviewText ?? raw.message ?? null,
    createTime: raw.createTime ?? raw.createdAt ?? raw.createdTime ?? null,
    updateTime: raw.updateTime ?? raw.updatedAt ?? null,
    permalink: permalink ?? null,
  }
}

/**
 * `GET /v1/comments/reviews?platform=facebook&accountId=…[&pageToken=…]` — the
 * connected Facebook Page's reviews/recommendations through the unified Zernio
 * review surface. Parsed defensively (the FB review field shape is not pinned in
 * the rendered docs); tolerates `reviews` / `data` / `recommendations` / a bare
 * array, and `nextPageToken` / `next` / `paging.cursors.after`. Throws on a
 * non-2xx (the service layer catches and stays best-effort).
 */
export async function listFacebookReviews(opts: {
  accountId: string
  pageToken?: string
  pageSize?: number
}): Promise<{ reviews: FacebookReview[]; nextPageToken: string | null }> {
  const qs = new URLSearchParams({ platform: 'facebook', accountId: opts.accountId })
  if (opts.pageToken) qs.set('pageToken', opts.pageToken)
  if (opts.pageSize) qs.set('pageSize', String(opts.pageSize))
  const data = await zernioFetch<
    | {
        reviews?: ZernioRawFbReview[]
        data?: ZernioRawFbReview[]
        recommendations?: ZernioRawFbReview[]
        nextPageToken?: string | null
        next?: string | null
        paging?: { cursors?: { after?: string | null } | null } | null
      }
    | ZernioRawFbReview[]
  >(`/comments/reviews?${qs.toString()}`)
  const rawList = Array.isArray(data)
    ? data
    : (data.reviews ?? data.data ?? data.recommendations ?? [])
  const reviews = rawList.map(normalizeFbReview).filter((r): r is FacebookReview => r !== null)
  const nextPageToken = Array.isArray(data)
    ? null
    : (data.nextPageToken ?? data.next ?? data.paging?.cursors?.after ?? null)
  return { reviews, nextPageToken }
}

// ── Per-platform social analytics (Phase 3 PR 4) ──────────────────────────────
//
// Confirmed against the Zernio docs (llms.txt + the OpenAPI probe, 2026-06-15):
// every per-platform analytics endpoint returns the SAME envelope as the GBP
// performance endpoint we already consume —
//   { success, accountId, platform, dateRange:{since,until}, metricType,
//     metrics: { <METRIC_KEY>: { total, values:[…] } } }
// (the OpenAPI `InstagramAccountInsightsResponse` schema is reused across IG /
// FB / TikTok / YouTube / LinkedIn). Per-platform endpoints (the `-insights`
// names from llms.txt — these were the readable, confirmed page titles):
//   GET /v1/analytics/instagram/account-insights ?accountId&since&until
//   GET /v1/analytics/facebook/page-insights      ?accountId&since&until
//   GET /v1/analytics/tiktok/account-insights     ?accountId&since&until
//   GET /v1/analytics/youtube/channel-insights    ?accountId&since&until
//   GET /v1/analytics/linkedin/aggregate-analytics?accountId&since&until
// Params: `accountId` (required) + a `since`/`until` (YYYY-MM-DD) date range.
// The Analytics add-on gates these (our account has hasAnalyticsAccess:true); a
// 402 surfaces as the thrown status+body which the service catches.
//
// The specific METRIC KEYS differ per platform AND each platform's exact key
// names aren't all pinned in the rendered docs. So the normalizer reads
// DEFENSIVELY: for each logical figure (followers / reach / impressions /
// engagement / profile-views / post-count) we try a list of plausible key
// aliases, prefer a pre-summed `total`, fall back to summing the daily `values`,
// and tolerate every missing key (→ 0). A drifted/renamed key degrades a single
// figure to 0 without stranding the rest.

/** Per-platform analytics endpoint path (the `-insights` resource per platform).
 *  Only the shortlisted social platforms have a surface here (GBP uses its own
 *  performance endpoint). */
const SOCIAL_ANALYTICS_PATH: Record<string, string> = {
  instagram: '/analytics/instagram/account-insights',
  facebook: '/analytics/facebook/page-insights',
  tiktok: '/analytics/tiktok/account-insights',
  youtube: '/analytics/youtube/channel-insights',
  linkedin: '/analytics/linkedin/aggregate-analytics',
}

/** Per-figure metric-key aliases. Zernio's GBP keys are SCREAMING_SNAKE; the
 *  social platforms tend to use the platform's own metric names (IG/FB Graph
 *  Insights, TikTok/YT/LinkedIn). We try each alias and take the first present.
 *  These cover the documented + common Graph-API names; a miss just reads 0. */
const SOCIAL_METRIC_ALIASES: Record<'followers' | 'reach' | 'impressions' | 'engagement' | 'profileViews' | 'posts', string[]> = {
  followers: ['followers', 'follower_count', 'followers_count', 'total_followers', 'fans', 'page_fans', 'subscribers', 'subscriberCount'],
  reach: ['reach', 'accounts_reached', 'page_impressions_unique', 'reach_total', 'uniqueViews'],
  impressions: ['impressions', 'views', 'page_impressions', 'profile_impressions', 'video_views', 'totalViews'],
  engagement: ['engagement', 'engagements', 'total_interactions', 'accounts_engaged', 'page_engaged_users', 'interactions', 'engagementCount'],
  profileViews: ['profile_views', 'profileViews', 'page_views_total', 'profile_visits', 'pageViews'],
  posts: ['posts', 'post_count', 'posts_count', 'media_count', 'total_posts', 'publishedPosts'],
}

/** Raw analytics metric entry — same `{ total, values }` shape as GBP. */
interface SocialRawMetric {
  total?: number | string | null
  value?: number | string | null
  values?: Array<{ date?: string; value?: number | string | null } | number | string | null> | null
}

/** The per-platform analytics envelope (`metrics` keyed by metric name). Some
 *  shapes wrap it under `{ data: {...} }`; the parser reaches through either. */
interface SocialRawAnalytics {
  metrics?: Record<string, SocialRawMetric> | null
  data?: { metrics?: Record<string, SocialRawMetric> | null } | null
}

/** A normalized per-platform analytics snapshot — window totals (or the latest
 *  point for cumulative figures like follower count). Any figure Zernio didn't
 *  return reads 0. */
export interface SocialPlatformAnalytics {
  /** Follower / fan / subscriber count (a point-in-time figure). */
  followers: number
  /** Unique accounts reached over the window. */
  reach: number
  /** Impressions / views over the window. */
  impressions: number
  /** Engagements (likes + comments + shares + saves, however the platform
   *  aggregates) over the window. */
  engagement: number
  /** Profile / page visits over the window. */
  profileViews: number
  /** Posts published in the window (when the platform reports it). */
  posts: number
}

/** Read a metric's total from the analytics `metrics` map, trying each alias key
 *  in order. Prefers a pre-summed `total`/`value`; falls back to summing the
 *  daily `values` series; returns 0 when no alias is present/readable. */
function readSocialMetric(metrics: Record<string, SocialRawMetric>, aliases: string[]): number {
  for (const key of aliases) {
    const m = metrics[key]
    if (!m) continue
    const total = toFiniteCount(m.total ?? m.value)
    if (total != null) return total
    if (Array.isArray(m.values)) {
      let sum = 0
      let any = false
      for (const v of m.values) {
        if (v == null) continue
        const n = typeof v === 'object' ? toFiniteCount(v.value) : toFiniteCount(v)
        if (n != null) {
          sum += n
          any = true
        }
      }
      if (any) return sum
    }
  }
  return 0
}

/** Follower count is cumulative — when only a daily series exists, the LATEST
 *  value (not the sum) is the real count. Try total first, else the last
 *  readable daily point. */
function readFollowerCount(metrics: Record<string, SocialRawMetric>): number {
  for (const key of SOCIAL_METRIC_ALIASES.followers) {
    const m = metrics[key]
    if (!m) continue
    const total = toFiniteCount(m.total ?? m.value)
    if (total != null) return total
    if (Array.isArray(m.values)) {
      for (let i = m.values.length - 1; i >= 0; i--) {
        const v = m.values[i]
        if (v == null) continue
        const n = typeof v === 'object' ? toFiniteCount(v.value) : toFiniteCount(v)
        if (n != null) return n
      }
    }
  }
  return 0
}

function unwrapSocialMetrics(data: SocialRawAnalytics): Record<string, SocialRawMetric> {
  return data.data?.metrics ?? data.metrics ?? {}
}

/** True when we have a per-platform analytics endpoint for this platform slug. */
export function socialAnalyticsSupported(platform: string): boolean {
  return platform in SOCIAL_ANALYTICS_PATH
}

/**
 * `GET /v1/analytics/{platform}/...?accountId=…&since=…&until=…` — the connected
 * social account's insights over the window, normalized into a uniform snapshot
 * (followers / reach / impressions / engagement / profile-views / posts). Pass a
 * `{ days }` count (mapped to a since/until range ending today). Throws on a
 * non-2xx (incl. a 402 when the Analytics add-on is off) so the service can
 * catch and stay best-effort. Throws synchronously for an unsupported platform.
 */
export async function getSocialPlatformAnalytics(
  platform: string,
  accountId: string,
  range: { since: string; until: string } | { days: number },
): Promise<SocialPlatformAnalytics> {
  const path = SOCIAL_ANALYTICS_PATH[platform]
  if (!path) throw new Error(`No analytics endpoint for platform '${platform}'`)
  const { since, until } = 'days' in range ? sinceUntilFromDays(range.days) : range
  const qs = new URLSearchParams({ accountId, since, until })
  const data = await zernioFetch<SocialRawAnalytics>(`${path}?${qs.toString()}`)
  const metrics = unwrapSocialMetrics(data)
  return {
    followers: readFollowerCount(metrics),
    reach: readSocialMetric(metrics, SOCIAL_METRIC_ALIASES.reach),
    impressions: readSocialMetric(metrics, SOCIAL_METRIC_ALIASES.impressions),
    engagement: readSocialMetric(metrics, SOCIAL_METRIC_ALIASES.engagement),
    profileViews: readSocialMetric(metrics, SOCIAL_METRIC_ALIASES.profileViews),
    posts: readSocialMetric(metrics, SOCIAL_METRIC_ALIASES.posts),
  }
}

/** Compute a `{since,until}` (YYYY-MM-DD) window ending today, `days` wide. */
function sinceUntilFromDays(days: number): { since: string; until: string } {
  const n = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
  const end = new Date()
  const start = new Date(end.getTime() - n * 24 * 60 * 60 * 1000)
  return { since: ymd(start), until: ymd(end) }
}
