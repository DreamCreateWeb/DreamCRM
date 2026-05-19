'use server'

import { and, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db, schema } from '@/lib/db'
import { getServerSession, requireUser } from '@/lib/session'

/**
 * Revoke a single session. The user can only revoke sessions belonging to
 * themselves, and revoking the current session is a no-op (use sign-out for
 * that — we don't want to lock people out of the page they just clicked).
 */
export async function revokeSession(sessionId: string) {
  const user = await requireUser()
  const current = await getServerSession()
  if (sessionId === current?.session.id) return { ok: false, reason: 'current' as const }
  await db
    .delete(schema.session)
    .where(and(eq(schema.session.id, sessionId), eq(schema.session.userId, user.id)))
  revalidatePath('/settings/security')
  return { ok: true }
}

/**
 * Sign out everywhere except this device. Used when the user suspects an
 * account compromise — wipes every session belonging to this user except the
 * one making the request.
 */
export async function revokeOtherSessions() {
  const user = await requireUser()
  const current = await getServerSession()
  if (!current) return { ok: false, reason: 'no-session' as const }
  const rows = await db
    .delete(schema.session)
    .where(
      and(
        eq(schema.session.userId, user.id),
        ne(schema.session.id, current.session.id),
      ),
    )
    .returning({ id: schema.session.id })
  revalidatePath('/settings/security')
  return { ok: true, count: rows.length }
}
