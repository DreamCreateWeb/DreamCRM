/**
 * The grader's DEEP site scan (marketing-engine slice 2, v2) — pure,
 * client-safe extraction of the patient-relevant signals the Hunter's
 * lighter crawl (lib/prospect-signals.ts) doesn't need: heading structure,
 * dentist structured data, social preview tags, a tappable phone number.
 * The Hunter's extractor stays untouched — its signals feed outreach
 * segmentation; these feed a report a practice owner reads.
 *
 * robotsTxt / sitemap / fetchMs are filled by the SERVICE (they're network
 * facts, not HTML facts); null = not checked.
 */

export interface DeepSiteSignals {
  /** An <h1> exists — the page has a headline for Google to anchor on. */
  h1: boolean
  /** JSON-LD structured data present at all. */
  jsonLd: boolean
  /** …and it declares a Dentist / LocalBusiness / MedicalBusiness entity. */
  jsonLdDentist: boolean
  /** og:title/og:image present — links preview properly when shared. */
  ogTags: boolean
  /** A tel: link or visible phone pattern — patients can tap to call. */
  phoneVisible: boolean
  /** <link rel="canonical"> present. */
  canonical: boolean
  /** /robots.txt reachable (service-filled; null = not checked). */
  robotsTxt: boolean | null
  /** A sitemap reachable at /sitemap.xml (service-filled; null = not checked). */
  sitemap: boolean | null
  /** Homepage response wall-clock in ms (service-filled; null = not checked). */
  fetchMs: number | null
}

const PHONE_RE = /(\(\d{3}\)\s?\d{3}[-.\s]\d{4})|(\d{3}[-.]\d{3}[-.]\d{4})/

export function extractDeepSiteSignals(html: string): DeepSiteSignals {
  const head = html.slice(0, 300_000)
  const lower = head.toLowerCase()
  const jsonLdBlocks = head.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []
  const jsonLd = jsonLdBlocks.length > 0
  const jsonLdDentist = jsonLdBlocks.some((b) => /dentist|localbusiness|medicalbusiness|medicalclinic/i.test(b))
  return {
    h1: /<h1[\s>]/i.test(head),
    jsonLd,
    jsonLdDentist,
    ogTags: lower.includes('property="og:title"') || lower.includes("property='og:title'") || lower.includes('property="og:image"'),
    phoneVisible: lower.includes('href="tel:') || lower.includes("href='tel:") || PHONE_RE.test(head),
    canonical: /<link[^>]+rel=["']canonical["']/i.test(head),
    robotsTxt: null,
    sitemap: null,
    fetchMs: null,
  }
}
