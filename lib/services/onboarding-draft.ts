import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import {
  resolveInterviewDraft,
  type OnboardingInterviewDraft,
} from '@/lib/types/onboarding-interview'

/**
 * Server-persisted draft of the post-checkout AI website interview. Saved
 * (debounced) on every step advance so a refresh resumes mid-interview;
 * CLEARED on successful completion (which also stamps completed_at). All scoped
 * to a single org — the action layer gates owner/admin.
 */

/** Load the in-flight draft to resume, or null when there's none. */
export async function getInterviewDraft(orgId: string): Promise<OnboardingInterviewDraft | null> {
  const [row] = await db
    .select({ draft: clinicProfile.onboardingInterviewDraft })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!row) return null
  return resolveInterviewDraft(row.draft)
}

/**
 * Save (upsert) the draft. Sanitizes through resolveInterviewDraft so junk can
 * never land in the column. No-ops cleanly when the profile row is missing
 * (the onboarding upsert always runs first; defensive).
 */
export async function saveInterviewDraft(
  orgId: string,
  input: { answers: Record<string, string>; serviceSlugs: string[]; step: number },
): Promise<void> {
  const draft: OnboardingInterviewDraft = {
    answers: sanitizeAnswers(input.answers),
    serviceSlugs: (input.serviceSlugs ?? []).filter((s) => typeof s === 'string'),
    step: Number.isFinite(input.step) ? Math.max(0, Math.floor(input.step)) : 0,
    updatedAt: new Date().toISOString(),
  }
  await db
    .update(clinicProfile)
    .set({ onboardingInterviewDraft: draft, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, orgId))
}

/**
 * Mark the interview complete: clear the draft + stamp completed_at. Called on
 * a successful draft AND when the clinic skips through to the end (so a skip
 * still flips siteNeedsPersonalization off — they made the call).
 */
export async function completeInterview(orgId: string): Promise<void> {
  await db
    .update(clinicProfile)
    .set({
      onboardingInterviewDraft: null,
      onboardingInterviewCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clinicProfile.organizationId, orgId))
}

function sanitizeAnswers(answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (answers && typeof answers === 'object') {
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === 'string') out[k] = v.slice(0, 4000)
    }
  }
  return out
}
