'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { updateReminderSettings } from '@/lib/services/reminder-automation'
import { resolveReminderSettings } from '@/lib/types/reminders'

export type SaveReminderSettingsResult = { ok: true } | { ok: false; error: string }

/**
 * Persist the clinic's automated-reminder settings. Owner/admin only — this
 * controls email that goes to every patient with an upcoming visit.
 */
export async function saveReminderSettingsAction(raw: unknown): Promise<SaveReminderSettingsResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can edit reminder settings.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can change reminder settings.' }
  }

  // The resolver clamps the offset + drops junk, so a malformed payload can't
  // poison the column.
  const cleaned = resolveReminderSettings(raw)
  await updateReminderSettings(ctx.organizationId, cleaned)

  revalidatePath('/settings/reminders')
  return { ok: true }
}
