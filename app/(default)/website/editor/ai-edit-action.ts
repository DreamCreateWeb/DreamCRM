'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { applyAiWebsiteEdit, revertAiWebsiteEdit, type AiEditResult } from '@/lib/services/ai-website-edit'

/**
 * Website Studio AI command bar. Owner/admin (or platform admin in demo mode)
 * types an instruction; we translate it into edits, apply them, and revalidate
 * the public-site subtree so the canvas reload shows the changes.
 */
export async function runAiWebsiteEdit(instruction: string): Promise<AiEditResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, error: 'Only clinics can edit the website.' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can edit the website.' }
  }
  const res = await applyAiWebsiteEdit(ctx.organizationId, instruction)
  if (res.ok) {
    revalidatePath('/website')
    revalidatePath('/website/editor')
    revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
  }
  return res
}

/** Undo the previous AI edit by restoring its captured `before` values. */
export async function undoAiWebsiteEdit(
  before: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    return { ok: false, error: 'Only owners and admins can edit the website.' }
  }
  const res = await revertAiWebsiteEdit(ctx.organizationId, before)
  if (res.ok) {
    revalidatePath('/website')
    revalidatePath('/website/editor')
    revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
  }
  return res
}
