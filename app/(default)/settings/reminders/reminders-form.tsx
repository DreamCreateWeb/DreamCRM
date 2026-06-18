'use client'

import { useState, useTransition } from 'react'
import {
  REMINDER_OFFSET_MAX_HOURS,
  REMINDER_OFFSET_MIN_HOURS,
  type ReminderSettings,
} from '@/lib/types/reminders'
import { saveReminderSettingsAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { Toggle } from '@/components/ui/toggle'
import { SettingsSection, SettingsRow } from '../settings-kit'

/**
 * Settings → Reminders. Automated appointment reminders — the contract behind
 * the "we'll remind you" promise on the booking confirmation. Office-manager
 * UX: one switch, one number, one Save. Email only for now (honest about SMS).
 */
export default function RemindersForm({ initial }: { initial: ReminderSettings }) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [offsetHours, setOffsetHours] = useState(String(initial.offsetHours))
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function save() {
    setToast(null)
    setError(null)
    const n = Number(offsetHours)
    if (!Number.isFinite(n) || n < REMINDER_OFFSET_MIN_HOURS || n > REMINDER_OFFSET_MAX_HOURS) {
      setError(`Hours before must be between ${REMINDER_OFFSET_MIN_HOURS} and ${REMINDER_OFFSET_MAX_HOURS}.`)
      return
    }
    startTransition(async () => {
      const r = await saveReminderSettingsAction({ enabled, offsetHours: Math.round(n) })
      if (r.ok) setToast('Saved.')
      else setError(r.error)
    })
  }

  return (
    <SettingsSection
      title="Appointment reminders"
      description="Automatically email patients before their visit — what makes the “we’ll send you a reminder” promise on your booking confirmation true."
    >
      <div>
        <SettingsRow
          label="Send automatic reminders"
          description="When off, reminders only go out when you click “Send reminder” on an appointment."
          control={<Toggle checked={enabled} onChange={setEnabled} srLabel="Send automatic reminders" />}
        />
        <SettingsRow
          label="Hours before the visit"
          htmlFor="reminder-offset"
          description={`24 is the common default. Between ${REMINDER_OFFSET_MIN_HOURS} and ${REMINDER_OFFSET_MAX_HOURS} (7 days).`}
          control={
            <div className={`flex items-center gap-2 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
              <input
                id="reminder-offset"
                type="number"
                min={REMINDER_OFFSET_MIN_HOURS}
                max={REMINDER_OFFSET_MAX_HOURS}
                step={1}
                value={offsetHours}
                onChange={(e) => setOffsetHours(e.target.value)}
                className="w-20 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 tabular-nums"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">hours</span>
            </div>
          }
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Email only — SMS reminders are coming later. Reminders are sent from your clinic’s sender identity and render
        times in your clinic timezone. Each patient gets at most one reminder per visit.
      </p>

      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <ActionButton variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </ActionButton>
        {toast && <span className="text-xs text-emerald-600 dark:text-emerald-400">{toast}</span>}
      </div>
    </SettingsSection>
  )
}
