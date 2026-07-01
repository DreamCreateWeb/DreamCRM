import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Reminders moved into Settings → Automations → Emails (the appointment-reminder
 * card, which owns the reminder copy + timing + on/off in one place). Kept as a
 * redirect so old links + the settings search entry still land on it. The
 * reminder timing controls + save action live on in ./reminders-form.tsx and
 * ./actions.ts, reused by the Emails hub.
 */
export default function RemindersRedirect() {
  redirect('/settings/automations/emails?email=appointment_reminder')
}
