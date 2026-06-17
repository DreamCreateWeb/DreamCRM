import 'server-only'

import { and, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { normalizeEmail } from '@/lib/contact-normalize'

/**
 * The most recent STILL-VALID pending invitation for an email, or null.
 *
 * The guard that stops the "duplicate clinic" bug: an org-less signed-in user
 * is normally routed into onboarding (`dashboard-shell` → /onboarding-01), where
 * they'd create a brand-new clinic. But if they were INVITED to an existing one
 * (managed provisioning, or a team invite) and just haven't accepted yet, that
 * new clinic is a duplicate. Callers use this to redirect them to
 * `/accept-invite?token=<id>` instead. Best-effort: any failure yields null
 * (fall through to normal onboarding) rather than throwing.
 */
export async function findPendingInviteForEmail(
  email: string | null | undefined,
): Promise<{ id: string; organizationId: string } | null> {
  const norm = normalizeEmail(email ?? '')
  if (!norm) return null
  try {
    const rows = await db
      .select({
        id: schema.invitation.id,
        organizationId: schema.invitation.organizationId,
        expiresAt: schema.invitation.expiresAt,
      })
      .from(schema.invitation)
      .where(and(sql`lower(${schema.invitation.email}) = ${norm}`, eq(schema.invitation.status, 'pending')))
      .orderBy(desc(schema.invitation.expiresAt))
      .limit(1)
    const inv = rows[0]
    if (!inv) return null
    if (inv.expiresAt && new Date() > inv.expiresAt) return null
    return { id: inv.id, organizationId: inv.organizationId }
  } catch {
    return null
  }
}
