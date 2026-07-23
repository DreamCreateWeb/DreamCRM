import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import { RESERVED_SLUGS } from '@/lib/onboarding/slug'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

// Canonical app origin — the host the middleware fetches its internal
// custom-domain map from. Always an absolute URL on a host we know resolves
// (NOT the incoming request's host: a custom-domain request fetching ITS OWN
// origin would loop back through this middleware). NEXT_PUBLIC_APP_URL when set,
// else `https://www.<SITE_DOMAIN>`.
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') ||
  `https://www.${SITE_DOMAIN}`

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
  // Referral-partner invite acceptance — the token in the URL is the auth, and
  // the visitor has no session yet (they create their account here). Only the
  // exact /partner/accept path is public; /partner (the portal) stays gated.
  '/partner/accept',
  '/api/auth',
  '/api/hello',
  '/api/webhooks',
  '/api/cron',
  '/api/health',
  // CRON_SECRET-guarded one-shot admin routes (run from inside the VPC).
  '/api/admin/migrate',
  '/api/admin/seed-platform',
  '/api/admin/resync-demo',
  '/api/admin/redrive-custom-domains',
  // Internal host→slug map for custom-domain routing — middleware fetches it.
  // Public-but-harmless (only public host/slug pairs); must NOT be auth-walled
  // or the middleware fetch would 302 to /signin and routing would break.
  '/api/internal/custom-domains',
  // Public review-request landing pages — patient lands here from
  // the email link. Token in the URL is the auth.
  '/r',
  // Public fast-pass claim pages ("an earlier opening") — same token-IS-auth
  // pattern as /r; patient lands from the offer email.
  '/w',
  // Public one-click appointment-confirm pages — same token-IS-auth pattern;
  // patient lands from the reminder email's "Confirm my visit" button.
  '/c',
  // Public email-to-pay balance landing — same token-IS-auth pattern; patient
  // lands from the "your balance" email's "Pay my balance" button.
  '/b',
  // Public payment-plan (installments) landing — same token-IS-auth pattern;
  // patient lands from the "payment plan" email to accept + save a card.
  '/i',
  // Public post-visit NPS survey landing — same token-IS-auth pattern;
  // patient lands from the "one quick question" email.
  '/n',
  // Public prospect demo self-booking — same token-IS-auth pattern; a
  // prospect lands from the outreach link to pick a demo time.
  '/d',
  // Subscribable .ics calendar feed (/api/calendar/<token>). Calendar apps
  // (Google/Apple/Outlook) fetch it with no session — the opaque token in the
  // URL is the auth. Must be public or the fetch 302s to /signin.
  '/api/calendar',
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

/**
 * Serve a /site/* request, stamping the gallery-frame header when the path is
 * a template frame (`/site/<slug>/tf/<template>`). The header is how the
 * layout's template resolver (which can't read the pathname) knows to force
 * that template for THIS request only — no cookie, so six preview iframes
 * can't clobber each other. Any inbound copy of the header is stripped: only
 * the middleware may set it (it's harmless anyway — the resolver re-verifies
 * canEditClinic, so it only ever affects the clinic's own editor).
 */
function siteResponse(request: NextRequest, pathname: string) {
  const frame = pathname.match(/^\/site\/[^/]+\/tf\/([a-z0-9-]+)$/)
  if (!frame && !request.headers.has('x-dc-template-frame')) return NextResponse.next()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-dc-template-frame')
  if (frame) requestHeaders.set('x-dc-template-frame', frame[1])
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export async function middleware(request: NextRequest) {
  // Requests arriving via the CloudFront tenant edge (custom clinic domains at
  // scale — the multi-tenant distribution that broke App Runner's 5-domain
  // cap, 2026-07-22) carry the ORIGINAL viewer host in x-dc-tenant-host,
  // stamped by our CloudFront Function, because the App Runner origin only
  // accepts its own Host header. Trust it ONLY when the edge secret rides
  // along (x-dc-edge-key — a static origin header configured on the
  // distribution, never known to clients), so a spoofed client header can't
  // impersonate a clinic domain.
  const edgeSecret = process.env.EDGE_TENANT_SECRET?.trim()
  const edgeHost =
    edgeSecret && request.headers.get('x-dc-edge-key') === edgeSecret
      ? request.headers.get('x-dc-tenant-host')
      : null
  // Otherwise: behind App Runner's proxy the public host arrives in
  // x-forwarded-host; fall back to the Host header, then the parsed URL.
  // (nextUrl.host alone is the internal address, which broke host-based routing.)
  const host = (
    edgeHost ||
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    request.nextUrl.host ||
    ''
  ).split(',')[0].trim().toLowerCase()
  const hostname = host.split(':')[0]
  const { pathname } = request.nextUrl

  // Health check is always served (never redirected) so App Runner stays green.
  if (pathname === '/api/health') return NextResponse.next()

  // ACM HTTP-validation relay (the CloudFront tenant edge's zero-downtime
  // migration path): while a live domain still points at App Runner, its NEW
  // tenant's managed certificate validates over plain HTTP at this well-known
  // path — redirect it to ACM's account-scoped validation host so the cert
  // can issue BEFORE the DNS flips. Works on every host on purpose; the token
  // filename is unguessable and the redirect leaks nothing.
  if (pathname.startsWith('/.well-known/pki-validation/')) {
    const file = pathname.slice('/.well-known/pki-validation/'.length)
    if (/^[a-zA-Z0-9_.-]+$/.test(file)) {
      const account = process.env.AWS_ACCOUNT_ID?.trim() || '952078552817'
      return NextResponse.redirect(
        `https://validation.us-east-1.acm-validations.aws/${account}/.well-known/pki-validation/${file}`,
        301,
      )
    }
  }

  // Vendor webhooks (Stripe, Stripe Connect, Gmail Pub/Sub, …) POST here and
  // do NOT follow redirects — a host-canonicalization 308 reads as a failed
  // delivery on their side. Serve them on whatever host they arrive at.
  // (2026-06-12: Stripe deliveries to app.<domain> were silently 308ing.)
  if (pathname.startsWith('/api/webhooks/')) return NextResponse.next()

  // app.<domain> is a legacy alias and the bare apex's canonical home is www
  // (the apex previously redirected via a Vercel project — retired; DNS now
  // points the apex straight at App Runner). Both 308 to www.
  if (hostname === `app.${SITE_DOMAIN}` || hostname === SITE_DOMAIN) {
    const url = request.nextUrl.clone()
    url.hostname = `www.${SITE_DOMAIN}`
    url.port = ''
    url.protocol = 'https:'
    return NextResponse.redirect(url, 308)
  }

  if (hostname.endsWith(`.${SITE_DOMAIN}`)) {
    const slug = hostname.slice(0, hostname.length - SITE_DOMAIN.length - 1)
    // Reserved names (www/app/api/portal/admin/blog/…) are never a clinic site,
    // so they're not rewritten to /site/<slug> — they fall through to the app.
    // Reuse the single onboarding RESERVED_SLUGS list so the two can't drift
    // (a clinic can't register these, so none has a public site anyway).
    if (slug && !RESERVED_SLUGS.has(slug)) {
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
  if (pathname.startsWith('/site/')) return siteResponse(request, pathname)

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
