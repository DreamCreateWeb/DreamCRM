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
