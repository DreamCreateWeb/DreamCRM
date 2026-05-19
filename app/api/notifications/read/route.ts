import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { markAllRead, markRead } from '@/lib/services/notifications'

/**
 * POST /api/notifications/read
 *
 * Body: { "ids": number[] } to mark specific ids, or { "all": true } to wipe
 * the unread queue. Returns the new unread count.
 */
export async function POST(req: Request) {
  const user = await requireUser()
  const body = await req.json().catch(() => null) as { ids?: number[]; all?: boolean } | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  if (body.all) {
    await markAllRead(user.id)
  } else if (Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.filter((n): n is number => Number.isInteger(n))
    await markRead(user.id, ids)
  } else {
    return NextResponse.json({ error: 'no ids or all' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
