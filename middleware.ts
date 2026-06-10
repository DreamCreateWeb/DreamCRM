import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

// Subdomains that serve the platform app itself, never a clinic public site.
// `app` is the authenticated dashboard host; `www` is the apex alias.
const RESERVED_SUBDOMAINS = new Set(['www', 'app'])

const PUBLIC_PATHS = [
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

export function middleware(request: NextRequest) {
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
