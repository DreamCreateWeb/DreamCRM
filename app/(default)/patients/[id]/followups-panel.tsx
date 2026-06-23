'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import {
  followupDueState,
  formatDueLabel,
  todayYmd,
  addDaysYmd,
  MAX_FOLLOWUP_TITLE_LEN,
  type PatientFollowupView,
} from '@/lib/types/followups'
import {
  createFollowupAction,
  completeFollowupAction,
  reopenFollowupAction,
  deleteFollowupAction,
} from '../actions'

type Staff = { userId: string; name: string }

/** Nudge the sidebar to re-poll its "Follow-ups due" badge immediately. */
function pingNavBadges() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
}

/**
 * Follow-ups panel on the patient detail. Staff reminders attached to this
 * patient — create with a due date + assignee, tick off, reopen, remove.
 * Optimistic with revert-on-error; mirrors the notes/tags panels.
 */
export default function FollowupsPanel({
  patientId,
  initial,
  staff,
}: {
  patientId: string
  initial: PatientFollowupView[]
  staff: Staff[]
}) {
  const [items, setItems] = useState<PatientFollowupView[]>(initial)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const open = items.filter((f) => f.status === 'open')
  const done = items.filter((f) => f.status === 'done')

  function onCreated(f: PatientFollowupView) {
    setItems((cur) => [f, ...cur])
    setAdding(false)
  }
  function setStatus(id: string, status: 'open' | 'done') {
    setItems((cur) => cur.map((f) => (f.id === id ? { ...f, status } : f)))
  }
  function complete(id: string) {
    setError(null)
    setStatus(id, 'done')
    startTransition(async () => {
      const res = await completeFollowupAction(id, patientId)
      if (!res.ok) { setStatus(id, 'open'); setError(res.error) }
      else pingNavBadges()
    })
  }
  function reopen(id: string) {
    setError(null)
    setStatus(id, 'open')
    startTransition(async () => {
      const res = await reopenFollowupAction(id, patientId)
      if (!res.ok) { setStatus(id, 'done'); setError(res.error) }
      else pingNavBadges()
    })
  }
  function remove(id: string) {
    setError(null)
    const prev = items
    setItems((cur) => cur.filter((f) => f.id !== id))
    startTransition(async () => {
      const res = await deleteFollowupAction(id, patientId)
      if (!res.ok) { setItems(prev); setError(res.error) }
    })
  }

  return (
    <div className="v2-card px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Follow-ups{open.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">{open.length}</span>}
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400"
          >
            + Add
          </button>
        )}
      </div>

      {adding && (
        <FollowupForm
          patientId={patientId}
          staff={staff}
          onCancel={() => setAdding(false)}
          onCreated={onCreated}
          onError={setError}
        />
      )}

      {open.length === 0 && done.length === 0 && !adding ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No follow-ups. Add a reminder to call, rebook, or check in — it shows on your dashboard until it&apos;s done.
        </p>
      ) : (
        <ul className="space-y-1.5 mt-1">
          {open.map((f) => (
            <FollowupItem key={f.id} f={f} onComplete={() => complete(f.id)} onRemove={() => remove(f.id)} />
          ))}
          {done.slice(0, 4).map((f) => (
            <FollowupItem key={f.id} f={f} onReopen={() => reopen(f.id)} onRemove={() => remove(f.id)} />
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}

const DUE_TONE: Record<string, string> = {
  overdue: 'text-rose-600 dark:text-rose-400',
  today: 'text-amber-700 dark:text-amber-300',
  soon: 'text-gray-500 dark:text-gray-400',
  later: 'text-gray-400 dark:text-gray-500',
  none: 'text-gray-400 dark:text-gray-500',
}

function FollowupItem({
  f,
  onComplete,
  onReopen,
  onRemove,
}: {
  f: PatientFollowupView
  onComplete?: () => void
  onReopen?: () => void
  onRemove: () => void
}) {
  const done = f.status === 'done'
  const due = followupDueState(f.dueDate)
  return (
    <li className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-900/30">
      <button
        type="button"
        onClick={done ? onReopen : onComplete}
        aria-label={done ? 'Reopen follow-up' : 'Mark done'}
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${
          done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-teal-500'
        } grid place-items-center`}
      >
        {done && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 6l2.5 2.5L10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${done ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
          {f.title}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {!done && (
            <span className={DUE_TONE[due]}>{formatDueLabel(f.dueDate)}</span>
          )}
          {f.assigneeName ? `${!done ? ' · ' : ''}${f.assigneeName}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove follow-up"
        className="shrink-0 text-xs text-gray-300 opacity-0 group-hover:opacity-100 hover:text-rose-600 dark:text-gray-600 dark:hover:text-rose-400"
      >
        ✕
      </button>
    </li>
  )
}

function FollowupForm({
  patientId,
  staff,
  onCancel,
  onCreated,
  onError,
}: {
  patientId: string
  staff: Staff[]
  onCancel: () => void
  onCreated: (f: PatientFollowupView) => void
  onError: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(addDaysYmd(todayYmd(), 3))
  const [assignedUserId, setAssignedUserId] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!title.trim()) { onError('Add a title.'); return }
    startTransition(async () => {
      const res = await createFollowupAction({
        patientId,
        title,
        dueDate: dueDate || null,
        assignedUserId: assignedUserId || null,
      })
      if (res.ok) onCreated(res.followup)
      else onError(res.error)
    })
  }

  return (
    <div className="mb-2 rounded-lg border border-teal-500/40 bg-teal-500/[0.03] p-2 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_FOLLOWUP_TITLE_LEN))}
        placeholder="e.g. Call about the crown estimate"
        className="form-input w-full text-xs py-1"
        autoFocus
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="form-input text-xs py-1 flex-1"
          aria-label="Due date"
        />
        {staff.length > 0 && (
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className="form-select text-xs py-1 flex-1"
            aria-label="Assign to"
          >
            <option value="">Anyone</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>{s.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <ActionButton variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancel</ActionButton>
        <ActionButton variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? 'Adding…' : 'Add follow-up'}
        </ActionButton>
      </div>
    </div>
  )
}
