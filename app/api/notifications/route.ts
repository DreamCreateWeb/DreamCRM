import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { countUnread, listNotifications } from '@/lib/services/notifications'

/**
 * GET /api/notifications?limit=20&unread=0|1
 *
 * Used by the header bell dropdown to poll for new notifications without
 * doing a full page navigation. Returns the latest N and the unread count.
 */
export async function GET(req: Request) {
  const user = await requireUser()
  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? 10)))
  const unreadOnly = url.searchParams.get('unread') === '1'
  const [items, unread] = await Promise.all([
    listNotifications(user.id, { limit, unreadOnly }),
    countUnread(user.id),
  ])
  return NextResponse.json({ items, unread }, { headers: { 'Cache-Control': 'no-store' } })
}
