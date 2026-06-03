'use server'

import { requireTenant } from '@/lib/auth/context'
import {
  draftSiteFromInterview,
  type OnboardingAnswers,
  type DraftResult,
} from '@/lib/services/ai-onboarding'

/**
 * Runs the one-pass site draft from the onboarding interview answers, scoped to
 * the caller's own clinic. Persistence is gated here (clinic owner/admin) — the
 * service trusts the orgId it's handed.
 */
export async function runOnboardingDraft(answers: OnboardingAnswers): Promise<DraftResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, error: 'This is only available for a clinic account.' }
  }
  return draftSiteFromInterview(ctx.organizationId, answers)
}
