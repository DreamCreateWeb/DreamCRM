import { NextResponse } from 'next/server'
import { listActiveCustomDomains } from '@/lib/services/clinic-site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Host → clinic-slug map for middleware custom-domain routing.
 *
 * `middleware.ts` runs on the edge and can't touch the DB, so it fetches this
 * route (with a 5-minute revalidate cache) to learn which custom domains map to
 * which clinic site, then rewrites `host → /site/<slug>` exactly like the
 * subdomain branch.
 *
 * Public-but-harmless: the response is only `{ host: slug }` pairs, both of
 * which are already public (the domain resolves publicly; the slug is the
 * clinic's public site path). No PHI, no auth needed — and the middleware
 * fetch caches it heavily so this is cold rarely. It IS in the middleware
 * public-path allowlist so the fetch isn't itself auth-walled.
 */
export async function GET() {
  try {
    const map = await listActiveCustomDomains()
    return NextResponse.json(map, {
      headers: {
        // Let the CDN / middleware fetch cache hold this; it changes only when a
        // clinic adds/removes a custom domain (rare).
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    })
  } catch {
    // Fail open with an empty map — middleware treats a miss as "no custom
    // domain" and falls through to its normal behavior.
    return NextResponse.json({}, { status: 200 })
  }
}
