'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  markWelcomeSeen,
  dismissChecklist,
  dismissHint,
} from '@/lib/services/staff-onboarding'
import { MODULE_HINTS } from '@/lib/types/onboarding'

/**
 * Staff-tutorial dismissal actions. All per (org, user) — one teammate
 * closing a hint never closes it for the rest of the front desk.
 */

export async function markWelcomeSeenAction(): Promise<void> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return
  await markWelcomeSeen(ctx.organizationId, ctx.userId)
  revalidatePath('/dashboard')
}

export async function dismissChecklistAction(): Promise<void> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return
  await dismissChecklist(ctx.organizationId, ctx.userId)
  revalidatePath('/dashboard')
}

export async function dismissHintAction(hintId: string): Promise<void> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return
  if (!(hintId in MODULE_HINTS)) return
  await dismissHint(ctx.organizationId, ctx.userId, hintId)
}
