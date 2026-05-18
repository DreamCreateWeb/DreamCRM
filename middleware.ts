import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

// Public-facing clinic sites live at {slug}.{SITE_DOMAIN}.
// The Vercel project must have *.{SITE_DOMAIN} added as a wildcard domain.
const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

const PUBLIC_PATHS = [
  '/signin',
  '/signup',
  '/reset-password',
  '/verify-email',
  '/accept-invite',
  '/api/auth',
  '/api/hello',
  '/api/webhooks',
  '/api/admin/bootstrap',
]

const PUBLIC_PREFIXES = ['/_next', '/images', '/favicon', '/css', '/fonts']

function isPublicPath(pathname: string) {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export function middleware(request: NextRequest) {
  // nextUrl.host is more reliable than the host header — both Next dev and
  // Vercel populate it from the incoming request, and it strips the port.
  const host = (request.nextUrl.host || request.headers.get('host') || '').toLowerCase()
  // Drop any :port suffix (dev: acme.localhost:3000)
  const hostname = host.split(':')[0]
  const { pathname } = request.nextUrl

  // ── Clinic public site routing ──────────────────────────────────────────
  // Requests on {slug}.{SITE_DOMAIN} get rewritten to /site/{slug}{pathname}.
  // No auth required for these pages.
  if (hostname.endsWith(`.${SITE_DOMAIN}`)) {
    const slug = hostname.slice(0, hostname.length - SITE_DOMAIN.length - 1)
    if (slug && slug !== 'www') {
      const url = request.nextUrl.clone()
      url.pathname = `/site/${slug}${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // ── Public paths bypass auth ────────────────────────────────────────────
  if (isPublicPath(pathname)) return NextResponse.next()

  // ── Internal /site/* paths are the rewrite target — bypass auth ─────────
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
