'use client'

import { useState } from 'react'

/**
 * Hours editor for the Website Studio. Renders the 7-day open/close grid with
 * field names (`hours[<day>].open|close|closed`) that `parseHours` in
 * lib/clinic-content-parse.ts reads back — so the modal just wraps this in a
 * <form> and posts it to `saveHours`. Times are native `type="time"` (HH:MM,
 * 24-hour), which matches the HHMM validation on the server.
 *
 * Open/close are CONTROLLED so we can show inline validation before save —
 * mirroring the server: an open day needs both an open and a close, and open
 * must be earlier than close.
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

/** Pure validity check for one day, reused by the test + the UI.
 *  A fully-blank day that isn't marked closed is fine (it just has no hours —
 *  renders as "—"). We only flag a PARTIAL entry (one of open/close set, not the
 *  other) or an inverted range (open ≥ close). */
export function dayHoursError(open: string, close: string, closed: boolean): string | null {
  if (closed) return null
  const hasOpen = !!open
  const hasClose = !!close
  if (!hasOpen && !hasClose) return null // no hours set for this day — valid
  if (hasOpen !== hasClose) return 'Set an open and close time, or mark the day closed.'
  if (open >= close) return 'Open time must be before close time.'
  return null
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
  const [open, setOpen] = useState<Record<string, string>>(
    Object.fromEntries(DAYS.map((d) => [d.id, init[d.id]?.closed ? '' : init[d.id]?.open ?? ''])),
  )
  const [close, setClose] = useState<Record<string, string>>(
    Object.fromEntries(DAYS.map((d) => [d.id, init[d.id]?.closed ? '' : init[d.id]?.close ?? ''])),
  )

  return (
    <div className="space-y-1.5">
      {DAYS.map(({ id, label }) => {
        const isClosed = closedDays[id]
        const err = dayHoursError(open[id] ?? '', close[id] ?? '', isClosed)
        return (
          <div key={id}>
            <div className="flex items-center gap-2.5">
              <span className="w-20 shrink-0 text-[13px] font-medium text-gray-700 dark:text-gray-200">
                {label}
              </span>
              <input
                type="time"
                name={`hours[${id}].open`}
                value={isClosed ? '' : open[id] ?? ''}
                onChange={(e) => setOpen((s) => ({ ...s, [id]: e.target.value }))}
                disabled={isClosed}
                aria-label={`${label} open`}
                aria-invalid={!!err}
                className={`form-input text-sm py-1 disabled:opacity-40 ${err ? 'border-rose-400' : ''}`}
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="time"
                name={`hours[${id}].close`}
                value={isClosed ? '' : close[id] ?? ''}
                onChange={(e) => setClose((s) => ({ ...s, [id]: e.target.value }))}
                disabled={isClosed}
                aria-label={`${label} close`}
                aria-invalid={!!err}
                className={`form-input text-sm py-1 disabled:opacity-40 ${err ? 'border-rose-400' : ''}`}
              />
              <label className="flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400 ml-auto">
                <input
                  type="checkbox"
                  name={`hours[${id}].closed`}
                  checked={isClosed}
                  onChange={(e) => setClosedDays((s) => ({ ...s, [id]: e.target.checked }))}
                  className="form-checkbox"
                />
                Closed
              </label>
            </div>
            {err && (
              <p className="ml-[5.6rem] mt-0.5 text-xs text-rose-600" role="alert">
                {err}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
