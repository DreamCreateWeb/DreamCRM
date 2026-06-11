'use client'

import { useState, useTransition } from 'react'
import {
  REMINDER_OFFSET_MAX_HOURS,
  REMINDER_OFFSET_MIN_HOURS,
  type ReminderSettings,
} from '@/lib/types/reminders'
import { saveReminderSettingsAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'

/**
 * Settings → Reminders. Automated appointment reminders — the contract behind
 * the "we'll remind you" promise on the booking confirmation. Office-manager
 * UX: one switch, one number, one Save. Email only for now (honest about SMS).
 */

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{ left: checked ? 'calc(100% - 1.375rem)' : '0.125rem' }}
      />
    </button>
  )
}

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
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Appointment reminders</h2>
      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
        Automatically email patients before their visit. This is what makes the &ldquo;we&rsquo;ll send you a
        reminder&rdquo; promise on your booking confirmation true.
      </p>

      <div className="mt-5 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">Send automatic reminders</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              When off, reminders only go out when you click &ldquo;Send reminder&rdquo; on an appointment.
            </div>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>

        <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
          <label className="block">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Hours before the visit</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={REMINDER_OFFSET_MIN_HOURS}
                max={REMINDER_OFFSET_MAX_HOURS}
                step={1}
                value={offsetHours}
                onChange={(e) => setOffsetHours(e.target.value)}
                className="w-24 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 tabular-nums"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">hours before the appointment</span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              24 is the common default. Between {REMINDER_OFFSET_MIN_HOURS} and {REMINDER_OFFSET_MAX_HOURS} (7 days).
            </p>
          </label>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Email only — SMS reminders are coming later. Reminders are sent from your clinic&rsquo;s sender identity and
          render times in your clinic timezone. Each patient gets at most one reminder per visit.
        </p>

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex items-center gap-3">
          <ActionButton variant="primary" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </ActionButton>
          {toast && <span className="text-xs text-emerald-600 dark:text-emerald-400">{toast}</span>}
        </div>
      </div>
    </section>
  )
}
