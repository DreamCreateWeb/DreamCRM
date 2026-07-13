'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { setFollowupRule } from '@/lib/services/followup-rules'
import type { FollowupRuleId, FollowupRuleConfig } from '@/lib/types/followup-rules'
import { setDigestEnabled } from '@/lib/services/daily-digest'

// Smart-rule + digest config for the Follow-ups board (the rules card is the
// only UI for both — moved from patients/actions.ts in the structure pass).

export async function setFollowupRuleAction(
  rule: FollowupRuleId,
  enabled: boolean,
): Promise<{ ok: true; config: FollowupRuleConfig } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Automations are a clinic feature.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change automations.' }
  }
  if (rule !== 'balance' && rule !== 'recall' && rule !== 'unconfirmed') {
    return { ok: false, error: 'Unknown rule.' }
  }
  const config = await setFollowupRule(ctx.organizationId, rule, enabled)
  revalidatePath('/followups')
  return { ok: true, config }
}

export async function setDigestEnabledAction(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'The digest is a clinic feature.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can change the digest.' }
  }
  await setDigestEnabled(ctx.organizationId, enabled)
  revalidatePath('/followups')
  return { ok: true }
}
