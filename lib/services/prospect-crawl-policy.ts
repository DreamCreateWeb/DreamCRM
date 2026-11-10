import 'server-only'

/**
 * The ONE crawler identity + politeness check the prospecting engine uses
 * when it touches a practice's website — the enrichment crawl and the
 * liveness check (P-01) both honour robots the same way, from the same
 * module, so they cannot drift apart. The capped body reader lives here
 * too: robots.txt rides the same streaming byte cap as a page body.
 */

export const CRAWL_UA = 'DreamCreateBot/1.0 (+https://www.dreamcreatestudio.com)'

/** The most of a page body either crawler ever reads, in BYTES. */
export const BODY_LIMIT = 200_000
/** The most of a robots.txt we read — nothing we honour sits past it. */
export const ROBOTS_LIMIT = 20_000

/**
 * Read a response body as a stream and stop at `limit` BYTES — the body is
 * never buffered whole first (a multi-hundred-MB page, or a small gzip that
 * inflates to GBs, would otherwise sit in memory inside the timeout). A
 * body-less response reads as ''.
 */
export async function readBodyCapped(res: Response, limit = BODY_LIMIT): Promise<string> {
  const body = res.body
  if (!body || typeof body.getReader !== 'function') return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
      }
    }
  } catch {
    /* a partial body is still a body */
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* already closed */
    }
  }
  const merged = new Uint8Array(Math.min(total, limit))
  let offset = 0
  for (const c of chunks) {
    if (offset >= merged.length) break
    const slice = c.subarray(0, Math.min(c.byteLength, merged.length - offset))
    merged.set(slice, offset)
    offset += slice.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

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

/**
 * Cheap robots.txt politeness check: a blanket `Disallow: /` under `*`
 * wins. The body is streamed and cut at ROBOTS_LIMIT bytes — never
 * buffered whole. Callers hand in their guarded fetch (the probe's and the
 * crawler's never follow a redirect for it, and never connect to an
 * address the policy refused).
 */
export async function robotsAllows(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, {
      headers: { 'user-agent': CRAWL_UA },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      try {
        await res.body?.cancel?.()
      } catch {
        /* nothing to drain */
      }
      return true // no robots.txt = crawlable
    }
    const text = await readBodyCapped(res, ROBOTS_LIMIT)
    return !robotsDisallowsAll(text)
  } catch {
    return true
  }
}
