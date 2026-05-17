import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const PUBLIC_PATHS = [
  '/signin',
  '/signup',
  '/reset-password',
  '/api/auth',
  '/api/hello',
  '/api/webhooks',
  '/api/admin/bootstrap',
]

const PUBLIC_PREFIXES = ['/_next', '/images', '/favicon', '/css']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|css).*)'],
}
