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
