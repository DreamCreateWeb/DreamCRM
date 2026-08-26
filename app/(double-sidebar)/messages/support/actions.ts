'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { getSupportThread, postMessage } from '@/lib/services/messages'

/**
 * Send a message into the clinic's support thread. Clinic staff only — the
 * tenant check is the authorization (the demo org never reaches here; its
 * support surface is a preview with the composer disabled).
 */
export async function sendSupportMessage(body: unknown): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await requireTenant()
    if (ctx.tenantType !== 'clinic' || !ctx.organizationId || ctx.isDemo) {
      return { error: 'Only clinic staff can message support.' }
    }
    const text = typeof body === 'string' ? body.trim() : ''
    if (!text) return { error: 'Write a message first.' }
    // getSupportThread verifies the caller is staff and returns the org
    // thread (creating it on first use); postMessage re-checks membership
    // and fires the platform-side notification.
    const thread = await getSupportThread(ctx.organizationId, ctx.userId)
    await postMessage({ conversationId: thread.conversationId, body: text }, ctx.userId)
    revalidatePath('/messages/support')
    return { ok: true }
  } catch (err) {
    return { error: (err as Error).message }
  }
}
