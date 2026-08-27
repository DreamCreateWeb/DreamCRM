import 'server-only'

/**
 * SERP (Google search results) driver — the grader's search-visibility
 * check (docs/marketing-engine.md, slice 2 v2). Scraping Google directly
 * violates its TOS, so ranks come from a SERP API; this ships INERT (the
 * SES/Bedrock driver pattern): no key, no calls, and the grader's search
 * axis simply hides.
 *
 * Wire format targets Serper.dev (google.serper.dev/search — X-API-KEY
 * header, {q, num} body, `organic: [{link, position}]` response), the
 * cheapest of the mainstream providers; any compatible endpoint can be
 * pointed at via SERP_API_URL.
 *
 * Key handling follows the lazy convention (lib/stripe.ts): nothing throws
 * at module eval; `serpConfigured()` lets callers skip cleanly; the lookup
 * returns null on ANY error — the check is best-effort by contract.
 */

const DEFAULT_URL = 'https://google.serper.dev/search'

export function serpConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY?.trim())
}

export interface SerpResult {
  /** The query as run, e.g. 'dentist in Ward, AR'. */
  query: string
  /** Organic result hostnames, position order, www-stripped + lowercased. */
  organicHosts: string[]
}

/** Hostname of a result link; junk → null. */
function hostOf(link: unknown): string | null {
  if (typeof link !== 'string' || !link) return null
  try {
    return new URL(link).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Run the one query a new patient runs: "dentist in {city}, {state}".
 * Returns the top organic hostnames (up to 10) or null when unconfigured /
 * failed — callers treat null as "not checked", never as "not ranked".
 */
export async function searchDentistRankings(input: {
  city: string
  state?: string | null
}): Promise<SerpResult | null> {
  const key = process.env.SERPER_API_KEY?.trim()
  if (!key) return null
  const city = input.city.trim()
  if (!city) return null
  const query = `dentist in ${city}${input.state ? `, ${input.state.trim().toUpperCase()}` : ''}`
  try {
    const res = await fetch(process.env.SERP_API_URL?.trim() || DEFAULT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, num: 10, gl: 'us' }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn('[serp] search failed', res.status)
      return null
    }
    const body = (await res.json()) as { organic?: unknown[] }
    const organicHosts = (body.organic ?? [])
      .map((o) => hostOf((o as { link?: unknown })?.link))
      .filter((h): h is string => Boolean(h))
      .slice(0, 10)
    return { query, organicHosts }
  } catch (err) {
    console.warn('[serp] lookup error', err instanceof Error ? err.message : err)
    return null
  }
}

/** 1-based position of a practice's domain in the organic list; null = not
 *  present. Subdomains of the practice domain count as the practice. */
export function positionOfDomain(organicHosts: string[], practiceDomain: string): number | null {
  const d = practiceDomain.toLowerCase().replace(/^www\./, '')
  if (!d) return null
  const idx = organicHosts.findIndex((h) => h === d || h.endsWith('.' + d))
  return idx === -1 ? null : idx + 1
}
