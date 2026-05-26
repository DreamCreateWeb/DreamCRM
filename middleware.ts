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
  // Public review-request landing pages — patient lands here from
  // the email link. Token in the URL is the auth.
  '/r',
]

const PUBLIC_PREFIXES = ['/_next', '/images', '/favicon', '/css', '/fonts']

function isPublicPath(pathname: string) {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export function middleware(request: NextRequest) {
  const host = (request.nextUrl.host || request.headers.get('host') || '').toLowerCase()
  const hostname = host.split(':')[0]
  const { pathname } = request.nextUrl

  // app.<domain> is a legacy alias; send it to the canonical www host.
  // Exempt /api/health so the App Runner health check is never redirected.
  if (hostname === `app.${SITE_DOMAIN}` && pathname !== '/api/health') {
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
