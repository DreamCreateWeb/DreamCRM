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
