'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  upsertAutomationOverride,
  deleteAutomationOverride,
  getAutomationTemplate,
} from '@/lib/services/marketing-templates'
import { isRetentionKind } from '@/lib/types/retention'

/**
 * Save / reset the message a retention automation sends (campaigns phase 2).
 * Owner/admin only — same bar as flipping the automation itself. The next
 * auto-send picks the new copy up automatically (the engine reads
 * getAutomationTemplate at campaign-creation time).
 */

type Result = { ok: true } | { ok: false; error: string }

async function requireAutomationManager() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Automations are a clinic feature.')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only an owner or admin can edit automation messages.')
  }
  return ctx
}

export async function saveAutomationMessageAction(
  kind: string,
  input: { subject: string; previewText: string; bodyHtml: string },
): Promise<Result> {
  try {
    const ctx = await requireAutomationManager()
    if (!isRetentionKind(kind)) return { ok: false, error: 'Unknown automation.' }
    const subject = input.subject.trim()
    const bodyHtml = input.bodyHtml.trim()
    if (!subject) return { ok: false, error: 'Add a subject line.' }
    if (!bodyHtml || bodyHtml === '<p></p>') return { ok: false, error: 'Write the message body.' }
    await upsertAutomationOverride(
      ctx.organizationId,
      kind,
      { subject, previewText: input.previewText.trim() || null, bodyHtml },
      ctx.userId,
    )
    revalidatePath('/growth/outreach')
    revalidatePath(`/growth/outreach/automations/${kind}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save. Try again.' }
  }
}

export async function resetAutomationMessageAction(
  kind: string,
): Promise<Result & { message?: { subject: string; previewText: string; bodyHtml: string } }> {
  try {
    const ctx = await requireAutomationManager()
    if (!isRetentionKind(kind)) return { ok: false, error: 'Unknown automation.' }
    await deleteAutomationOverride(ctx.organizationId, kind)
    const sys = await getAutomationTemplate(ctx.organizationId, kind)
    revalidatePath('/growth/outreach')
    revalidatePath(`/growth/outreach/automations/${kind}`)
    return {
      ok: true,
      message: { subject: sys.subject, previewText: sys.previewText ?? '', bodyHtml: sys.bodyHtml },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reset. Try again.' }
  }
}
