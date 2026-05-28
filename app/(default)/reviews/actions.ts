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
 * Promote a received review into a public-site testimonial. Mirrors
 * sendReviewRequestAction's { ok, error } shape so the capture modal can
 * render inline feedback. Revalidates the dashboard surface, the deep
 * editor at /settings/clinic, and the public clinic site so the new
 * testimonial appears without a manual reload.
 */
export async function featureReviewAsTestimonialAction(input: {
  patientId: string
  quote: string
  authorNameOverride?: string | null
  authorPhotoUrl?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Reviews is only available for clinic tenants.' }
  if (ctx.role === 'patient') return { ok: false, error: 'Patients cannot feature reviews.' }
  try {
    await featureReviewAsTestimonial({
      organizationId: ctx.organizationId,
      patientId: input.patientId,
      quote: input.quote,
      authorNameOverride: input.authorNameOverride ?? null,
      authorPhotoUrl: input.authorPhotoUrl ?? null,
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
