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
 * The CURATED dentist shortlist of social platforms we surface for connection
 * (Phase 3 PR 2). Deliberately a small set — we offer ONLY these (plus Google
 * Business, which is separate + free) to control Zernio per-account cost and
 * keep the clinic focused on the channels a dental practice actually uses. The
 * other 9 Zernio platforms (X / WhatsApp / Reddit / Telegram / Discord /
 * Bluesky / Threads / Snapchat / Pinterest) are intentionally NOT offered.
 *
 * Defined as a single constant so widening (or narrowing) the offering is one
 * edit. Google Business is NOT in this list — it's free, never counts toward the
 * social cap, and has its own dedicated row in the Channels UI.
 */
export const SOCIAL_CHANNEL_SHORTLIST = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
] as const

export type SocialChannelPlatform = (typeof SOCIAL_CHANNEL_SHORTLIST)[number]

/** Type guard — is this a shortlisted social platform (NOT GBP)? */
export function isSocialChannelPlatform(platform: string): platform is SocialChannelPlatform {
  return (SOCIAL_CHANNEL_SHORTLIST as readonly string[]).includes(platform)
}

/**
 * The Google Business slug (free + separate from the social shortlist; never
 * counts toward the social cap). A named constant so call sites read intent.
 */
export const GOOGLE_BUSINESS_PLATFORM = 'googlebusiness' as const

/**
 * Every platform CONNECTABLE from the Channels surface = GBP + the social
 * shortlist. The connect route validates an incoming `platform` against this
 * (rejecting the 9 non-offered Zernio slugs).
 */
export const CONNECTABLE_PLATFORMS = [
  GOOGLE_BUSINESS_PLATFORM,
  ...SOCIAL_CHANNEL_SHORTLIST,
] as const

/** Whether a platform slug can be connected from the Channels surface (GBP or a
 *  shortlisted social platform). */
export function isConnectablePlatform(platform: string): platform is ZernioPlatform {
  return (CONNECTABLE_PLATFORMS as readonly string[]).includes(platform)
}

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

/** The connection + its accounts, shaped for the Integrations / Channels UI. */
export interface ZernioConnectionView {
  status: ZernioConnectionStatus
  zernioProfileId: string | null
  lastError: string | null
  isDemo: boolean
  /** Google Business accounts only (back-compat for the GBP card; equals
   *  `accounts` filtered to `platform === 'googlebusiness'`). */
  googleBusinessAccounts: ZernioAccount[]
  /** EVERY connected account across all platforms (GBP + social). The Channels
   *  surface groups these per platform; the GBP-only callers ignore it. */
  accounts: ZernioAccount[]
}

/**
 * One row in the Channels surface's social section: a shortlisted platform +
 * whether it's connected + (when connected) the account. Built by the page from
 * `ZernioConnectionView.accounts` filtered per platform. Client-safe.
 */
export interface SocialChannelView {
  platform: SocialChannelPlatform
  label: string
  icon: string
  /** The connected account, or null when this platform isn't connected. */
  account: ZernioAccount | null
}

/** Query-string key the connect callback / return URL uses to flag a fresh
 *  connection (so the Integrations page can auto-refresh). */
export const ZERNIO_CONNECTED_QS = 'connected'

// ── Google Business Profile field sync (hours / address / phone / photos) ─────

/**
 * Provenance of a synced clinic_profile field. `'manual'` = the clinic typed it
 * (or it was never synced); `'google'` = last written by a Google Business
 * Profile sync. Stored on `clinic_profile.{hours,address,phone}_source`. An
 * automatic sync only overwrites a `'google'` field; an explicit user-initiated
 * sync may overwrite a `'manual'` one. Editing a field flips it back to manual.
 */
export type FieldSource = 'manual' | 'google'

/** The three clinic_profile field groups the Google sync can write. */
export type SyncableField = 'hours' | 'address' | 'phone'

export const SYNCABLE_FIELDS: readonly SyncableField[] = ['hours', 'address', 'phone'] as const

/** Human label per syncable field, for the settings UI. */
export const SYNCABLE_FIELD_LABELS: Record<SyncableField, string> = {
  hours: 'Office hours',
  address: 'Address',
  phone: 'Phone number',
}

/** A Google Business photo as surfaced to the import-from-Google gallery.
 *  Mirrors `GooglePhoto` in lib/zernio.ts but client-safe. */
export interface GooglePhotoView {
  url: string
  sourceUrl: string | null
  category: string | null
}

/**
 * Everything the Settings → hours/location "Sync from Google" UI needs to
 * render honest per-field provenance + the import-photos gallery, without the
 * server-only service. Returned by `getGbpSyncState`.
 */
export interface GbpSyncState {
  /** Whether a Google Business Profile is connected (demo or real). */
  connected: boolean
  /** Whether that connection is the demo (no-network) one. */
  isDemo: boolean
  /** Per-field source flag. */
  sources: Record<SyncableField, FieldSource>
  /** ISO timestamp of the last sync, or null if never synced. */
  lastSyncedAtIso: string | null
  /** Photos pulled from Google, available to import into officePhotos. */
  googlePhotos: GooglePhotoView[]
  /** URLs already present in the curated officePhotos (so the picker can
   *  mark photos that are already imported). */
  importedPhotoUrls: string[]
}

/** Result of a "Sync from Google" run, surfaced inline in the UI. */
export interface GbpSyncResult {
  ok: boolean
  /** Field groups that were updated this run (e.g. ['hours', 'phone']). */
  applied: SyncableField[]
  /** Field groups skipped because they carry a manual edit (non-force only). */
  skippedManual: SyncableField[]
  /** How many Google photos are now available to import. */
  photoCount: number
  /** Set when nothing happened for a structural reason (not an error). */
  skipped?: 'no_connection'
  error?: string
}

// ── Google Business post fields (Phase 2 — used by the GBP target) ────────────
//
// Client-safe mirrors of the GBP-post field types in lib/zernio.ts. These remain
// the GBP-specific shape (post type / CTA / event / offer) the unified composer
// shows only when Google Business is a selected target. The multi-channel view
// types live further down (SocialPostView etc.); the service is
// lib/services/social-posts.ts.

/** Google Business post type. `standard` = What's-new update; `event` carries a
 *  date range; `offer` carries a coupon/redeem URL. */
export const GBP_POST_TYPES = ['standard', 'event', 'offer'] as const
export type GbpPostType = (typeof GBP_POST_TYPES)[number]

/** Human label per post type (composer selector + history badge). */
export const GBP_POST_TYPE_LABELS: Record<GbpPostType, string> = {
  standard: 'Update',
  event: 'Event',
  offer: 'Offer',
}

/** Google Business CTA button action types (Google's `actionType` enum). */
export const GBP_CTA_TYPES = ['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'] as const
export type GbpCtaType = (typeof GBP_CTA_TYPES)[number]

/** Human label per CTA action type (composer picker). */
export const GBP_CTA_LABELS: Record<GbpCtaType, string> = {
  LEARN_MORE: 'Learn more',
  BOOK: 'Book',
  ORDER: 'Order online',
  SHOP: 'Shop',
  SIGN_UP: 'Sign up',
  CALL: 'Call now',
}

/** CALL uses the listing's phone number — every other CTA needs a URL. */
export function ctaNeedsUrl(actionType: GbpCtaType): boolean {
  return actionType !== 'CALL'
}

/** Max post body length Google allows (matches Zernio's GBP limit). */
export const GBP_POST_MAX_CHARS = 1500

/** Publish status of a persisted GBP post. */
export type GbpPostStatus = 'draft' | 'scheduled' | 'published' | 'failed'

/** A persisted GBP post, shaped for the history view (client-safe). */
export interface GbpPostView {
  id: string
  postType: GbpPostType
  summary: string
  imageUrl: string | null
  ctaType: GbpCtaType | null
  ctaUrl: string | null
  eventTitle: string | null
  eventStartAtIso: string | null
  eventEndAtIso: string | null
  offerCouponCode: string | null
  offerRedeemUrl: string | null
  offerTerms: string | null
  status: GbpPostStatus
  scheduledAtIso: string | null
  publishedAtIso: string | null
  googleUrl: string | null
  lastError: string | null
  createdAtIso: string
}

/** The composer's submit payload (server action input). */
export interface CreateGbpPostFormInput {
  postType: GbpPostType
  summary: string
  imageUrl?: string | null
  ctaType?: GbpCtaType | null
  ctaUrl?: string | null
  eventTitle?: string | null
  /** ISO datetime-local strings from the form (event start/end). */
  eventStartAt?: string | null
  eventEndAt?: string | null
  offerCouponCode?: string | null
  offerRedeemUrl?: string | null
  offerTerms?: string | null
  /** ISO datetime-local string; when set, schedule for later. */
  scheduledAt?: string | null
}

// ── Social posts (Phase 3 — unified multi-platform composer) ──────────────────
//
// Client-safe types for the multi-channel composer + history + content calendar.
// A composed post fans out to one or more connected channels (GBP + social); a
// GBP-only post is just a 1-target social post. The GBP-specific fields
// (postType / CTA / event / offer) only apply when Google Business is a target.

/** Per-platform body-length guidance for the composer's counter/warnings. We
 *  don't HARD-break a long post — we WARN. GBP allows 1,500; the socials vary
 *  (Instagram captions ~2,200, Facebook very long, TikTok ~2,200, YouTube
 *  ~5,000, LinkedIn ~3,000). The composer's hard cap is the GBP limit when GBP
 *  is targeted, else a generous social ceiling. */
export const PLATFORM_POST_LIMITS: Record<string, number> = {
  googlebusiness: 1500,
  instagram: 2200,
  facebook: 5000,
  tiktok: 2200,
  youtube: 5000,
  linkedin: 3000,
}

/** The most generous ceiling across the social channels — the composer's hard
 *  cap when GBP is NOT targeted (so a long social-only post isn't blocked at
 *  the GBP 1,500 limit). */
export const SOCIAL_POST_MAX_CHARS = 2200

/** Resolve the composer's hard character cap for a given set of targeted
 *  platforms. If Google Business is among them, the tightest limit (1,500)
 *  governs; otherwise the generous social ceiling applies. */
export function postCharLimitForTargets(platforms: readonly string[]): number {
  if (platforms.includes('googlebusiness')) return GBP_POST_MAX_CHARS
  if (platforms.length === 0) return SOCIAL_POST_MAX_CHARS
  return Math.min(...platforms.map((p) => PLATFORM_POST_LIMITS[p] ?? SOCIAL_POST_MAX_CHARS))
}

/** One channel a composed post can target — a connected account, surfaced to
 *  the composer's channel picker. */
export interface ComposerChannel {
  /** The Zernio account id (also the local zernio_account id). */
  accountId: string
  platform: ZernioPlatform | string
  label: string
  icon: string
  /** Display handle (username or display name), for the picker row. */
  handle: string | null
}

/** Per-channel publish outcome on a persisted social post (history/calendar). */
export interface SocialPostTargetView {
  id: string
  platform: ZernioPlatform | string
  /** Human label for the platform. */
  label: string
  /** Emoji icon for the platform. */
  icon: string
  status: GbpPostStatus
  /** Live permalink when the channel returned one, else null. */
  url: string | null
  lastError: string | null
  publishedAtIso: string | null
}

/** A persisted social post, shaped for the history + calendar views. Carries the
 *  shared composed content (with the GBP-only fields) plus the per-channel
 *  targets. `status` is the parent rollup. */
export interface SocialPostView {
  id: string
  postType: GbpPostType
  summary: string
  imageUrl: string | null
  ctaType: GbpCtaType | null
  ctaUrl: string | null
  eventTitle: string | null
  eventStartAtIso: string | null
  eventEndAtIso: string | null
  offerCouponCode: string | null
  offerRedeemUrl: string | null
  offerTerms: string | null
  /** Parent rollup status across the targets. */
  status: GbpPostStatus
  scheduledAtIso: string | null
  publishedAtIso: string | null
  createdAtIso: string
  /** The channels this post targeted, with per-channel outcome. */
  targets: SocialPostTargetView[]
}

/** The multi-channel composer's submit payload (server action input). Extends
 *  the GBP form input with the targeted account ids; the GBP-only fields are
 *  honored only when a Google Business account is among the targets. */
export interface CreateSocialPostFormInput extends CreateGbpPostFormInput {
  /** The Zernio account ids to publish to (≥1). */
  accountIds: string[]
}

/** Resolve the platform label for any slug (shortlist + GBP) with a safe
 *  fallback for an unknown one. */
export function platformLabel(platform: string): string {
  return (ZERNIO_PLATFORM_LABELS as Record<string, string>)[platform] ?? platform
}

/** Resolve the platform icon for any slug, with a generic fallback. */
export function platformIcon(platform: string): string {
  return (ZERNIO_PLATFORM_ICONS as Record<string, string>)[platform] ?? '🔗'
}
