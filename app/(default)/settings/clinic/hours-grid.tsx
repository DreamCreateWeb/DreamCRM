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
 * Three per-day modes via a segmented control: Open (a timed range), By appt
 * ("By appointment only" — no time, no online slots), or Closed. The hidden
 * form fields the parser reads are `hours[<day>].closed` and
 * `hours[<day>].byAppointment` (checkboxes → `'on'`), plus
 * `hours[<day>].open`/`.close` (HH:MM `<input type=time>`), so
 * `parseHours(formData)` reads it unchanged. Booking slot math + appointment
 * emails read the resulting `clinic_profile.hours` jsonb; the stored shape is
 * `{ mon: { open, close } | { closed:true } | { byAppointment:true }, … }`.
 *
 * Non-Open days deliberately still render their time inputs in the DOM (blanked
 * + hidden) so a day flipped back to Open keeps whatever times were there; the
 * closed + byAppointment checkboxes are always present so the parser sees the
 * mode.
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
type DayMode = 'open' | 'appt' | 'closed'

interface DayState {
  open: string
  close: string
  mode: DayMode
}

export interface HoursGridEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
  byAppointment?: boolean
}

const WEEKDAY_IDS: DayId[] = ['mon', 'tue', 'wed', 'thu', 'fri']

function entryMode(e: HoursGridEntry | undefined): DayMode {
  if (e?.closed) return 'closed'
  if (e?.byAppointment) return 'appt'
  return 'open'
}

export default function HoursGrid({
  initial,
}: {
  initial: Record<string, HoursGridEntry>
}) {
  const [days, setDays] = useState<Record<DayId, DayState>>(() => {
    const out = {} as Record<DayId, DayState>
    for (const { id } of DAYS) {
      const e = initial[id]
      const mode = entryMode(e)
      out[id] = {
        open: mode === 'open' ? e?.open ?? '' : '',
        close: mode === 'open' ? e?.close ?? '' : '',
        mode,
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
        next[id] = { open: src.open, close: src.close, mode: src.mode }
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
          const isOpen = d.mode === 'open'
          return (
            <div
              key={id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-1.5 hover:bg-gray-500/[0.04] dark:hover:bg-white/[0.03]"
            >
              <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-200">
                {label}
              </span>

              {/* Open / By appt / Closed. The two hidden checkboxes are the real
                  form fields the parser reads; this segmented control drives
                  them (mutually exclusive — only one is ever 'on'). */}
              <input
                type="checkbox"
                name={`hours[${id}].closed`}
                checked={d.mode === 'closed'}
                readOnly
                className="sr-only"
                tabIndex={-1}
              />
              <input
                type="checkbox"
                name={`hours[${id}].byAppointment`}
                checked={d.mode === 'appt'}
                readOnly
                className="sr-only"
                tabIndex={-1}
              />
              <div className="inline-flex overflow-hidden rounded-[var(--r-pill)] border border-gray-300 dark:border-gray-600 text-xs">
                {([
                  { m: 'open', label: 'Open' },
                  { m: 'appt', label: 'By appt' },
                  { m: 'closed', label: 'Closed' },
                ] as const).map(({ m, label: ml }, i) => {
                  const active = d.mode === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => patch(id, { mode: m })}
                      aria-pressed={active}
                      className={`${i > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''} px-2.5 py-1 font-medium transition ${
                        active
                          ? m === 'open'
                            ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                            : m === 'appt'
                              ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                              : 'bg-gray-500/15 text-gray-700 dark:text-gray-200'
                          : 'text-gray-500 hover:bg-gray-500/[0.08] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {ml}
                    </button>
                  )
                })}
              </div>

              {/* Time inputs show only for Open. Kept mounted (hidden) otherwise
                  so a re-open restores the prior times; blanked so a non-Open
                  day never submits stray open/close values alongside its flag. */}
              <div
                className={`flex items-center gap-2 transition-opacity ${
                  isOpen ? 'opacity-100' : 'pointer-events-none opacity-0 select-none'
                }`}
                aria-hidden={!isOpen}
              >
                <input
                  name={`hours[${id}].open`}
                  type="time"
                  value={isOpen ? d.open : ''}
                  onChange={(e) => patch(id, { open: e.target.value })}
                  disabled={!isOpen}
                  className="form-input w-32 font-mono-num tabular-nums"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  name={`hours[${id}].close`}
                  type="time"
                  value={isOpen ? d.close : ''}
                  onChange={(e) => patch(id, { close: e.target.value })}
                  disabled={!isOpen}
                  className="form-input w-32 font-mono-num tabular-nums"
                />
              </div>

              {d.mode === 'closed' && (
                <span className="text-xs text-gray-400 dark:text-gray-500">Closed all day</span>
              )}
              {d.mode === 'appt' && (
                <span className="text-xs text-violet-600 dark:text-violet-300">By appointment only</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
