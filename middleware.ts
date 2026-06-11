import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

// Canonical app origin — the host the middleware fetches its internal
// custom-domain map from. Always an absolute URL on a host we know resolves
// (NOT the incoming request's host: a custom-domain request fetching ITS OWN
// origin would loop back through this middleware). NEXT_PUBLIC_APP_URL when set,
// else `https://www.<SITE_DOMAIN>`.
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') ||
  `https://www.${SITE_DOMAIN}`

// Subdomains that serve the platform app itself, never a clinic public site.
// `app` is the authenticated dashboard host; `www` is the apex alias.
const RESERVED_SUBDOMAINS = new Set(['www', 'app'])

/**
 * Fetch the `customDomain → slug` map for clinics that wired their own domain.
 * Heavily cached (5 min) so the DB-backed internal route is hit rarely; fails
 * open (null) on any error so a custom-domain blip never breaks routing.
 */
async function fetchCustomDomainMap(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${APP_ORIGIN}/api/internal/custom-domains`, {
      // Cache for 5 minutes — the map changes only when a clinic adds/removes a
      // custom domain.
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return (await res.json()) as Record<string, string>
  } catch {
    return null
  }
}

/**
 * True for hosts that are the platform itself (apex / www / app / any
 * `*.SITE_DOMAIN` subdomain), the App Runner default host, or local dev. These
 * never go through the custom-domain lookup — they're handled by the explicit
 * branches above it (or are the app's own origin).
 */
function isPlatformHost(hostname: string): boolean {
  return (
    hostname === '' ||
    hostname === SITE_DOMAIN ||
    hostname.endsWith(`.${SITE_DOMAIN}`) ||
    hostname.endsWith('.awsapprunner.com') ||
    hostname.startsWith('localhost') ||
    hostname.startsWith('127.0.0.1')
  )
}

const PUBLIC_PATHS = [
  // Public marketing site (the root itself is allowed as an exact match in
  // isPublicPath; these are its subpages). Single-sourced from
  // lib/marketing/site.ts so a new marketing page can't ship auth-walled.
  ...MARKETING_PUBLIC_PATHS,
  '/sitemap.xml',
  '/robots.txt',
  // Next.js metadata-file conventions mint top-level public routes that
  // social scrapers + browsers fetch unauthenticated. Allowlist the CLASS —
  // '/opengraph-image' alone already shipped broken once (blank link
  // previews) before being added here.
  '/opengraph-image',
  '/twitter-image',
  '/icon',
  '/apple-icon',
  '/apple-touch-icon',
  '/manifest.webmanifest',
  // Public pageview beacon for blog posts (clinic public blogs + the
  // marketing blog). The route is a best-effort counter that no-ops on
  // drafts; without this the POST 307s to /signin and views never count.
  '/api/blog',
  // Site-wide public pageview beacon (every clinic public page). Same
  // best-effort daily-rollup counter; must be public or the sendBeacon POST
  // from an unauthenticated visitor 307s to /signin and visits never count.
  '/api/site-view',
  '/signin',
  '/signup',
  '/reset-password',
  '/accept-invite',
  '/api/auth',
  '/api/hello',
  '/api/webhooks',
  '/api/cron',
  '/api/health',
  // CRON_SECRET-guarded one-shot admin routes (run from inside the VPC).
  '/api/admin/migrate',
  '/api/admin/seed-platform',
  '/api/admin/resync-demo',
  // Internal host→slug map for custom-domain routing — middleware fetches it.
  // Public-but-harmless (only public host/slug pairs); must NOT be auth-walled
  // or the middleware fetch would 302 to /signin and routing would break.
  '/api/internal/custom-domains',
  // Public review-request landing pages — patient lands here from
  // the email link. Token in the URL is the auth.
  '/r',
]

const PUBLIC_PREFIXES = ['/_next', '/images', '/favicon', '/css', '/fonts']

function isPublicPath(pathname: string) {
  // The root is the public marketing site (the page itself routes signed-in
  // users to their dashboard). Exact match only — every other path keeps its
  // auth gate.
  if (pathname === '/') return true
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  // Behind App Runner's proxy the public host arrives in x-forwarded-host;
  // fall back to the Host header, then the parsed URL. (nextUrl.host alone is
  // the internal address, which broke host-based routing.)
  const host = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    request.nextUrl.host ||
    ''
  ).split(',')[0].trim().toLowerCase()
  const hostname = host.split(':')[0]
  const { pathname } = request.nextUrl

  // Health check is always served (never redirected) so App Runner stays green.
  if (pathname === '/api/health') return NextResponse.next()

  // app.<domain> is a legacy alias; send it to the canonical www host.
  if (hostname === `app.${SITE_DOMAIN}`) {
    const url = request.nextUrl.clone()
    url.hostname = `www.${SITE_DOMAIN}`
    url.port = ''
    url.protocol = 'https:'
    return NextResponse.redirect(url, 308)
  }

  if (hostname.endsWith(`.${SITE_DOMAIN}`)) {
    const slug = hostname.slice(0, hostname.length - SITE_DOMAIN.length - 1)
    if (slug && !RESERVED_SUBDOMAINS.has(slug)) {
      const url = request.nextUrl.clone()
      url.pathname = `/site/${slug}${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // Custom clinic domains (e.g. www.smilebright.com). Any host that isn't the
  // platform's own + isn't App Runner internal + isn't local dev: look it up in
  // the cached host→slug map. On a hit, rewrite to the clinic's /site/<slug>
  // exactly like the subdomain branch above. On a miss or fetch failure, fall
  // through to normal behavior (fail open — a custom-domain blip can't take down
  // auth or the marketing site). We skip Next internals + the internal map
  // route itself so the lookup can't recurse.
  if (
    !isPlatformHost(hostname) &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/api/internal/custom-domains')
  ) {
    const map = await fetchCustomDomainMap()
    const slug = map?.[hostname]
    if (slug) {
      const url = request.nextUrl.clone()
      url.pathname = `/site/${slug}${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  if (isPublicPath(pathname)) return NextResponse.next()
  if (pathname.startsWith('/site/')) return NextResponse.next()

  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/signin'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|css|fonts).*)'],
}
