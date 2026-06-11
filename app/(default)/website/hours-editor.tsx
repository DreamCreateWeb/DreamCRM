'use client'

import { useState } from 'react'

/**
 * Hours editor for the Website Studio. Renders the 7-day open/close grid with
 * field names (`hours[<day>].open|close|closed`) that `parseHours` in
 * lib/clinic-content-parse.ts reads back — so the modal just wraps this in a
 * <form> and posts it to `saveHours`. Times are native `type="time"` (HH:MM,
 * 24-hour), which matches the HHMM validation on the server.
 */
const DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
] as const

interface HoursEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
}

export default function HoursEditor({
  defaultValue,
}: {
  defaultValue?: Record<string, HoursEntry> | null
}) {
  const init = defaultValue ?? {}
  const [closedDays, setClosedDays] = useState<Record<string, boolean>>(
    Object.fromEntries(DAYS.map((d) => [d.id, !!init[d.id]?.closed])),
  )

  return (
    <div className="space-y-1.5">
      {DAYS.map(({ id, label }) => {
        const day = init[id]
        const isClosed = closedDays[id]
        return (
          <div key={id} className="flex items-center gap-2.5">
            <span className="w-20 shrink-0 text-[13px] font-medium text-gray-700 dark:text-gray-200">
              {label}
            </span>
            <input
              type="time"
              name={`hours[${id}].open`}
              defaultValue={day?.closed ? '' : day?.open ?? ''}
              disabled={isClosed}
              aria-label={`${label} open`}
              className="form-input text-sm py-1 disabled:opacity-40"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="time"
              name={`hours[${id}].close`}
              defaultValue={day?.closed ? '' : day?.close ?? ''}
              disabled={isClosed}
              aria-label={`${label} close`}
              className="form-input text-sm py-1 disabled:opacity-40"
            />
            <label className="flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400 ml-auto">
              <input
                type="checkbox"
                name={`hours[${id}].closed`}
                defaultChecked={isClosed}
                onChange={(e) => setClosedDays((s) => ({ ...s, [id]: e.target.checked }))}
                className="form-checkbox"
              />
              Closed
            </label>
          </div>
        )
      })}
    </div>
  )
}
