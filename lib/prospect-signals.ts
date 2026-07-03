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
  }
}

/** First same-site contact-page path in the HTML (email discovery hop). */
export function findContactPath(html: string): string | null {
  const m = html.match(/href=["'](\/[^"']*contact[^"']*)["']/i)
  return m ? m[1].slice(0, 200) : null
}
