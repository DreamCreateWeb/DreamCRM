import { buildClinicCalendarFeed } from '@/lib/services/calendar-feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public subscribable calendar feed: GET /api/calendar/<token>[.ics].
 * The opaque token IS the auth (calendar apps can't carry a session), so this
 * route is in the middleware public allowlist. An unknown token 404s without
 * revealing whether it exists. Read-only; rotate the token to revoke.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Clients often append `.ics`; accept it either way.
  const clean = token.replace(/\.ics$/i, '')
  const feed = await buildClinicCalendarFeed(clean)
  if (!feed) return new Response('Not found', { status: 404 })
  return new Response(feed.ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // Calendar clients poll on their own cadence; a short cache spares the DB
      // without making the feed noticeably stale.
      'Cache-Control': 'public, max-age=300',
      'Content-Disposition': `inline; filename="${feed.filename}"`,
    },
  })
}
