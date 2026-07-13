'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { saveEmailAutomationOverride } from '@/lib/services/email-automations'
import { updateReminderSettings } from '@/lib/services/reminder-automation'
import { resolveReminderSettings } from '@/lib/types/reminders'
import {
  isEmailAutomationKey,
  type EmailAutomationOverride,
} from '@/lib/types/email-automations'

export type SaveReminderSettingsResult = { ok: true } | { ok: false; error: string }

/**
 * Persist the clinic's automated-reminder settings (the reminder card's
 * journey timing + on/off). Owner/admin only — this controls email that goes
 * to every patient with an upcoming visit. Lives here because the Emails hub
 * is the setting's only UI (/settings/reminders is just a redirect stub).
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

  revalidatePath('/settings/automations/emails')
  return { ok: true }
}

export type SaveEmailAutomationResult = { ok: true } | { ok: false; error: string }

/**
 * Persist one automated email's editable copy (Settings → Automations → Emails).
 * Owner/admin only — this changes email that goes to every patient. The service
 * normalizes the override (drops empty + default-equal slots) so an untouched
 * Save leaves the email on its byte-identical built-in copy.
 */
export async function saveEmailAutomationAction(
  key: string,
  override: EmailAutomationOverride,
): Promise<SaveEmailAutomationResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can edit automated emails.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can edit automated emails.' }
  }
  if (!isEmailAutomationKey(key)) return { ok: false, error: 'Unknown email.' }
  try {
    await saveEmailAutomationOverride(ctx.organizationId, key, override ?? {})
    revalidatePath('/settings/automations/emails')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the email.' }
  }
}
