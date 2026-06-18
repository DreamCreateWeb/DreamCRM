'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  reorderMessageTemplates,
  type MessageTemplateRow,
} from '@/lib/services/message-templates'

/**
 * Message-template management. Owner/admin only — templates are shared across
 * every staff member's /messages composer, so a `member` can't edit the
 * catalog (they still USE the templates when replying). Clinic tenants only.
 */
async function requireClinicAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Message templates are a clinic feature.')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only an owner or admin can edit message templates.')
  }
  return ctx
}

export async function createMessageTemplateAction(input: {
  name: string
  body: string
  shortcut?: string | null
}): Promise<{ ok: true; template: MessageTemplateRow } | { ok: false; error: string }> {
  let ctx
  try {
    ctx = await requireClinicAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Not allowed' }
  }
  try {
    const template = await createMessageTemplate(ctx.organizationId, input, ctx.userId)
    revalidatePath('/settings/message-templates')
    return { ok: true, template }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the template' }
  }
}

export async function updateMessageTemplateAction(
  id: string,
  patch: { name?: string; body?: string; shortcut?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx
  try {
    ctx = await requireClinicAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Not allowed' }
  }
  try {
    await updateMessageTemplate(ctx.organizationId, id, patch)
    revalidatePath('/settings/message-templates')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the template' }
  }
}

export async function deleteMessageTemplateAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx
  try {
    ctx = await requireClinicAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Not allowed' }
  }
  await deleteMessageTemplate(ctx.organizationId, id)
  revalidatePath('/settings/message-templates')
  return { ok: true }
}

export async function reorderMessageTemplatesAction(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  let ctx
  try {
    ctx = await requireClinicAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Not allowed' }
  }
  await reorderMessageTemplates(ctx.organizationId, orderedIds)
  revalidatePath('/settings/message-templates')
  return { ok: true }
}
