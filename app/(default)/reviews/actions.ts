'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  createAndSendReviewRequest,
  featureReviewAsTestimonial,
  skipReviewRequest,
  unfeatureReviewTestimonial,
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

/**
 * Promote a received review into a public-site testimonial. Pure toggle —
 * the quote comes from review_request.reviewText (the patient's own
 * words), not from the staff member typing. { ok, error } shape so the
 * received-list buttons can surface inline feedback. Revalidates the
 * dashboard surface, the deep editor at /settings/clinic, and the public
 * clinic site so the new testimonial appears without a manual reload.
 */
export async function featureReviewAsTestimonialAction(input: {
  patientId: string
  reviewRequestId?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot feature reviews.' }
  try {
    await featureReviewAsTestimonial({
      organizationId: ctx.organizationId,
      patientId: input.patientId,
      reviewRequestId: input.reviewRequestId,
    })
    revalidatePath('/reviews')
    revalidatePath('/reviews/received')
    revalidatePath('/settings/clinic')
    revalidatePath(`/site/${ctx.organizationSlug}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function unfeatureReviewTestimonialAction(
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot edit testimonials.' }
  try {
    await unfeatureReviewTestimonial(ctx.organizationId, patientId)
    revalidatePath('/reviews')
    revalidatePath('/reviews/received')
    revalidatePath('/settings/clinic')
    revalidatePath(`/site/${ctx.organizationSlug}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
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
