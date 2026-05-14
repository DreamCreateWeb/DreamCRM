import { NextResponse, type NextRequest } from 'next/server'

/**
 * Tenant resolution middleware.
 *
 * Routes are decided by a combination of:
 *   1. Hostname (subdomain / custom domain) — eventually drives clinic-public sites
 *   2. Authenticated session — drives which dashboard the user lands on
 *
 * For now we only handle (2): pull the session cookie, check if the user
 * is logged in, and redirect from the marketing root to the right dashboard.
 * Subdomain-based clinic sites will be added once we start onboarding clinics.
 */

const PUBLIC_PATHS = ['/signin', '/signup', '/reset-password', '/verify-email', '/api/auth']
const PUBLIC_PREFIXES = ['/_next', '/images', '/fonts', '/favicon', '/api/webhooks']

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return false
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Better Auth stores its session cookie as `better-auth.session_token` by default.
  // We only check for presence here — the actual session validation happens in
  // server components / route handlers via auth.api.getSession().
  const sessionCookie =
    req.cookies.get('better-auth.session_token') ??
    req.cookies.get('__Secure-better-auth.session_token')

  // No session and trying to hit a protected page → send to sign in
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
    // Run on everything except static assets
    '/((?!_next/static|_next/image|favicon.ico|images|fonts).*)',
  ],
}
