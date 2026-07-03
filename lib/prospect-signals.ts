import type { ProspectCrawlSignals } from '@/lib/types/prospecting'

/**
 * Pure crawl-signal extraction — regex over raw homepage HTML (the repo has
 * no HTML-parser dep and doesn't need one for these coarse signals). The
 * fetch itself lives in lib/services/prospect-enrich.ts; keeping the
 * extractor pure makes the whole signal surface unit-testable with HTML
 * fixtures.
 */

const BOOKING_MARKERS =
  /(localmed|nexhealth|flexbook|zocdoc|solutionreach|lighthouse\s*360|denticon|curve\s*hero|book\s+(online|now|an?\s+appointment)|schedule\s+(online|now|an?\s+appointment)|request\s+an?\s+appointment)/i

const BUILDER_FINGERPRINTS: Array<[RegExp, string]> = [
  [/wixstatic\.com|wix\.com\/website/i, 'wix'],
  [/squarespace\.com|squarespace-cdn/i, 'squarespace'],
  [/godaddy\.com|website-builder|wsimg\.com/i, 'godaddy'],
  [/wp-content|wp-includes|wordpress/i, 'wordpress'],
  [/weebly\.com|weeblycloud/i, 'weebly'],
]

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
    pageWeightKb: Math.round(input.bytes / 1024),
    emails: extractEmails(html),
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
