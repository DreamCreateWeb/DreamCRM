import { NextResponse } from 'next/server'
import { getServerSession, requireUser } from '@/lib/session'
import { dismissAllNotifications, dismissNotifications } from '@/lib/services/notifications'

/**
 * POST /api/notifications/dismiss
 *
 * Permanently removes notifications from the tray. Body:
 *   { "ids": number[] }        — dismiss specific rows (the per-item ✕)
 *   { "all": true }            — clear everything for the active org
 *   { "all": true, "readOnly": true } — clear only already-opened rows
 * Scoped to the caller + their active org.
 */
export async function POST(req: Request) {
  const user = await requireUser()
  const session = await getServerSession()
  const activeOrg = session?.session?.activeOrganizationId ?? null
  const body = (await req.json().catch(() => null)) as
    | { ids?: number[]; all?: boolean; readOnly?: boolean }
    | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  if (body.all) {
    await dismissAllNotifications(user.id, activeOrg, { readOnly: body.readOnly === true })
  } else if (Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.filter((n): n is number => Number.isInteger(n))
    await dismissNotifications(user.id, ids, activeOrg)
  } else {
    return NextResponse.json({ error: 'no ids or all' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
