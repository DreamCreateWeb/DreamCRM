'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { updatePortalSettings } from '@/lib/services/portal-settings'
import { resolvePortalSettings } from '@/lib/types/portal'

export type SavePortalSettingsResult = { ok: true } | { ok: false; error: string }

/**
 * Persist the clinic's patient-portal settings. Owner/admin only — this
 * controls what every patient of the practice can see and do.
 */
export async function savePortalSettingsAction(raw: unknown): Promise<SavePortalSettingsResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can edit portal settings.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can change portal settings.' }
  }

  // The resolver drops junk keys/values, so a malformed payload can't
  // poison the column.
  const cleaned = resolvePortalSettings(raw)

  // The resolver quietly falls back to our portal when an external choice has
  // no usable address — right for a read, wrong for a save: the person just
  // asked for the other portal and should hear why it didn't stick.
  const askedExternal =
    !!raw && typeof raw === 'object' &&
    ((raw as { login?: { destination?: unknown } }).login?.destination === 'external')
  if (askedExternal && cleaned.login.destination !== 'external') {
    return {
      ok: false,
      error: 'Enter the full address of the other portal, starting with https://, or switch back to the DreamCRM portal.',
    }
  }

  await updatePortalSettings(ctx.organizationId, cleaned)

  revalidatePath('/settings/portal')
  revalidatePath('/patient/dashboard')
  return { ok: true }
}
