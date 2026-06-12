'use server'

import { requireTenant } from '@/lib/auth/context'
import {
  draftSiteFromInterview,
  type OnboardingAnswers,
  type DraftResult,
} from '@/lib/services/ai-onboarding'
import {
  saveInterviewDraft,
  completeInterview,
} from '@/lib/services/onboarding-draft'

/** A clinic owner/admin with a site to personalize — the gate for every
 *  welcome-interview action. Returns the org id, or an error result. */
async function requireWelcomeClinic(): Promise<
  { ok: true; orgId: string } | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, error: 'This is only available for a clinic account.' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only the clinic owner or an admin can build the website.' }
  }
  return { ok: true, orgId: ctx.organizationId }
}

/**
 * Debounced draft save on every step advance — so a refresh resumes the
 * interview mid-flight. Best-effort: a save hiccup must never block the
 * interview, so we swallow errors and return a plain ok flag.
 */
export async function saveInterviewDraftAction(input: {
  answers: OnboardingAnswers
  serviceSlugs: string[]
  step: number
}): Promise<{ ok: boolean }> {
  const gate = await requireWelcomeClinic()
  if (!gate.ok) return { ok: false }
  try {
    await saveInterviewDraft(gate.orgId, input)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/**
 * Runs the one-pass site draft from the onboarding interview answers + the
 * services the clinic CHECKED, scoped to the caller's own clinic. On success it
 * also clears the draft + stamps completed_at (the site is now personalized).
 * Gated owner/admin — the service trusts the orgId it's handed.
 */
export async function runOnboardingDraft(
  answers: OnboardingAnswers,
  serviceSlugs: string[],
): Promise<DraftResult> {
  const gate = await requireWelcomeClinic()
  if (!gate.ok) return { ok: false, error: gate.error }
  const result = await draftSiteFromInterview(gate.orgId, answers, serviceSlugs)
  if (result.ok) {
    // Best-effort completion stamp — the draft already wrote the copy; failing
    // to clear the draft shouldn't surface as a draft failure.
    try {
      await completeInterview(gate.orgId)
    } catch {
      /* non-fatal */
    }
  }
  return result
}

/**
 * The clinic skipped the interview (or bailed after the AI failed). Mark it
 * complete so siteNeedsPersonalization flips off — they made the call, and the
 * day-0 floor already gives them a finished site. Best-effort.
 */
export async function skipInterviewAction(): Promise<{ ok: boolean }> {
  const gate = await requireWelcomeClinic()
  if (!gate.ok) return { ok: false }
  try {
    await completeInterview(gate.orgId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
