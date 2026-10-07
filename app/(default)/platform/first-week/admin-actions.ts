'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { setPmsConnectRequestStatus } from '@/lib/services/pms-connect'

/**
 * The platform's answer to a clinic's PMS connect request (docs/ACTIVATION.md
 * S4): "scheduled" when the install has a date, "closed" when it will not
 * happen (the practice changed its mind, the system is unsupported). A bind
 * marks it "connected" on its own (lib/services/pms/connection.ts). Platform
 * tenant only. Audit round 1: the status column had no writer at all.
 */
export type PmsRequestAnswer = 'scheduled' | 'closed'

export async function answerPmsRequestAction(orgId: string, answer: PmsRequestAnswer): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') return { ok: false, error: 'Platform only.' }
  if (answer !== 'scheduled' && answer !== 'closed') return { ok: false, error: 'Unknown answer.' }
  if (typeof orgId !== 'string' || !orgId) return { ok: false, error: 'Which clinic?' }
  try {
    const found = await setPmsConnectRequestStatus(orgId, answer)
    if (!found) return { ok: false, error: 'That clinic has no connect request.' }
  } catch (e) {
    console.error('[first-week] answer request failed', e)
    return { ok: false, error: 'Could not update the request — try again.' }
  }
  revalidatePath('/platform/first-week')
  return { ok: true }
}
