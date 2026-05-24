import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

const PUBLIC_PATHS = [
  '/signin',
  '/signup',
  '/reset-password',
  '/accept-invite',
  '/api/auth',
  '/api/hello',
  '/api/webhooks',
  '/api/cron',
  // One-shot migration apply for 0024 (is_demo). Token-gated by
  // ADMIN_BOOTSTRAP_TOKEN; removed in the follow-up cleanup PR.
  '/api/admin/bootstrap',
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

  if (hostname.endsWith(`.${SITE_DOMAIN}`)) {
    const slug = hostname.slice(0, hostname.length - SITE_DOMAIN.length - 1)
    if (slug && slug !== 'www') {
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
