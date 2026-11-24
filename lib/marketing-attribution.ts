/**
 * Marketing-site attribution — the PURE core of the acquisition sensor layer
 * (docs/marketing-engine.md, slice 1). Client/edge-safe on purpose: the
 * middleware (edge runtime) writes the first-touch cookie, the beacon
 * (client) reports pageviews, and the server stamps signups — all three
 * share these shapes and rules, so classification can never disagree
 * between the visit count and the signup stamp.
 *
 * Design decisions (from the research foundation):
 *  - FIRST-touch attribution, held in a cookie until a signup happens.
 *    No per-visitor DB rows, no fingerprinting — the visit rollup is
 *    aggregate-only (day × path × channel) and the only durable
 *    per-person record is the one stamped on a clinic that actually
 *    signed up.
 *  - Channels are a CLOSED registry. The dials (slice 3) hang budgets and
 *    kill bars off these ids, so a free-text channel would silently fall
 *    out of every report. Unknown combinations degrade to 'referral' /
 *    'direct', never to a new string.
 *  - 'ai_assistant' is a first-class channel: 51% of B2B software buyers
 *    now start research in a chatbot (G2, 2026), and those referrers
 *    would otherwise vanish into 'referral' exactly when the owner most
 *    needs to see them.
 */

/** Cookie that carries a visitor's first touch until they sign up. */
export const ATTRIBUTION_COOKIE = 'dc_attr'

/** First-touch memory window. 90 days ≈ the research's CAC lag horizon. */
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60

/** Storage caps — a hostile query string must never bloat a cookie or row. */
export const ATTRIBUTION_FIELD_MAX_LEN = 160
export const ATTRIBUTION_PATH_MAX_LEN = 256

/**
 * The closed channel registry, in display order. Keep ids stable — they are
 * stored in marketing_pageview rows and signup_attribution stamps.
 */
export const MARKETING_CHANNELS = [
  'powered_by',
  'grader',
  'google_ads',
  'microsoft_ads',
  'meta_ads',
  'organic_search',
  'ai_assistant',
  'social',
  'email',
  'association',
  'referral',
  'direct',
] as const
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number]

/** Owner-facing labels (platform tenant voice — this surface never serves clinics). */
export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  powered_by: 'Powered-by links',
  grader: 'Practice grader',
  google_ads: 'Google Ads',
  microsoft_ads: 'Microsoft Ads',
  meta_ads: 'Meta ads',
  organic_search: 'Search',
  ai_assistant: 'AI assistants',
  social: 'Social',
  email: 'Email',
  association: 'Associations',
  referral: 'Other sites',
  direct: 'Direct',
}

/**
 * THE CLICK IDS WE KEEP THE VALUE OF, in the order a URL is searched for them.
 *
 * The sensor used to record only THAT a click id was present (`gclid: true`),
 * which is enough to name the channel and useless for everything after it:
 * reporting a trial or a paying practice back to the ad platform — the only
 * way it can tell which searches produce customers — takes the id itself.
 * Google moved those uploads to its Data Manager on 2026-06-15 and its help
 * page says the click id is "required if you're not using a tag to collect
 * user-provided data"; we deliberately run no ad-platform tag on a domain that
 * also serves patient-facing clinic sites, so the id is the whole mechanism.
 *
 * `gbraid` / `wbraid` are what Google sends INSTEAD of `gclid` on iOS traffic.
 * The old sensor did not look for them at all, so those ad clicks were filed
 * under organic search or direct.
 *
 * Meta's `fbclid` is deliberately absent: it still CLASSIFIES a touch (below),
 * but nothing uploads to Meta, and a 200-character value riding every request
 * in a cookie for no reader is weight without a job.
 */
export const AD_CLICK_ID_KINDS = ['gclid', 'gbraid', 'wbraid', 'msclkid'] as const
export type AdClickIdKind = (typeof AD_CLICK_ID_KINDS)[number]
export interface AdClickId {
  kind: AdClickIdKind
  value: string
}

/** Longest click id we store. A real one runs ~30–110 characters. */
export const AD_CLICK_ID_MAX_LEN = 256

/** RFC 3986 "unreserved" characters only — a click id is an opaque token, and
 *  nothing outside this set has any business in a cookie or a jsonb column. */
const AD_CLICK_ID_SHAPE = /^[A-Za-z0-9._~-]+$/

/**
 * Validate one click id. CASE IS PRESERVED — the ids are case-sensitive, which
 * is why this does not go through `cleanParam` (it lowercases). An over-long
 * value is REJECTED, never truncated: a clipped id matches no click, so
 * keeping it would be storing a lie that looks like data.
 */
export function readAdClickId(kind: unknown, value: unknown): AdClickId | null {
  if (typeof kind !== 'string' || !(AD_CLICK_ID_KINDS as readonly string[]).includes(kind)) return null
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v || v.length > AD_CLICK_ID_MAX_LEN || !AD_CLICK_ID_SHAPE.test(v)) return null
  return { kind: kind as AdClickIdKind, value: v }
}

const GOOGLE_CLICK_ID_KINDS: readonly AdClickIdKind[] = ['gclid', 'gbraid', 'wbraid']

/** What the sensor captures about a first touch. All fields already capped. */
export interface AttributionTouch {
  /** Closed-registry channel, classified once at capture. */
  channel: MarketingChannel
  /** Landing path on www ('/', '/pricing', …) — query stripped. */
  landing: string
  /** Referrer HOST only ('www.google.com') — never the full URL (privacy + size). */
  referrerHost: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  /** The search keyword the ad click carried (`utm_term`, filled by the ad
   *  platform from the campaign's URL suffix). Null on anything else. */
  utmTerm: string | null
  /** The ad platform's click id WITH its value — what a conversion upload
   *  needs. Null when the touch carried none, or one we could not validate. */
  clickId: AdClickId | null
  /** ISO instant of the first touch. */
  firstSeenAt: string
}

/**
 * What the sensor remembers about a visitor: the FIRST touch (never
 * overwritten — the dials measure what started the journey) plus the most
 * recent TAGGED touch (a later ad click, sponsorship link, or referral that
 * would otherwise be invisible behind a months-old direct first touch).
 * `last` is null until a tagged touch follows the first.
 */
export interface AttributionMemory {
  first: AttributionTouch
  last: AttributionTouch | null
}

/** A touch worth remembering as "last": anything the sensor could classify
 *  beyond a bare direct visit. */
export function isTaggedTouch(touch: AttributionTouch): boolean {
  return touch.channel !== 'direct'
}

/** Campaign cap for the ROLLUP key (tighter than the cookie cap — this one
 *  becomes table rows). */
export const CAMPAIGN_KEY_MAX_LEN = 80

/**
 * Normalize a utm_campaign into the rollup's campaign key: lowercase,
 * [a-z0-9._-] only (everything else collapses to '-'), capped. '' = no
 * campaign — the column defaults to '' rather than NULL so the unique index
 * treats "no campaign" as one bucket on every Postgres version.
 */
export function campaignKeyOf(utmCampaign: string | null | undefined): string {
  if (!utmCampaign || typeof utmCampaign !== 'string') return ''
  const key = utmCampaign
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return key.slice(0, CAMPAIGN_KEY_MAX_LEN)
}

/** The utm_source the Powered-by footer stamps — the loop's attribution marker. */
export const POWERED_BY_UTM_SOURCE = 'powered_by'

/** The utm_source the grader's report email stamps — a report link opened
 *  later (often on another device) classifies as its own channel. */
export const GRADER_UTM_SOURCE = 'grader'

/**
 * The utm_source every ASSOCIATION artifact stamps (docs/marketing-engine.md
 * Part 10.8 — the state-association beachhead): the conference headshot
 * delivery, the member-benefit page on the association's own site, the
 * keynote QR. The campaign key names the association + year ('asda-2026'),
 * so one channel row rolls up every association and the campaign column
 * tells them apart.
 */
export const ASSOCIATION_UTM_SOURCE = 'association'

/**
 * The Powered-by footer's destination: the marketing home, tagged so the
 * click classifies as 'powered_by' and the campaign names the referring
 * clinic. `base` must be the app origin WITHOUT a trailing slash.
 */
export function buildPoweredByUrl(base: string, slug: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  const cleanSlug = encodeURIComponent(slug)
  return `${cleanBase}/?utm_source=${POWERED_BY_UTM_SOURCE}&utm_medium=referral&utm_campaign=${cleanSlug}`
}

/** Referrer hosts that mean "an AI assistant sent them". Suffix-matched. */
const AI_ASSISTANT_HOSTS = [
  'chatgpt.com',
  'chat.openai.com',
  'perplexity.ai',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'you.com',
]

/** Referrer hosts that mean organic search (when no paid click id rode along). */
const SEARCH_HOSTS = ['google.', 'bing.com', 'duckduckgo.com', 'search.yahoo.', 'ecosia.org', 'search.brave.com']

/** Referrer hosts that mean organic social. */
const SOCIAL_HOSTS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  't.co',
  'lnkd.in',
  'fb.me',
]

function hostMatches(host: string, needles: string[]): boolean {
  return needles.some((n) => (n.endsWith('.') ? host.includes(n) : host === n || host.endsWith('.' + n)))
}

/** Lowercase + trim + cap a captured free-text param. Empty → null. */
function cleanParam(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().slice(0, ATTRIBUTION_FIELD_MAX_LEN)
  return v || null
}

/** Extract just the hostname from a Referer value; junk degrades to null. */
export function referrerHostOf(referrer: string | null | undefined): string | null {
  if (!referrer || typeof referrer !== 'string') return null
  try {
    const host = new URL(referrer).hostname.trim().toLowerCase()
    return host ? host.slice(0, ATTRIBUTION_FIELD_MAX_LEN) : null
  } catch {
    return null
  }
}

export interface ClassifyInput {
  utmSource?: string | null
  utmMedium?: string | null
  /** A Google Ads click id (`gclid`, or iOS's `gbraid` / `wbraid`) present in the landing URL. */
  gclid?: boolean
  /** Microsoft Advertising's click id present in the landing URL. */
  msclkid?: boolean
  /** Meta click id present in the landing URL. */
  fbclid?: boolean
  /** Referrer HOST (already extracted). */
  referrerHost?: string | null
  /** The www host itself, so self-referrals (internal navigation) read as direct. */
  selfHost?: string | null
}

/**
 * Classify one touch into the closed channel registry. Paid markers beat
 * organic referrers beat direct; explicit UTM intent beats inference.
 * Deterministic and total — every input lands in exactly one channel.
 */
export function classifyChannel(input: ClassifyInput): MarketingChannel {
  const source = cleanParam(input.utmSource)
  const medium = cleanParam(input.utmMedium)
  const host = cleanParam(input.referrerHost)
  const self = cleanParam(input.selfHost)
  const ref = host && self && (host === self || host.endsWith('.' + self)) ? null : host

  // 1. Our own explicit markers first — they exist to beat inference.
  if (source === POWERED_BY_UTM_SOURCE) return 'powered_by'
  if (source === GRADER_UTM_SOURCE) return 'grader'
  if (source === ASSOCIATION_UTM_SOURCE || medium === ASSOCIATION_UTM_SOURCE) return 'association'

  // 2. Paid click ids / paid UTM intent.
  //    Microsoft is asked FIRST among the search platforms: a campaign
  //    imported from Google keeps its `utm_source=google` suffix unless
  //    somebody edits it, so on a Bing click the click id is the truth and the
  //    UTM is a leftover. Until 2026-11 `source=bing` was filed under Google
  //    Ads, which would have charged one platform's trials to the other's
  //    budget the day a second platform was switched on.
  const paidMedium = medium === 'cpc' || medium === 'ppc' || medium === 'paid' || medium === 'paid_social'
  if (input.msclkid || (paidMedium && (source === 'bing' || source === 'microsoft'))) return 'microsoft_ads'
  if (input.gclid || (paidMedium && (source === 'google' || !source))) return 'google_ads'
  if (
    input.fbclid ||
    (paidMedium && (source === 'facebook' || source === 'meta' || source === 'instagram'))
  )
    return 'meta_ads'

  // 3. Explicit UTM channel intent (a newsletter link, a tagged social post).
  if (medium === 'email' || source === 'newsletter' || source === 'email') return 'email'
  if (medium === 'social' || medium === 'organic_social') return 'social'

  // 4. Referrer inference.
  if (ref) {
    if (hostMatches(ref, AI_ASSISTANT_HOSTS)) return 'ai_assistant'
    if (hostMatches(ref, SEARCH_HOSTS)) return 'organic_search'
    if (hostMatches(ref, SOCIAL_HOSTS)) return 'social'
    return 'referral'
  }

  // 5. A UTM source with no medium/referrer we recognize is still a tagged
  //    campaign of SOME kind — keep it visible as referral, not direct.
  if (source || medium) return 'referral'

  return 'direct'
}

/** Normalize a landing path: strip query/fragment, collapse, cap. Mirrors the
 *  clinic beacon's normalizeSitePath rules so the two rollups bucket alike. */
export function normalizeLandingPath(raw: string | null | undefined): string {
  if (!raw) return '/'
  let p = String(raw)
  const q = p.search(/[?#]/)
  if (q !== -1) p = p.slice(0, q)
  p = p.trim()
  if (!p) return '/'
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/{2,}/g, '/')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  if (!p) p = '/'
  return p.slice(0, ATTRIBUTION_PATH_MAX_LEN)
}

/**
 * Build the touch a first visit captures. `search` is the raw query string
 * ('?utm_source=…' or ''), `referrer` the raw Referer header/document value.
 */
export function buildAttributionTouch(input: {
  path: string | null | undefined
  search: string | null | undefined
  referrer: string | null | undefined
  selfHost?: string | null
  now?: Date
}): AttributionTouch {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(input.search ?? '')
  } catch {
    params = new URLSearchParams()
  }
  const utmSource = cleanParam(params.get('utm_source'))
  const utmMedium = cleanParam(params.get('utm_medium'))
  const utmCampaign = cleanParam(params.get('utm_campaign'))
  const utmTerm = cleanParam(params.get('utm_term'))
  const referrerHost = referrerHostOf(input.referrer)
  // The first kind present wins, in registry order. PRESENCE classifies the
  // touch even when the value fails validation — a malformed `gclid` is still
  // an ad click; it just leaves nothing worth uploading.
  let clickId: AdClickId | null = null
  for (const kind of AD_CLICK_ID_KINDS) {
    clickId = readAdClickId(kind, params.get(kind))
    if (clickId) break
  }
  const channel = classifyChannel({
    utmSource,
    utmMedium,
    gclid: GOOGLE_CLICK_ID_KINDS.some((kind) => params.has(kind)),
    msclkid: params.has('msclkid'),
    fbclid: params.has('fbclid'),
    referrerHost,
    selfHost: input.selfHost ?? null,
  })
  return {
    channel,
    landing: normalizeLandingPath(input.path),
    referrerHost,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    clickId,
    firstSeenAt: (input.now ?? new Date()).toISOString(),
  }
}

/** Compact cookie form (versioned, short keys — cookies ride every request).
 *  v1 carried one touch flat; v2 carries {f: first, z: last|null} in the
 *  same short-key shape. v1 cookies keep parsing (as first-only) so the
 *  90-day memories set before the upgrade survive it. */
interface CookieTouchV1 {
  c: string
  l: string
  r: string | null
  s: string | null
  m: string | null
  g: string | null
  t: string
  /** utm_term. OPTIONAL, and omitted when empty — added 2026-11 without a
   *  version bump, so the 90-day memories already in browsers keep parsing
   *  and a touch with no keyword costs the cookie nothing. */
  k?: string
  /** Click id kind + value, same rule: present only when there is one. */
  i?: string
  x?: string
}
interface CookiePayloadV2 {
  v: 2
  f: CookieTouchV1
  z: CookieTouchV1 | null
}

function packTouch(touch: AttributionTouch): CookieTouchV1 {
  return {
    c: touch.channel,
    l: touch.landing,
    r: touch.referrerHost,
    s: touch.utmSource,
    m: touch.utmMedium,
    g: touch.utmCampaign,
    t: touch.firstSeenAt,
    ...(touch.utmTerm ? { k: touch.utmTerm } : {}),
    ...(touch.clickId ? { i: touch.clickId.kind, x: touch.clickId.value } : {}),
  }
}

/** Re-validate one packed touch. Cookie content is CLIENT INPUT: channel
 *  must be in the registry, strings re-capped, dates real — anything
 *  malformed returns null. */
function unpackTouch(p: unknown): AttributionTouch | null {
  if (typeof p !== 'object' || p === null) return null
  const t = p as Partial<CookieTouchV1>
  const channel = typeof t.c === 'string' && (MARKETING_CHANNELS as readonly string[]).includes(t.c)
    ? (t.c as MarketingChannel)
    : null
  if (!channel) return null
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, ATTRIBUTION_FIELD_MAX_LEN) : null
  const firstSeenAt = (() => {
    if (typeof t.t !== 'string') return null
    const d = new Date(t.t)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  })()
  if (!firstSeenAt) return null
  return {
    channel,
    landing: normalizeLandingPath(typeof t.l === 'string' ? t.l : '/'),
    referrerHost: str(t.r),
    utmSource: str(t.s),
    utmMedium: str(t.m),
    utmCampaign: str(t.g),
    utmTerm: str(t.k),
    clickId: readAdClickId(t.i, t.x),
    firstSeenAt,
  }
}

/** Serialize the visitor's attribution memory (URI-safe JSON, v2). */
export function serializeAttributionCookie(memory: AttributionMemory): string {
  const payload: CookiePayloadV2 = {
    v: 2,
    f: packTouch(memory.first),
    z: memory.last ? packTouch(memory.last) : null,
  }
  return encodeURIComponent(JSON.stringify(payload))
}

/**
 * Parse the attribution cookie back into a memory. A tampered or malformed
 * payload degrades to null ("no attribution"), never a poisoned stamp; a
 * v2 payload whose `last` half is malformed keeps its valid first touch.
 */
export function parseAttributionCookie(raw: string | null | undefined): AttributionMemory | null {
  if (!raw || typeof raw !== 'string') return null
  let payload: unknown
  try {
    payload = JSON.parse(decodeURIComponent(raw))
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const versioned = payload as { v?: unknown; f?: unknown; z?: unknown }
  if (versioned.v === 2) {
    const first = unpackTouch(versioned.f)
    if (!first) return null
    return { first, last: unpackTouch(versioned.z) }
  }
  if (versioned.v === 1) {
    const first = unpackTouch(payload)
    if (!first) return null
    return { first, last: null }
  }
  return null
}

/**
 * The shape stamped into clinic_profile.signup_attribution — the durable
 * record. The top-level fields are the FIRST touch (the report's primary
 * key by owner ruling); `last` preserves the most recent tagged touch so a
 * journey like organic-first → ad-click-later stays visible to the CAC
 * math. Kept as its own type so the stamp can evolve without the cookie
 * following.
 */
export interface SignupAttribution extends AttributionTouch {
  signedUpAt: string
  /** Most recent tagged touch before signup, when one followed the first. */
  last?: AttributionTouch | null
}

/** Read a stored `{ kind, value }` click id with the same validation a cookie gets. */
function clickIdOf(raw: unknown): AdClickId | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  return readAdClickId(o.kind, o.value)
}

/** Validate a stored signup_attribution jsonb back into a typed stamp.
 *  Unknown/malformed → null (the funnel then counts it as 'untracked'). */
export function parseSignupAttribution(raw: unknown): SignupAttribution | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const channel =
    typeof r.channel === 'string' && (MARKETING_CHANNELS as readonly string[]).includes(r.channel)
      ? (r.channel as MarketingChannel)
      : null
  if (!channel) return null
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, ATTRIBUTION_FIELD_MAX_LEN) : null
  const iso = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const firstSeenAt = iso(r.firstSeenAt)
  const signedUpAt = iso(r.signedUpAt)
  if (!firstSeenAt || !signedUpAt) return null
  // The nested last touch is validated with the SAME rules as a cookie
  // touch; a malformed one degrades to null without costing the stamp.
  const last = (() => {
    const l = r.last
    if (typeof l !== 'object' || l === null) return null
    const lr = l as Record<string, unknown>
    const lChannel =
      typeof lr.channel === 'string' && (MARKETING_CHANNELS as readonly string[]).includes(lr.channel)
        ? (lr.channel as MarketingChannel)
        : null
    const lSeen = iso(lr.firstSeenAt)
    if (!lChannel || !lSeen) return null
    return {
      channel: lChannel,
      landing: normalizeLandingPath(typeof lr.landing === 'string' ? lr.landing : '/'),
      referrerHost: str(lr.referrerHost),
      utmSource: str(lr.utmSource),
      utmMedium: str(lr.utmMedium),
      utmCampaign: str(lr.utmCampaign),
      utmTerm: str(lr.utmTerm),
      clickId: clickIdOf(lr.clickId),
      firstSeenAt: lSeen,
    }
  })()
  return {
    channel,
    landing: normalizeLandingPath(typeof r.landing === 'string' ? r.landing : '/'),
    referrerHost: str(r.referrerHost),
    utmSource: str(r.utmSource),
    utmMedium: str(r.utmMedium),
    utmCampaign: str(r.utmCampaign),
    utmTerm: str(r.utmTerm),
    clickId: clickIdOf(r.clickId),
    firstSeenAt,
    signedUpAt,
    last,
  }
}

/**
 * THE CLICK ID AN UPLOAD FOR ONE PLATFORM SHOULD CARRY: the most recent touch
 * that came from that platform — `last` if it has one, else the first touch.
 *
 * Most recent, because the platform attributes a conversion to the click it
 * can still see; a journey that began on a Google ad in March and came back
 * through another Google ad in May is May's click. And per PLATFORM, because a
 * Microsoft id handed to Google matches nothing: a stamp whose last touch was
 * a Bing click and whose first was a Google one has an answer for each.
 * Null when no touch came from that platform — the signup is then simply not
 * that platform's to hear about.
 */
export function adClickIdFor(stamp: Pick<SignupAttribution, 'clickId' | 'last'>, platform: 'google' | 'microsoft'): AdClickId | null {
  const kinds: readonly AdClickIdKind[] = platform === 'google' ? GOOGLE_CLICK_ID_KINDS : ['msclkid']
  for (const touch of [stamp.last, stamp]) {
    const id = touch?.clickId
    if (id && kinds.includes(id.kind)) return id
  }
  return null
}
