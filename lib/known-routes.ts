/**
 * The census of top-level URL segments the app router actually serves.
 *
 * It exists so the middleware can tell two different things apart:
 *
 *   - "this route EXISTS but you are not signed in"  → redirect to /signin
 *   - "there is no such route"                       → a real 404
 *
 * Before this, both answered the same way: every unmatched path was sent to
 * the sign-in page, so /privacy, /baa and /definitely-not-a-real-page-zzz9 all
 * came back 200 with byte-identical sign-in HTML (DREAM-164). A soft 404 is
 * not a cosmetic problem — it hides missing pages from link checkers, from
 * uptime checks, from crawlers and from our own audits, because a status code
 * stops proving anything about this site.
 *
 * TOP LEVEL ONLY, on purpose. The first segment is a whole SECTION of the app;
 * it changes a couple of times a year, while pages below it change weekly.
 * Matching deeper would mean re-implementing Next's router here and taxing
 * every new page with a list edit. The cost of stopping at one segment is that
 * a signed-out request to a made-up path UNDER a real section (say
 * /settings/nope) still goes to sign-in rather than 404 — those paths are
 * behind auth anyway, are not linked from anywhere public, and a signed-in
 * request to them already gets Next's real 404.
 *
 * This list cannot drift: tests/middleware.test.ts walks app/ and asserts both
 * sets below are exactly what the router serves. Add a section, run the tests,
 * and they tell you what to add.
 */
export const KNOWN_TOP_LEVEL_SEGMENTS: ReadonlySet<string> = new Set([
  // Auth doors — app/(auth)
  'accept-invite',
  'reset-password',
  'signin',
  'signup',
  // Public marketing site — app/(marketing)
  'blog',
  'compare',
  'docs',
  'grade',
  'pricing',
  'product',
  'why',
  // Root metadata files — app/icon.tsx, opengraph-image.tsx, robots.ts,
  // sitemap.ts. Next mints these as top-level routes.
  'icon',
  'opengraph-image',
  'robots.txt',
  'sitemap.xml',
  // Dashboard — app/(default) and app/(double-sidebar)
  'analytics',
  'appointments',
  'billing',
  'calendar',
  'campaigns',
  'careers',
  'channels',
  'community',
  'dashboard',
  'developer',
  'dream-team',
  'ecommerce',
  'followups',
  'google-posts',
  'growth',
  'inbox',
  'intake-forms',
  'integrations',
  'jobs',
  'leads',
  'marketing',
  'messages',
  'my-day',
  'partners',
  'patients',
  'payments',
  'platform',
  'posts',
  'reviews',
  'seo',
  'settings',
  'shop',
  'social-posts',
  'tasks',
  'website',
  // Post-signup flow — app/(onboarding)
  'onboarding-01',
  'onboarding-02',
  'onboarding-03',
  'onboarding-04',
  'onboarding-complete',
  'welcome',
  // Referral-partner portal + its token-auth accept page
  'partner',
  // Patient portal — app/(portal)
  'patient',
  // Sales demo surfaces — app/(preview)
  'demo',
  // Token-IS-auth patient/prospect landings (/r review request, /w fast pass,
  // /c confirm, /b balance, /i installments, /n survey, /d demo booking,
  // /g practice-grade report)
  'b',
  'c',
  'd',
  'g',
  'i',
  'n',
  'r',
  'w',
  // Clinic public sites — the rewrite target for clinic subdomains and custom
  // domains, also reachable path-based.
  'site',
  // API
  'api',
])

/**
 * Second-level segments under /api. The one place worth going a level deeper:
 * an unknown API path answering with the sign-in PAGE is actively misleading
 * to a caller that asked for JSON, and this level is as stable as the first.
 */
export const KNOWN_API_SEGMENTS: ReadonlySet<string> = new Set([
  'admin',
  'appointments',
  'auth',
  'blog',
  'calendar',
  'connect',
  'cron',
  'health',
  'hello',
  'inbox',
  'integrations',
  'internal',
  'nav-badges',
  'notifications',
  'oauth',
  'realtime',
  'site-view',
  'track',
  'unsub',
  'upload',
  'webhooks',
])

/**
 * True when `pathname` sits under a route the app actually serves — i.e. when
 * "you are not signed in" is a truthful answer to it. False means no such
 * route, and the caller owes the request a 404.
 */
export function isKnownRoute(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  // The root is the marketing home.
  if (segments.length === 0) return true
  if (!KNOWN_TOP_LEVEL_SEGMENTS.has(segments[0])) return false
  // Bare `/api` is not a route, and neither is /api/<something-invented>.
  if (segments[0] === 'api') return segments.length > 1 && KNOWN_API_SEGMENTS.has(segments[1])
  return true
}
