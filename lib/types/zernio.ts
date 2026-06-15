/**
 * Client-safe Zernio types + constants. NO `server-only` here — these are
 * imported by both the server service layer (`lib/services/zernio.ts`) and the
 * React UI (the Integrations Google Business card), so keep this free of any
 * server imports or secrets.
 *
 * Zernio is a unified social / Google Business Profile API. Our single platform
 * `ZERNIO_API_KEY` owns "profiles" (one per clinic org) → each profile holds
 * connected "accounts" (a clinic's GBP / Instagram / Facebook / …). Connection
 * is HOSTED OAuth: we never run Google's API-access verification ourselves.
 *
 * THIS FOUNDATION wires only Google Business (`googlebusiness`). The other 14
 * platform slugs are listed for the future multi-platform social module; they
 * are NOT connectable yet.
 */

/**
 * Every platform slug Zernio's `/connect/{platform}` enum accepts (posting
 * accounts only — ads variants like `metaads` are out of scope). Confirmed
 * against the live OpenAPI spec on 2026-06-15. `googlebusiness` is first-class;
 * the rest are reserved for the future social module.
 */
export const ZERNIO_PLATFORMS = [
  'googlebusiness',
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'threads',
  'pinterest',
  'x',
  'reddit',
  'bluesky',
  'telegram',
  'snapchat',
  'discord',
  'whatsapp',
] as const

export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number]

/**
 * Zernio's connect enum uses `twitter` for X. We surface `x` everywhere in our
 * code (it matches `/accounts` SocialAccount.platform), and translate to the
 * connect-endpoint slug at the boundary. All other slugs are identical between
 * the two endpoints.
 */
export function connectPlatformSlug(platform: ZernioPlatform): string {
  return platform === 'x' ? 'twitter' : platform
}

/** Human display label per platform. */
export const ZERNIO_PLATFORM_LABELS: Record<ZernioPlatform, string> = {
  googlebusiness: 'Google Business Profile',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
  x: 'X',
  reddit: 'Reddit',
  bluesky: 'Bluesky',
  telegram: 'Telegram',
  snapchat: 'Snapchat',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
}

/** Short icon hint (emoji) per platform — the UI maps these to real glyphs. */
export const ZERNIO_PLATFORM_ICONS: Record<ZernioPlatform, string> = {
  googlebusiness: '📍',
  facebook: '📘',
  instagram: '📸',
  linkedin: '💼',
  tiktok: '🎵',
  youtube: '▶️',
  threads: '🧵',
  pinterest: '📌',
  x: '✖️',
  reddit: '👽',
  bluesky: '🦋',
  telegram: '✈️',
  snapchat: '👻',
  discord: '🎮',
  whatsapp: '💬',
}

/**
 * A connected account as Zernio returns it (its `SocialAccount` schema),
 * narrowed to the fields we persist + render. `profileId` can come back as
 * either a bare id string OR an embedded Profile object, so the parser
 * normalizes it to a string.
 */
export interface ZernioAccount {
  /** Zernio's internal account id (`_id`). */
  id: string
  platform: ZernioPlatform | string
  /** Parent profile id (always normalized to a string). */
  profileId: string
  username: string | null
  displayName: string | null
  profilePicture: string | null
  profileUrl: string | null
}

export type ZernioConnectionStatus = 'disconnected' | 'connected' | 'error'

/** The connection + its accounts, shaped for the Integrations UI. */
export interface ZernioConnectionView {
  status: ZernioConnectionStatus
  zernioProfileId: string | null
  lastError: string | null
  isDemo: boolean
  /** Google Business accounts only (the foundation scope). */
  googleBusinessAccounts: ZernioAccount[]
}

/** Query-string key the connect callback / return URL uses to flag a fresh
 *  connection (so the Integrations page can auto-refresh). */
export const ZERNIO_CONNECTED_QS = 'connected'
