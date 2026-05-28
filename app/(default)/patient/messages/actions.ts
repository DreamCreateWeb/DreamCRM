'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { sendMessageFromPatient } from '@/lib/services/patient-portal'

/**
 * Patient-side reply to the clinic. In-app channel only — the front
 * desk sees it in `/messages` with an unread badge. SMS/email outbound
 * from the patient doesn't make sense in v1 (the patient already has
 * their own email/phone for those); the portal is just the dedicated
 * in-app channel.
 */
export async function sendPatientMessageAction(
  body: string,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') return { ok: false, error: 'Only patients can send portal messages' }
  if (!ctx.patientId) return { ok: false, error: 'Missing patient identity' }
  if (!body.trim()) return { ok: false, error: 'Message cannot be empty' }
  try {
    const result = await sendMessageFromPatient(ctx.organizationId, ctx.patientId, body)
    revalidatePath('/patient/messages')
    return { ok: true, threadId: result.threadId }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
