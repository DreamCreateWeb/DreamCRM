'use client'

import { useState, useTransition } from 'react'
import { bookSlotAction, cancelBookingAction } from './actions'

interface DayGroup {
  dayKey: string
  label: string
  slots: Array<{ iso: string; time: string }>
}

/**
 * The prospect-facing booking widget — slot picker + name/email, or the
 * confirmed state with reschedule/cancel. All times are pre-formatted in the
 * prospect's timezone server-side; this component just picks + submits.
 */
export default function BookingForm({
  token,
  durationMin,
  tzAbbrev,
  dayGroups,
  bookingEnabled,
  confirmedTime,
  defaultName,
  defaultEmail,
}: {
  token: string
  durationMin: number
  tzAbbrev: string
  dayGroups: DayGroup[]
  bookingEnabled: boolean
  confirmedTime: string | null
  defaultName: string | null
  defaultEmail: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [rescheduling, setRescheduling] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState(defaultName ?? '')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = () =>
    startTransition(async () => {
      setError(null)
      if (!selected) return setError('Pick a time first.')
      const res = await bookSlotAction({ token, slotIso: selected, name, email, note })
      if (res.ok) {
        setDone(true)
        window.location.reload()
      } else {
        setError(res.error)
      }
    })

  const cancel = () =>
    startTransition(async () => {
      await cancelBookingAction(token)
      window.location.reload()
    })

  // Confirmed view (not currently rescheduling).
  if (confirmedTime && !rescheduling) {
    return (
      <div className="text-center">
        <div className="text-3xl mb-2">✅</div>
        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{confirmedTime}</div>
        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{durationMin} minutes · Dream Create demo</div>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          A calendar invite is in your inbox. See you then!
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setRescheduling(true)}
            className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
          >
            Reschedule
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={cancel}
            className="text-sm text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (!bookingEnabled || dayGroups.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400">
        No times are open right now — reply to our email and we&apos;ll find one that works.
      </p>
    )
  }

  return (
    <div>
      {rescheduling && (
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">Pick a new time below.</p>
      )}
      <div className="text-xs text-gray-400 mb-2">Times shown in your timezone{tzAbbrev ? ` (${tzAbbrev})` : ''}</div>
      <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
        {dayGroups.map((g) => (
          <div key={g.dayKey}>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.slots.map((s) => (
                <button
                  key={s.iso}
                  type="button"
                  onClick={() => setSelected(s.iso)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    selected === s.iso
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-[color:var(--color-hairline)] text-gray-700 dark:text-gray-200 hover:border-teal-500'
                  }`}
                >
                  {s.time}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3 border-t border-[color:var(--color-hairline)] pt-4">
        <input
          className="form-input w-full text-sm"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="form-input w-full text-sm"
          type="email"
          placeholder="Your email (for the calendar invite)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <textarea
          className="form-textarea w-full text-sm"
          rows={2}
          placeholder="Anything you'd like us to focus on? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button
          type="button"
          disabled={pending || done || !selected || !email.trim()}
          onClick={submit}
          className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? 'Booking…' : rescheduling ? 'Confirm new time' : 'Book my demo'}
        </button>
      </div>
    </div>
  )
}
