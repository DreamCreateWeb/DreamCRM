'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { generateCalendarFeedToken, clearCalendarFeedToken } from '@/lib/services/calendar-feed'

/**
 * Server actions behind the Settings → Clinic "Calendar feed" card. Clinic +
 * owner/admin on any plan (it's an operational convenience, not a premium
 * feature). Generating rotates the token (revoking old subscriptions); turning
 * it off clears the token. The feed URL itself is read-only + token-authed.
 */

async function gate(): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, error: 'The calendar feed is only available for clinics.' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can manage the calendar feed.' }
  }
  return { ok: true, orgId: ctx.organizationId }
}

export async function generateCalendarFeedAction(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  const token = await generateCalendarFeedToken(g.orgId)
  revalidatePath('/settings/clinic')
  return { ok: true, token }
}

export async function disableCalendarFeedAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  await clearCalendarFeedToken(g.orgId)
  revalidatePath('/settings/clinic')
  return { ok: true }
}
