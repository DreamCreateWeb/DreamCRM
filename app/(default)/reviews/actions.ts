'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  createAndSendReviewRequest,
  skipReviewRequest,
  updateReviewConfig,
  type ReviewChannel,
  type ReviewConfig,
} from '@/lib/services/reviews'
import {
  syncGoogleReviews,
  replyToGoogleReview,
  deleteGoogleReviewReply,
  setGoogleReviewHidden,
} from '@/lib/services/google-reviews'
import { syncFacebookReviews } from '@/lib/services/facebook-reviews'

function ensureClinicAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Reviews is only available for clinic tenants.')
  }
  if (ctx.role === 'patient') {
    throw new Error('Patients cannot send review requests.')
  }
}

export async function sendReviewRequestAction(input: {
  patientId: string
  appointmentId?: string
  channel?: ReviewChannel
}) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const result = await createAndSendReviewRequest({
    organizationId: ctx.organizationId,
    patientId: input.patientId,
    appointmentId: input.appointmentId,
    channel: input.channel ?? 'email',
    requestedByUserId: ctx.userId,
  })
  revalidatePath('/reviews')
  return result
}

export async function skipReviewAction(requestId: string) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await skipReviewRequest(ctx.organizationId, requestId)
  revalidatePath('/reviews')
}

export async function updateReviewConfigAction(updates: Partial<Omit<ReviewConfig, 'organizationId'>>) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await updateReviewConfig(ctx.organizationId, updates)
  revalidatePath('/reviews')
}

// ── Google Business reviews (synced via Zernio) ──────────────────────────────

/**
 * Pull the org's Google reviews from Google (via Zernio) on demand. Owner/admin
 * only. Returns the count synced (or a skip reason). Revalidates the surfaces
 * the reviews render on + the public site (AggregateRating may change).
 */
export async function syncGoogleReviewsAction(): Promise<
  { ok: true; synced: number; skipped?: string } | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot sync reviews.' }
  const r = await syncGoogleReviews(ctx.organizationId)
  if (!r.ok) return { ok: false, error: r.error ?? 'Sync failed.' }
  revalidatePath('/reviews')
  revalidatePath('/reviews/received')
  revalidatePath(`/site/${ctx.organizationSlug}`)
  return { ok: true, synced: r.synced, skipped: r.skipped }
}

/** Post (or overwrite) the clinic's reply to a Google review. Owner/admin only. */
export async function replyToGoogleReviewAction(input: {
  externalReviewId: string
  text: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot reply to reviews.' }
  const r = await replyToGoogleReview(ctx.organizationId, input.externalReviewId, input.text)
  if (r.ok) revalidatePath('/reviews/received')
  return r
}

/** Draft a reply to a Google review with AI (metered per org/month). The
 *  draft lands in the editor for the clinic to read + edit — never auto-posts. */
export async function draftGoogleReviewReplyAction(
  externalReviewId: string,
): Promise<{ ok: true; draft: string; remaining: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot reply to reviews.' }
  const { draftGoogleReviewReply } = await import('@/lib/services/review-reply-ai')
  return draftGoogleReviewReply({
    organizationId: ctx.organizationId,
    externalReviewId,
    planTier: ctx.planTier,
  })
}

/** Remove the clinic's reply from a Google review. Owner/admin only. */
export async function deleteGoogleReviewReplyAction(
  externalReviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot manage replies.' }
  const r = await deleteGoogleReviewReply(ctx.organizationId, externalReviewId)
  if (r.ok) revalidatePath('/reviews/received')
  return r
}

/**
 * Hide (or un-hide) a Google review from the public website. Owner/admin only.
 * Revalidates the reviews surfaces AND the public site (auto-feature changes).
 */
export async function setGoogleReviewHiddenAction(input: {
  externalReviewId: string
  hidden: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot manage reviews.' }
  const r = await setGoogleReviewHidden(ctx.organizationId, input.externalReviewId, input.hidden)
  if (r.ok) {
    revalidatePath('/reviews/received')
    revalidatePath('/reviews')
    revalidatePath(`/site/${ctx.organizationSlug}`)
  }
  return r
}

// ── Facebook reviews / recommendations (synced via Zernio) ───────────────────

/**
 * Pull the org's Facebook recommendations from Facebook (via Zernio) on demand.
 * Owner/admin only. Returns the count synced (or a skip reason). FB
 * recommendations are read-only (no reply endpoint) + excluded from the public
 * AggregateRating, so this only revalidates the reviews surfaces.
 */
export async function syncFacebookReviewsAction(): Promise<
  { ok: true; synced: number; skipped?: string } | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot sync reviews.' }
  const r = await syncFacebookReviews(ctx.organizationId)
  if (!r.ok) return { ok: false, error: r.error ?? 'Sync failed.' }
  revalidatePath('/reviews')
  revalidatePath('/reviews/received')
  return { ok: true, synced: r.synced, skipped: r.skipped }
}
