import 'server-only'

/**
 * The ONE crawler identity + politeness check the prospecting engine uses
 * when it touches a practice's website — the enrichment crawl and the
 * liveness check (P-01) both honour robots the same way, from the same
 * module, so they cannot drift apart.
 */

export const CRAWL_UA = 'DreamCreateBot/1.0 (+https://www.dreamcreatestudio.com)'

/** Pure: does this robots.txt carry a blanket `Disallow: /` under `*`? */
export function robotsDisallowsAll(text: string): boolean {
  let inStar = false
  for (const line of text.split('\n')) {
    const l = line.trim().toLowerCase()
    if (l.startsWith('user-agent:')) inStar = l.includes('*')
    else if (inStar && /^disallow:\s*\/\s*$/.test(l)) return true
  }
  return false
}

/** Cheap robots.txt politeness check: a blanket `Disallow: /` under `*` wins. */
export async function robotsAllows(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, {
      headers: { 'user-agent': CRAWL_UA },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return true // no robots.txt = crawlable
    const text = (await res.text()).slice(0, 20_000)
    return !robotsDisallowsAll(text)
  } catch {
    return true
  }
}
