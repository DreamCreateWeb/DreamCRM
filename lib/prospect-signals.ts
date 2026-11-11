import type { ProspectCrawlSignals } from '@/lib/types/prospecting'
import { isJunkEmail, parseEmail } from '@/lib/prospect-email'

/**
 * Pure crawl-signal extraction — regex over raw homepage HTML (the repo has
 * no HTML-parser dep and doesn't need one for these coarse signals). The
 * fetch itself lives in lib/services/prospect-enrich.ts; keeping the
 * extractor pure makes the whole signal surface unit-testable with HTML
 * fixtures.
 */

const BOOKING_MARKERS =
  /(localmed|nexhealth|flexbook|zocdoc|solutionreach|lighthouse\s*360|denticon|curve\s*hero|book\s+(online|now|an?\s+appointment)|schedule\s+(online|now|an?\s+appointment)|request\s+an?\s+appointment)/i

// DIY builders first, then the dental template vendors (P-04 — a ProSites
// or PBHS site is usually WordPress underneath, so the vendor must win),
// WordPress last. Keys are BUILDER_LABELS keys.
const BUILDER_FINGERPRINTS: Array<[RegExp, string]> = [
  [/wixstatic\.com|wix\.com\/website/i, 'wix'],
  [/squarespace\.com|squarespace-cdn/i, 'squarespace'],
  [/godaddy\.com|website-builder|wsimg\.com/i, 'godaddy'],
  [/weebly\.com|weeblycloud/i, 'weebly'],
  [/prosites\.com|prosites/i, 'prosites'],
  [/pbhs\.com|pbhs/i, 'pbhs'],
  [/officite\.com|officite/i, 'officite'],
  [/tntdental\.com|tntdental/i, 'tntdental'],
  [/wp-content|wp-includes|wordpress/i, 'wordpress'],
]

/**
 * THE COMPETITOR STACK (P-04) — booking widgets and review / messaging
 * engines, fingerprinted on HOSTS and nothing else (fix pass): the host of
 * every `<script src>`, `<link href>` and `<iframe src>`, and the host of
 * every URL-shaped token inside an inline JAVASCRIPT body (a JSON or
 * JSON-LD script body is page copy — fix pass II). Never a bare word —
 * "we moved off NexHealth" in a blog's JSON-LD, a hydration payload or an
 * article link is not a NexHealth install. Each pattern matches a host
 * label at a dot boundary, so "localmedia.com" is not LocalMed and
 * "interweave.com" is not Weave. Names are the display names the
 * opportunity reasons use ("Already on NexHealth + Birdeye").
 */
export const STACK_FINGERPRINTS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'NexHealth', pattern: /(^|\.)nexhealth\./ },
  { name: 'Zocdoc', pattern: /(^|\.)zocdoc\./ },
  { name: 'LocalMed', pattern: /(^|\.)localmed\./ },
  { name: 'Weave', pattern: /(^|\.)(getweave|weave|weaveconnect)\./ },
  { name: 'Solutionreach', pattern: /(^|\.)(solutionreach|smilereminder)\./ },
  { name: 'RevenueWell', pattern: /(^|\.)revenuewell\./ },
  { name: 'Birdeye', pattern: /(^|\.)birdeye\./ },
  { name: 'Podium', pattern: /(^|\.)podium\./ },
  { name: 'Dentrix Ascend', pattern: /(^|\.)(dentrixascend|ascend\.dentrix)\./ },
  { name: 'Curve', pattern: /(^|\.)(curvehero|curvedental)\./ },
  { name: 'Lighthouse 360', pattern: /(^|\.)(lighthouse360|lh360)\./ },
  { name: 'Flex', pattern: /(^|\.)(flexbook|getflex|dentalintel|dental-intelligence)\./ },
  { name: 'Yapi', pattern: /(^|\.)(yapiapp|yapi)\./ },
  { name: 'Swell', pattern: /(^|\.)(swellcx|getswell)\./ },
  { name: 'Doctible', pattern: /(^|\.)doctible\./ },
  { name: 'Demandforce', pattern: /(^|\.)demandforce\./ },
  { name: 'Jane', pattern: /(^|\.)janeapp\./ },
  { name: 'Modento', pattern: /(^|\.)modento\./ },
]

/** The host of an absolute or protocol-relative http(s) URL, lower-cased;
 *  null for a relative path, another scheme or junk. */
function hostOf(url: string): string | null {
  try {
    const u = new URL(url.trim(), 'https://relative.invalid')
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const host = u.hostname.toLowerCase()
    return host && host !== 'relative.invalid' ? host : null
  } catch {
    return null
  }
}

/** The script types whose inline body is CODE — the only bodies the token
 *  scan reads (fix pass II, V12). The HTML spec's JavaScript MIME essence
 *  list in full (fix pass III, W5 — a 2010-era `application/x-javascript`
 *  or `text/ecmascript` loader is executed by every browser and must be
 *  fingerprinted like any other), plus `module` and the empty type. A
 *  `<script type="application/json">` hydration payload or an
 *  `application/ld+json` block carries the page's copy (an article link
 *  to a vendor, a sameAs), never an install. */
const JS_SCRIPT_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
  'module',
])

/** Is this `<script …>` tag's body JavaScript? No type attribute is; a
 *  `;charset=…` suffix is tolerated. */
export function isJavaScriptScriptTag(attrs: string): boolean {
  const m = attrs.match(/\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
  if (!m) return true
  const type = (m[1] ?? m[2] ?? m[3] ?? '').trim().toLowerCase().split(';')[0].trim()
  return type === '' || JS_SCRIPT_TYPES.has(type)
}

/** A JavaScript body that is a HYDRATION SINK — the page's data, not its
 *  code (fix pass III, W6): Next's App Router flight payload
 *  (`self.__next_f.push(`), Nuxt, Remix, the Vuex / Apollo / Redux
 *  preloaded-state idiom, Pages-Router Next and SvelteKit. Such a body
 *  carries the page's copy (a blog post's link to a vendor) and is skipped
 *  whole, judged by its leading non-space text. */
const HYDRATION_SINK =
  /^\s*(?:\(?self\.__next_f|window\.__NUXT__|window\.__remixContext|window\.__INITIAL_STATE__|window\.__APOLLO_STATE__|window\.__PRELOADED_STATE__|window\.__NEXT_DATA__|__sveltekit)/

/** Is this inline JavaScript body a hydration sink? Exported for tests. */
export function isHydrationSink(body: string): boolean {
  return HYDRATION_SINK.test(body)
}

/** How far back of a URL token the script-shaped anchors are looked for. */
const SCRIPT_ANCHOR_WINDOW = 120
/** The anchors that make a URL token SCRIPT-SHAPED inside a JS body: the
 *  token sits within 120 characters after `.src`, `src=`, `src:`,
 *  `import(`, `createElement("script")` / `createElement('script')`,
 *  `loadScript(` or `appendChild(`. */
const SCRIPT_ANCHOR = /(?:\.src\b|\bsrc\s*[=:]|\bimport\s*\(|createElement\s*\(\s*["']script["']\s*\)|loadScript\s*\(|appendChild\s*\()/i

/** Is this URL token, inside a JavaScript body, SCRIPT-SHAPED (fix pass
 *  III, W6)? Its path ends in .js / .mjs, OR a loader anchor sits within
 *  120 characters before it. A bare `"https://www.nexhealth.com/practices/x"`
 *  string in a JS body — a link the code renders — is neither. Exported
 *  for tests. */
export function isScriptShapedToken(body: string, index: number, token: string): boolean {
  const path = token.replace(/^https?:\/\/[^/]*/i, '').replace(/[?#].*$/, '')
  if (/\.m?js$/i.test(path)) return true
  return SCRIPT_ANCHOR.test(body.slice(Math.max(0, index - SCRIPT_ANCHOR_WINDOW), index))
}

/** The hosts a page loads code or frames from: `<script src>`, `<link
 *  href>`, `<iframe src>` (whatever the tag's type), and every
 *  SCRIPT-SHAPED URL inside an inline script body WHEN that body is
 *  JavaScript and not a hydration sink — a JSON or JSON-LD body, a flight
 *  payload and a `window.__NUXT__` object are page copy and are skipped
 *  (V12, W6). Exported for tests. */
export function stackHosts(html: string): string[] {
  const hosts = new Set<string>()
  const add = (url: string) => {
    const h = hostOf(url)
    if (h) hosts.add(h)
  }
  for (const m of Array.from(html.matchAll(/<(?:script|link|iframe)\b[^>]*?\s(?:src|href)\s*=\s*["']([^"']{1,500})["']/gi))) add(m[1])
  for (const m of Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]{0,20000}?)<\/script>/gi))) {
    if (!isJavaScriptScriptTag(m[1])) continue
    const body = m[2]
    if (isHydrationSink(body)) continue
    for (const u of Array.from(body.matchAll(/https?:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s"'`<>()\\]*)?/gi))) {
      if (isScriptShapedToken(body, u.index ?? 0, u[0])) add(u[0])
    }
  }
  return Array.from(hosts)
}

/** The corpus the fingerprints run over: one host a line, nothing else. */
export function stackCorpus(html: string): string {
  return stackHosts(html).join('\n')
}

/** Fingerprint the competitor stack on a page (display names, list order). */
export function detectStack(html: string): string[] {
  const hosts = stackHosts(html)
  if (hosts.length === 0) return []
  const out: string[] = []
  for (const f of STACK_FINGERPRINTS) if (hosts.some((h) => f.pattern.test(h))) out.push(f.name)
  return out
}

function socialLink(html: string, pattern: RegExp): string | undefined {
  const m = html.match(pattern)
  return m ? m[0].slice(0, 200) : undefined
}

/** Extract every mailto address (lowercased, deduped, junk filtered). */
export function extractEmails(html: string): string[] {
  const out = new Set<string>()
  for (const m of Array.from(html.matchAll(/mailto:([^"'?\s<>]+)/gi))) {
    const email = m[1].toLowerCase().trim()
    // Basic shape + never keep tracking/example junk.
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) && !/example\.|sentry|wixpress/.test(email)) {
      out.add(email)
    }
  }
  return Array.from(out).slice(0, 5)
}

/**
 * Raw addresses printed in the page body/footer (not just mailto: links) —
 * many dental sites render "info@…" as plain text with a contact form. Runs
 * the same junk gate as parseEmail (rejects asset false-positives like
 * logo@2x.png) so text scraping stays safe.
 */
export function extractTextEmails(html: string): string[] {
  const out = new Set<string>()
  for (const m of Array.from(html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi))) {
    const parsed = parseEmail(m[0])
    if (parsed && !isJunkEmail(parsed.email)) out.add(parsed.email)
  }
  return Array.from(out).slice(0, 10)
}

/** Union of mailto + page-text addresses (deduped, junk-filtered, capped). */
export function extractSiteEmails(html: string): string[] {
  const out = new Set<string>()
  for (const e of extractEmails(html)) if (!isJunkEmail(e)) out.add(e)
  for (const e of extractTextEmails(html)) out.add(e)
  return Array.from(out).slice(0, 10)
}

export function extractCrawlSignals(input: {
  html: string
  finalUrl: string
  bytes: number
  fetchedAt: Date
}): ProspectCrawlSignals {
  const { html } = input
  const head = html.slice(0, 200_000)

  const titleMatch = head.match(/<title[^>]*>([^<]{1,300})/i)
  const descMatch =
    head.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{1,500})["']/i) ??
    head.match(/<meta[^>]+content=["']([^"']{1,500})["'][^>]*name=["']description["']/i)

  // Newest copyright year on the page — a 2019 footer on a live site is a
  // strong "nobody maintains this" signal.
  let copyrightYear: number | null = null
  for (const m of Array.from(html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi))) {
    const year = Number(m[1])
    if (year >= 1995 && year <= 2100) copyrightYear = Math.max(copyrightYear ?? 0, year)
  }

  let builder: string | null = null
  for (const [pattern, name] of BUILDER_FINGERPRINTS) {
    if (pattern.test(html)) {
      builder = name
      break
    }
  }

  return {
    ssl: input.finalUrl.startsWith('https://'),
    mobileViewport: /<meta[^>]+name=["']viewport["']/i.test(head),
    copyrightYear,
    titleTag: titleMatch ? titleMatch[1].trim() : null,
    metaDescription: descMatch ? descMatch[1].trim() : null,
    bookingWidget: BOOKING_MARKERS.test(html),
    socialLinks: {
      facebook: socialLink(html, /https?:\/\/(?:www\.)?facebook\.com\/[a-z0-9_.\-/%]+/i),
      instagram: socialLink(html, /https?:\/\/(?:www\.)?instagram\.com\/[a-z0-9_.\-/%]+/i),
      tiktok: socialLink(html, /https?:\/\/(?:www\.)?tiktok\.com\/@[a-z0-9_.\-/%]+/i),
      youtube: socialLink(html, /https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/|user\/|@)[a-z0-9_.\-/%]+/i),
    },
    builder,
    stack: detectStack(html),
    pageWeightKb: Math.round(input.bytes / 1024),
    emails: extractSiteEmails(html),
    fetchedAt: input.fetchedAt.toISOString(),
    // Brand capture for presenter mode.
    themeColor: normalizeHexColor(metaContent(head, 'theme-color')),
    iconUrl: extractBrandIcon(head, input.finalUrl),
    siteName: metaContent(head, 'og:site_name')?.slice(0, 120) ?? null,
  }
}

/** First same-site contact-page path in the HTML (email discovery hop). */
export function findContactPath(html: string): string | null {
  const m = html.match(/href=["'](\/[^"']*contact[^"']*)["']/i)
  return m ? m[1].slice(0, 200) : null
}

const TEAM_PATH_MARKERS =
  /(team|about|our-?team|meet-?(the-?)?(team|doctor|dentist)|staff|providers?|doctors?|dentists?|our-?practice)/i

/**
 * Same-site "meet the team / about" page paths — where a named dentist's
 * personal email often lives (drjane@…) when the homepage only shows a
 * generic desk address. Returns up to `limit` distinct relative paths,
 * contact pages excluded (findContactPath already covers those).
 */
export function findTeamPaths(html: string, limit = 2): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of Array.from(html.matchAll(/href=["'](\/[^"'#?]{1,180})["']/gi))) {
    const path = m[1]
    if (/contact/i.test(path)) continue
    if (!TEAM_PATH_MARKERS.test(path)) continue
    const key = path.toLowerCase().replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(path)
    if (out.length >= limit) break
  }
  return out
}

// ── Brand capture (presenter mode) ─────────────────────────────────────────

/** Attribute-order-agnostic <meta name=X content=Y> reader. */
function metaContent(head: string, name: string): string | null {
  const pattern1 = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']{1,300})["']`, 'i')
  const pattern2 = new RegExp(`<meta[^>]+content=["']([^"']{1,300})["'][^>]*(?:name|property)=["']${name}["']`, 'i')
  const m = head.match(pattern1) ?? head.match(pattern2)
  return m ? m[1].trim() : null
}

/** '#abc' → '#aabbcc'; null unless a clean 3/6-digit hex. Raw honest value —
 *  whether it's USABLE as a demo brand (not white/black) is a separate call
 *  (usableBrandColor in lib/demo-skin-build.ts). */
export function normalizeHexColor(v: string | null): string | null {
  if (!v) return null
  const m = v.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
  if (!m) return null
  const hex = m[1].toLowerCase()
  return `#${hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex}`
}

/** Absolutize an href against the crawled page; https-only; length-capped. */
function absoluteHttpsUrl(href: string | null, baseUrl: string): string | null {
  if (!href) return null
  try {
    const url = new URL(href, baseUrl).toString()
    return url.startsWith('https://') && url.length <= 300 ? url : null
  } catch {
    return null
  }
}

function linkHref(head: string, relPattern: string): string | null {
  const p1 = new RegExp(`<link[^>]+rel=["'][^"']*${relPattern}[^"']*["'][^>]*href=["']([^"']{1,300})["']`, 'i')
  const p2 = new RegExp(`<link[^>]+href=["']([^"']{1,300})["'][^>]*rel=["'][^"']*${relPattern}[^"']*["']`, 'i')
  const m = head.match(p1) ?? head.match(p2)
  return m ? m[1] : null
}

/**
 * The best square brand mark, in confidence order: apple-touch-icon (nearly
 * always the real logo at usable size) > any <link rel~=icon> (often tiny)
 * > og:image (often a photo — last resort).
 */
export function extractBrandIcon(head: string, finalUrl: string): string | null {
  return (
    absoluteHttpsUrl(linkHref(head, 'apple-touch-icon'), finalUrl) ??
    absoluteHttpsUrl(linkHref(head, 'icon'), finalUrl) ??
    absoluteHttpsUrl(metaContent(head, 'og:image'), finalUrl)
  )
}
