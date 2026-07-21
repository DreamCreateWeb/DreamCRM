import { NextResponse } from 'next/server'
import { getServerSession, requireUser } from '@/lib/session'
import { countUnread, listNotifications } from '@/lib/services/notifications'

/**
 * GET /api/notifications?limit=20&unread=0|1
 *
 * Used by the header bell dropdown to poll for new notifications without
 * doing a full page navigation. Returns the latest N and the unread count.
 *
 * DELIBERATE: reads the RAW session org (not the view-as context). The bell
 * stays the admin's own tray while impersonating — a platform alert (e.g. a
 * hot prospect calling) must not go silent mid-onboarding. Safe because
 * every notification read/write is hard-scoped to user_id; the org is only
 * a refinement (audited 2026-07-21, view-as sweep).
 */
export async function GET(req: Request) {
  const user = await requireUser()
  const session = await getServerSession()
  const activeOrg = session?.session?.activeOrganizationId ?? null
  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? 10)))
  const unreadOnly = url.searchParams.get('unread') === '1'
  const [items, unread] = await Promise.all([
    listNotifications(user.id, { limit, unreadOnly, organizationId: activeOrg }),
    countUnread(user.id, activeOrg),
  ])
  return NextResponse.json({ items, unread }, { headers: { 'Cache-Control': 'no-store' } })
}
