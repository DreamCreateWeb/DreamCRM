import { NextResponse } from 'next/server'
import { recordSiteView } from '@/lib/services/site-analytics'
import { getClinicOrgIdBySlug } from '@/lib/services/clinic-site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public pageview beacon for clinic public sites. Mounted once in
 * app/site/[slug]/layout.tsx (SiteViewBeacon), fired client-side via
 * navigator.sendBeacon so SSR / prerender renders never count.
 *
 * Body: { orgId?, slug?, path }. Either an orgId (already resolved by the
 * layout) or a slug we resolve here. The path is the PUBLIC path the visitor
 * sees ('/', '/about', '/book', …); the service normalizes + buckets it.
 *
 * Excludes:
 *  - `?edit=1` Website Studio canvases (the clinic editing their own site)
 *  - obvious bots (cheap UA substring check — not a security boundary, just
 *    keeps the headline number honest)
 *
 * Best-effort + fire-and-forget: any failure returns 204 silently so the
 * beacon never errors a visitor's page. Returns 204 with no body.
 */

// Cheap bot filter — substrings that appear in the UA of crawlers, link
// unfurlers, monitors, and headless tools. Not exhaustive (and not meant to be
// — it's an honesty guardrail, not anti-fraud). Lowercased compare.
const BOT_UA_SUBSTRINGS = [
  'bot',
  'crawler',
  'spider',
  'crawl',
  'slurp',
  'mediapartners',
  'facebookexternalhit',
  'embedly',
  'quora link preview',
  'whatsapp',
  'telegrambot',
  'discordbot',
  'slackbot',
  'twitterbot',
  'linkedinbot',
  'pinterest',
  'headlesschrome',
  'phantomjs',
  'lighthouse',
  'pingdom',
  'uptimerobot',
  'gtmetrix',
  'curl/',
  'wget',
  'python-requests',
  'axios/',
  'node-fetch',
  'go-http-client',
  'apache-httpclient',
]

function looksLikeBot(ua: string | null): boolean {
  if (!ua) return true // no UA at all → almost always a script/monitor
  const u = ua.toLowerCase()
  return BOT_UA_SUBSTRINGS.some((s) => u.includes(s))
}

interface Body {
  orgId?: unknown
  slug?: unknown
  path?: unknown
  edit?: unknown
}

export async function POST(req: Request) {
  try {
    // Drop bots before doing any work.
    if (looksLikeBot(req.headers.get('user-agent'))) {
      return new NextResponse(null, { status: 204 })
    }

    // sendBeacon posts as text/plain or application/json depending on the
    // browser; parse defensively.
    let body: Body = {}
    try {
      body = (await req.json()) as Body
    } catch {
      try {
        const txt = await req.text()
        body = txt ? (JSON.parse(txt) as Body) : {}
      } catch {
        body = {}
      }
    }

    // Skip Website Studio edit-mode canvases entirely.
    const path = typeof body.path === 'string' ? body.path : '/'
    if (body.edit === true || body.edit === 1 || body.edit === '1' || /[?&]edit=1\b/.test(path)) {
      return new NextResponse(null, { status: 204 })
    }

    let orgId = typeof body.orgId === 'string' && body.orgId ? body.orgId : null
    if (!orgId && typeof body.slug === 'string' && body.slug) {
      orgId = await getClinicOrgIdBySlug(body.slug)
    }
    if (!orgId) return new NextResponse(null, { status: 204 })

    await recordSiteView(orgId, path)
  } catch {
    /* best-effort counter — never error the beacon */
  }
  return new NextResponse(null, { status: 204 })
}
