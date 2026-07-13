import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Reminders moved into Settings → Automations → Emails (the appointment-reminder
 * card, which owns the reminder copy + journey timing + on/off in one place).
 * Kept as a redirect so old links + the settings search entry still land on it.
 * The save action lives with the Emails hub (../automations/emails/actions.ts).
 */
export default function RemindersRedirect() {
  redirect('/settings/automations/emails?email=appointment_reminder')
}
