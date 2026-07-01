'use client'

import { useState } from 'react'

/**
 * Office-hours grid for the Hours section. A controlled React editor over the
 * per-day open/close/closed fields, adding:
 *   - "Copy Monday to weekdays" + "Copy Monday to all days" shortcuts (the #1
 *     tedium — most clinics keep the same weekday hours),
 *   - a per-day Open/Closed toggle that collapses the time inputs when Closed,
 *   - cleaner alignment.
 *
 * It persists EXACTLY the shape the old grid did — one field per day named
 * `hours[<day>].closed` (a checkbox that submits `'on'` when checked),
 * `hours[<day>].open`, and `hours[<day>].close` (HH:MM `<input type=time>`) —
 * so `parseHours(formData)` reads it unchanged. Booking slot math + appointment
 * emails read the resulting `clinic_profile.hours` jsonb, so the stored shape
 * MUST stay `{ mon: { open, close } | { closed:true }, … }` for all 7 keys.
 *
 * Closed days deliberately still render their time inputs in the DOM (blanked +
 * hidden) so a day flipped back to Open keeps whatever times were there; and the
 * `.closed` checkbox is always present so the parser sees the closed flag.
 */

const DAYS = [
  { id: 'mon', label: 'Monday', short: 'Mon' },
  { id: 'tue', label: 'Tuesday', short: 'Tue' },
  { id: 'wed', label: 'Wednesday', short: 'Wed' },
  { id: 'thu', label: 'Thursday', short: 'Thu' },
  { id: 'fri', label: 'Friday', short: 'Fri' },
  { id: 'sat', label: 'Saturday', short: 'Sat' },
  { id: 'sun', label: 'Sunday', short: 'Sun' },
] as const

type DayId = (typeof DAYS)[number]['id']

interface DayState {
  open: string
  close: string
  closed: boolean
}

export interface HoursGridEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
}

const WEEKDAY_IDS: DayId[] = ['mon', 'tue', 'wed', 'thu', 'fri']

export default function HoursGrid({
  initial,
}: {
  initial: Record<string, HoursGridEntry>
}) {
  const [days, setDays] = useState<Record<DayId, DayState>>(() => {
    const out = {} as Record<DayId, DayState>
    for (const { id } of DAYS) {
      const e = initial[id]
      out[id] = {
        open: e?.closed ? '' : e?.open ?? '',
        close: e?.closed ? '' : e?.close ?? '',
        closed: !!e?.closed,
      }
    }
    return out
  })

  function patch(id: DayId, p: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }

  function copyMonTo(targets: DayId[]) {
    setDays((prev) => {
      const src = prev.mon
      const next = { ...prev }
      for (const id of targets) {
        if (id === 'mon') continue
        next[id] = { open: src.open, close: src.close, closed: src.closed }
      }
      return next
    })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Quick fill:</span>
        <button
          type="button"
          onClick={() => copyMonTo(WEEKDAY_IDS)}
          className="rounded-[var(--r-pill)] border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-500/[0.08] dark:hover:bg-white/[0.06] transition"
        >
          Copy Monday to weekdays
        </button>
        <button
          type="button"
          onClick={() => copyMonTo(DAYS.map((d) => d.id))}
          className="rounded-[var(--r-pill)] border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-500/[0.08] dark:hover:bg-white/[0.06] transition"
        >
          Copy Monday to all days
        </button>
      </div>

      <div className="space-y-1.5">
        {DAYS.map(({ id, label }) => {
          const d = days[id]
          return (
            <div
              key={id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-1.5 hover:bg-gray-500/[0.04] dark:hover:bg-white/[0.03]"
            >
              <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-200">
                {label}
              </span>

              {/* Open ⇄ Closed toggle. The hidden checkbox is the real form field
                  the parser reads; this segmented control drives it. */}
              <input
                type="checkbox"
                name={`hours[${id}].closed`}
                checked={d.closed}
                onChange={(e) => patch(id, { closed: e.target.checked })}
                className="sr-only"
              />
              <div className="inline-flex overflow-hidden rounded-[var(--r-pill)] border border-gray-300 dark:border-gray-600 text-xs">
                <button
                  type="button"
                  onClick={() => patch(id, { closed: false })}
                  aria-pressed={!d.closed}
                  className={`px-2.5 py-1 font-medium transition ${
                    !d.closed
                      ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                      : 'text-gray-500 hover:bg-gray-500/[0.08] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => patch(id, { closed: true })}
                  aria-pressed={d.closed}
                  className={`border-l border-gray-300 dark:border-gray-600 px-2.5 py-1 font-medium transition ${
                    d.closed
                      ? 'bg-gray-500/15 text-gray-700 dark:text-gray-200'
                      : 'text-gray-500 hover:bg-gray-500/[0.08] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  Closed
                </button>
              </div>

              {/* Time inputs collapse when Closed. Kept mounted (hidden) so a
                  re-open restores the prior times; blanked so a closed day never
                  submits stray open/close values alongside the closed flag. */}
              <div
                className={`flex items-center gap-2 transition-opacity ${
                  d.closed ? 'pointer-events-none opacity-0 select-none' : 'opacity-100'
                }`}
                aria-hidden={d.closed}
              >
                <input
                  name={`hours[${id}].open`}
                  type="time"
                  value={d.closed ? '' : d.open}
                  onChange={(e) => patch(id, { open: e.target.value })}
                  disabled={d.closed}
                  className="form-input w-32 font-mono-num tabular-nums"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  name={`hours[${id}].close`}
                  type="time"
                  value={d.closed ? '' : d.close}
                  onChange={(e) => patch(id, { close: e.target.value })}
                  disabled={d.closed}
                  className="form-input w-32 font-mono-num tabular-nums"
                />
              </div>

              {d.closed && (
                <span className="text-xs text-gray-400 dark:text-gray-500">Closed all day</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
