import 'server-only'
import { getTenantContext } from '@/lib/auth/context'

/**
 * Edit-mode authorization for the Website Studio canvas, shared by the
 * `/site/[slug]` layout (which mounts the EditBridge for every clinic page)
 * and the homepage. Gated hard: the current viewer's active tenant context
 * must be THIS clinic with an owner/admin role. Resolved via
 * `getTenantContext()` (not a raw member lookup) so it also recognizes a
 * platform admin in "View as clinic" demo mode — whose authorization comes
 * from the demo_context cookie, not a member row.
 *
 * This only governs the in-canvas affordances; persistence is independently
 * gated inside the server actions, so a stray viewer can never write.
 */
export async function canEditClinic(orgId: string): Promise<boolean> {
  try {
    const ctx = await getTenantContext()
    return (
      ctx?.tenantType === 'clinic' &&
      ctx.organizationId === orgId &&
      (ctx.role === 'owner' || ctx.role === 'admin')
    )
  } catch {
    return false
  }
}

/** `?edit=1` AND the viewer may edit this clinic. */
export async function resolveEditMode(orgId: string, edit: boolean): Promise<boolean> {
  return edit ? canEditClinic(orgId) : false
}
