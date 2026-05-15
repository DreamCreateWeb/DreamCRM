import { NextResponse, type NextRequest } from 'next/server'

// Public-facing clinic sites live at {slug}.{SITE_DOMAIN}.
// The Vercel project must have *.{SITE_DOMAIN} added as a wildcard domain.
const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

const PUBLIC_PATHS = [
  '/signin', '/signup', '/reset-password', '/verify-email',
  '/accept-invite', '/api/auth', '/onboarding',
]
const PUBLIC_PREFIXES = ['/_next', '/images', '/fonts', '/favicon', '/api/webhooks']

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return false
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  const { pathname } = req.nextUrl

  // ── Clinic public site routing ──────────────────────────────────────────
  // If the request comes in on {slug}.{SITE_DOMAIN}, rewrite internally to
  // /site/{slug}{pathname} — no auth required for these pages.
  if (host.endsWith(`.${SITE_DOMAIN}`)) {
    const slug = host.slice(0, host.length - SITE_DOMAIN.length - 1)
    if (slug && slug !== 'www') {
      const url = req.nextUrl.clone()
      url.pathname = `/site/${slug}${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // ── Static asset & truly-public paths ──────────────────────────────────
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // ── Internal /site/* paths served by the clinic-public route group ──────
  // These are rewrite targets — they should never be accessed directly from
  // the main app domain, but they must bypass the auth check.
  if (pathname.startsWith('/site/')) {
    return NextResponse.next()
  }

  // ── Auth guard for the dashboard app ────────────────────────────────────
  // Better Auth stores its session cookie as `better-auth.session_token` by default.
  const sessionCookie =
    req.cookies.get('better-auth.session_token') ??
    req.cookies.get('__Secure-better-auth.session_token')

  if (!sessionCookie && !pathname.startsWith('/api')) {
    const url = req.nextUrl.clone()
    url.pathname = '/signin'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|fonts).*)',
  ],
}
