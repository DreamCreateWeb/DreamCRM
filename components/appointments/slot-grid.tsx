'use client'

import type { BookingSlot } from '@/lib/services/booking'

/** The sentinel `selected` value for "I'll type the time myself". */
export const MANUAL_TIME = '__custom__'

const CHIP_IDLE =
  'bg-[color:var(--color-surface-2)] text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-teal-400'
const CHIP_ACTIVE = 'bg-teal-600 text-white border-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:border-teal-400'

/**
 * The front desk's open-times picker — the chair-aware grid the booking drawer
 * has always drawn, lifted out so the reschedule panel renders the same
 * chips instead of a blind date + time box. One chip per open start for the
 * chosen day and length, plus a dashed "Custom time" hatch that reveals a
 * time input: the hatch is for the visit that starts off-grid (9:10, a
 * squeeze-in), and whatever it submits still goes through the server's
 * duration-aware guard — the grid is advice, the guard is the law.
 *
 * Controlled: the caller owns the day, the slots it loaded for it, the
 * selection (a slot's ISO, `MANUAL_TIME`, or '') and the manual time string.
 */
export function SlotGrid({
  slots,
  pending,
  selected,
  onSelect,
  manualTime,
  onManualTimeChange,
  emptyMessage = 'No open times for this date and length.',
}: {
  slots: BookingSlot[]
  /** The grid is loading for a new day/length — skeleton chips keep the height. */
  pending: boolean
  selected: string
  onSelect: (value: string) => void
  manualTime: string
  onManualTimeChange: (value: string) => void
  emptyMessage?: string
}) {
  const available = slots.filter((s) => s.available)
  const manual = selected === MANUAL_TIME

  return (
    <div>
      {pending ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden="true">
          {/* Skeleton chips in the grid's own shape — a text line made the
              panel height jump twice per date change. */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="skeleton h-8 rounded-[var(--r-sm)]" />
          ))}
        </div>
      ) : available.length === 0 && !manual ? (
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
          {emptyMessage}{' '}
          <button type="button" onClick={() => onSelect(MANUAL_TIME)} className="underline">
            Use a custom time
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 mt-2" role="group" aria-label="Open times">
          {available.map((s) => {
            const active = s.startIso === selected
            return (
              <button
                key={s.startIso}
                type="button"
                onClick={() => onSelect(s.startIso)}
                className={`h-9 rounded-[var(--r-sm)] text-xs font-semibold font-mono-num border transition-colors ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                aria-pressed={active}
              >
                {s.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => onSelect(MANUAL_TIME)}
            className={`h-9 rounded-[var(--r-sm)] text-xs font-semibold border transition-colors ${manual ? CHIP_ACTIVE : 'bg-[color:var(--color-surface-2)] text-gray-600 dark:text-gray-300 border-dashed border-gray-300 dark:border-gray-600 hover:border-teal-400'}`}
            aria-pressed={manual}
          >
            Custom time
          </button>
        </div>
      )}
      {manual && (
        <input
          type="time"
          value={manualTime}
          onChange={(e) => onManualTimeChange(e.target.value)}
          className="form-input w-full mt-2 text-sm"
          aria-label="Custom time"
        />
      )}
    </div>
  )
}

/** Local calendar day as YYYY-MM-DD (sent to the server, interpreted in the
 *  clinic's timezone — same convention as the public booking form). Staff sit
 *  in the clinic, so the browser's day is the clinic's day. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** `HH:MM` of a Date in the browser's zone — seeds the custom-time input. */
export function localTimeValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** A strict `YYYY-MM-DD` test for a caller-supplied seed. */
export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}
