'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  renderAutomationPreview,
  saveEmailAutomationOverride,
  sendAutomationTestEmail,
} from '@/lib/services/email-automations'
import { checkRateLimit } from '@/lib/services/rate-limit'
import { updateReminderSettings } from '@/lib/services/reminder-automation'
import { resolveReminderSettings } from '@/lib/types/reminders'
import {
  isEmailAutomationKey,
  type EmailAutomationOverride,
  type EmailSlots,
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

/** "Send me a test": at most this many per signed-in user per hour. */
const TEST_EMAIL_LIMIT = 5
const TEST_EMAIL_WINDOW_MS = 60 * 60 * 1000

export type PreviewEmailAutomationResult =
  | { ok: true; subject: string; html: string; text: string }
  | { ok: false; error: string }

/**
 * The REAL email for the CURRENT unsaved draft: the subject, the HTML a patient
 * receives (clinic identity, shell, sample values) and its plain-text twin. The
 * hub shows the HTML in a sandboxed iframe. Any clinic member may look; nothing
 * is saved or sent. In demo mode the active org IS the demo clinic, so the
 * preview wears the demo clinic's identity.
 */
export async function previewEmailAutomationAction(
  key: string,
  draft: Partial<EmailSlots>,
): Promise<PreviewEmailAutomationResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics have automated emails.' }
  if (!isEmailAutomationKey(key)) return { ok: false, error: 'Unknown email.' }
  try {
    const { subject, html, text } = await renderAutomationPreview(ctx.organizationId, key, draft ?? {})
    return { ok: true, subject, html, text }
  } catch {
    return { ok: false, error: 'Could not build the preview.' }
  }
}

export type SendTestEmailResult = { ok: true; to: string } | { ok: false; error: string }

/**
 * Send the draft, with sample values, through the real send path to the
 * SIGNED-IN user's own address and nobody else's. Owner/admin only; capped at
 * 5 an hour per user.
 */
export async function sendTestEmailAction(
  key: string,
  draft: Partial<EmailSlots>,
): Promise<SendTestEmailResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can send test emails.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only an owner or admin can send a test email.' }
  }
  if (!isEmailAutomationKey(key)) return { ok: false, error: 'Unknown email.' }
  if (!ctx.userEmail) return { ok: false, error: 'Your account has no email address to send to.' }
  const limit = await checkRateLimit(`email-test:${ctx.userId}`, TEST_EMAIL_LIMIT, TEST_EMAIL_WINDOW_MS)
  if (!limit.allowed) {
    return { ok: false, error: `You\u2019ve sent ${TEST_EMAIL_LIMIT} test emails in the last hour. Try again a little later.` }
  }
  try {
    await sendAutomationTestEmail(ctx.organizationId, key, draft ?? {}, ctx.userEmail)
    return { ok: true, to: ctx.userEmail }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send the test email.' }
  }
}
