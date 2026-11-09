'use client'

/**
 * THE follow-up row — one recipe for the /followups board AND the patient
 * record's panel, so they cannot drift (the panel had hand-rolled its tick and
 * hid the remove behind a hover).
 *
 * A row knows WHY it exists (the kind glyph) and WHERE to go do it (the title
 * is the door). The tick closes it through a tiny "How did it go?" picker that
 * is shown BEFORE anything is sent (the dialog law: nothing is awaited inside
 * a transition while a picker is open). Snooze expands inline: tomorrow /
 * 3 days / next week / a picked date. The server turns every choice into a
 * clinic-local day; the labels here are display only.
 */
import Link from 'next/link'
import { useState } from 'react'
import { TickButton } from '@/components/ui/tick-button'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  FOLLOWUP_KINDS,
  FOLLOWUP_OUTCOMES,
  SNOOZE_PRESETS,
  addDaysYmd,
  followupDueState,
  formatDueLabel,
  isSnoozed,
  todayYmd,
  type FollowupDueState,
  type FollowupOutcome,
  type PatientFollowupView,
  type SnoozePreset,
} from '@/lib/types/followups'

export const DUE_TONE: Record<FollowupDueState, string> = {
  overdue: 'text-rose-600 dark:text-rose-400',
  today: 'text-amber-700 dark:text-amber-300',
  soon: 'text-gray-500 dark:text-gray-400',
  later: 'text-gray-500 dark:text-gray-400',
  none: 'text-gray-500 dark:text-gray-400',
}

export type SnoozeChoice = { preset: SnoozePreset } | { date: string }

const SECONDARY_BTN =
  'inline-flex min-h-10 items-center rounded-md px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'

export function FollowupRow({
  f,
  done = false,
  pending = false,
  disabled = false,
  showPatient = true,
  onComplete,
  onReopen,
  onSnooze,
  onRemove,
  onReassign,
  staff = [],
  currentUserId = '',
}: {
  f: PatientFollowupView
  done?: boolean
  /** THIS row's action is running. */
  pending?: boolean
  /** Some row's action is running; controls are unavailable. */
  disabled?: boolean
  /** The board names the patient under the title; the record's panel doesn't. */
  showPatient?: boolean
  onComplete?: (outcome: FollowupOutcome | null) => void
  onReopen?: () => void
  onSnooze?: (choice: SnoozeChoice) => void
  onRemove?: () => void
  onReassign?: (userId: string | null) => void
  staff?: Array<{ userId: string; name: string }>
  currentUserId?: string
}) {
  const [panel, setPanel] = useState<'none' | 'outcome' | 'snooze'>('none')
  const [pickedDate, setPickedDate] = useState('')
  const kind = FOLLOWUP_KINDS[f.kind]
  const today = todayYmd()
  const due = followupDueState(f.dueDate)
  const snoozed = !done && isSnoozed(f.snoozedUntil, today)
  const minDate = addDaysYmd(today, 1)

  return (
    <li className="px-4 py-2">
      <div className="flex items-center gap-3">
        <TickButton
          done={done}
          pending={pending}
          disabled={disabled}
          onToggle={() => {
            if (done) onReopen?.()
            else setPanel((p) => (p === 'outcome' ? 'none' : 'outcome'))
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <span
              className={`shrink-0 ${TONE_TEXT.neutral}`}
              title={kind.label}
              role="img"
              aria-label={kind.label}
            >
              {kind.symbol}
            </span>
            {done ? (
              <span className="text-gray-500 line-through dark:text-gray-400">{f.title}</span>
            ) : (
              <Link
                href={kind.door(f.patientId)}
                title={kind.doorLabel}
                className="min-w-0 truncate text-gray-800 hover:text-teal-700 hover:underline dark:text-gray-100 dark:hover:text-teal-400"
              >
                {f.title}
              </Link>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {showPatient && (
              <Link href={`/patients/${f.patientId}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                {f.patientName}
              </Link>
            )}
            {!done && (
              <span className={`${showPatient ? 'ml-2 ' : ''}${snoozed ? 'text-gray-500 dark:text-gray-400' : DUE_TONE[due]}`}>
                {snoozed ? `Snoozed until ${formatDueLabel(f.snoozedUntil, today).replace(/^Tomorrow$/, 'tomorrow')}` : formatDueLabel(f.dueDate)}
              </span>
            )}
            {done && f.outcome && (
              <span className="ml-2">· {FOLLOWUP_OUTCOMES[f.outcome].label}</span>
            )}
            {(done || !onReassign) && f.assigneeName && <span className="ml-2">· {f.assigneeName}</span>}
          </p>
        </div>
        {!done && onSnooze && (
          <button
            type="button"
            className={SECONDARY_BTN}
            disabled={disabled}
            aria-expanded={panel === 'snooze'}
            onClick={() => setPanel((p) => (p === 'snooze' ? 'none' : 'snooze'))}
          >
            Snooze
          </button>
        )}
        {onReassign && !done && (
          <select
            value={f.assignedUserId ?? ''}
            onChange={(e) => onReassign(e.target.value || null)}
            disabled={disabled}
            aria-label="Assign follow-up"
            title="Assign this follow-up"
            className="min-h-10 shrink-0 cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-gray-500 hover:border-gray-200 hover:bg-white hover:text-gray-700 focus:border-teal-400 focus:bg-white dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 dark:focus:border-teal-500 dark:focus:bg-gray-800"
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.userId === currentUserId ? 'Me' : s.name}
              </option>
            ))}
          </select>
        )}
        {onRemove && (
          <button type="button" className={SECONDARY_BTN} disabled={disabled} onClick={onRemove} aria-label={`Remove follow-up: ${f.title}`}>
            Remove
          </button>
        )}
      </div>

      {panel === 'outcome' && !done && (
        <div role="group" aria-label="How did it go?" className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
          <span className="text-xs text-gray-500 dark:text-gray-400">How did it go?</span>
          {(Object.keys(FOLLOWUP_OUTCOMES) as FollowupOutcome[]).map((o) => (
            <button
              key={o}
              type="button"
              className="inline-flex min-h-10 items-center rounded-full border border-[color:var(--color-hairline)] px-3 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => { setPanel('none'); onComplete?.(o) }}
            >
              {FOLLOWUP_OUTCOMES[o].label}
            </button>
          ))}
          <button type="button" className={SECONDARY_BTN} onClick={() => { setPanel('none'); onComplete?.(null) }}>
            Skip
          </button>
        </div>
      )}

      {panel === 'snooze' && !done && (
        <div role="group" aria-label="Snooze until" className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
          {(Object.keys(SNOOZE_PRESETS) as SnoozePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              className="inline-flex min-h-10 items-center rounded-full border border-[color:var(--color-hairline)] px-3 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => { setPanel('none'); onSnooze?.({ preset: p }) }}
            >
              {SNOOZE_PRESETS[p].label}
            </button>
          ))}
          <input
            type="date"
            value={pickedDate}
            min={minDate}
            onChange={(e) => setPickedDate(e.target.value)}
            aria-label="Pick a day"
            className="form-input min-h-10 text-xs"
          />
          <button
            type="button"
            className={SECONDARY_BTN}
            disabled={!pickedDate || pickedDate < minDate}
            onClick={() => { setPanel('none'); onSnooze?.({ date: pickedDate }) }}
          >
            Snooze to date
          </button>
        </div>
      )}
    </li>
  )
}
