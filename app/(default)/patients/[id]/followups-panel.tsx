'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FollowupRow, type SnoozeChoice } from '@/components/followups/followup-row'
import { runAction } from '@/lib/run-action'
import {
  todayYmd,
  addDaysYmd,
  MAX_FOLLOWUP_TITLE_LEN,
  FOLLOWUP_KINDS,
  FOLLOWUP_KIND_IDS,
  type FollowupKind,
  type FollowupOutcome,
  type PatientFollowupView,
} from '@/lib/types/followups'
import {
  createFollowupAction,
  completeFollowupAction,
  reopenFollowupAction,
  deleteFollowupAction,
  snoozeFollowupAction,
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
  const [pendingId, setPendingId] = useState<string | null>(null)
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
  function complete(id: string, outcome: FollowupOutcome | null) {
    setError(null)
    setStatus(id, 'done')
    setItems((cur) => cur.map((f) => (f.id === id ? { ...f, outcome } : f)))
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await runAction(() => completeFollowupAction(id, patientId, outcome))
        if (!res.ok) { setStatus(id, 'open'); setError(res.error) }
        else pingNavBadges()
      } finally { setPendingId(null) }
    })
  }
  function reopen(id: string) {
    setError(null)
    setStatus(id, 'open')
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await runAction(() => reopenFollowupAction(id, patientId))
        if (!res.ok) { setStatus(id, 'done'); setError(res.error) }
        else pingNavBadges()
      } finally { setPendingId(null) }
    })
  }
  function snooze(id: string, choice: SnoozeChoice) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await runAction(() => snoozeFollowupAction(id, patientId, choice))
        if (!res.ok) setError(res.error)
        else {
          setItems((cur) => cur.map((f) => (f.id === id ? { ...f, snoozedUntil: res.until, dueDate: res.until } : f)))
          pingNavBadges()
        }
      } finally { setPendingId(null) }
    })
  }
  function remove(id: string) {
    setError(null)
    const prev = items
    setItems((cur) => cur.filter((f) => f.id !== id))
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await runAction(() => deleteFollowupAction(id, patientId))
        if (!res.ok) { setItems(prev); setError(res.error) }
      } finally { setPendingId(null) }
    })
  }

  return (
    <div className="v2-card px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Follow-ups{open.length > 0 && <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">{open.length}</span>}
        </h2>
        {!adding && (
          <ActionButton variant="secondary" size="sm" onClick={() => setAdding(true)}>
            + Add
          </ActionButton>
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
        <ul className="mt-1 divide-y divide-[color:var(--color-hairline)] -mx-4">
          {open.map((f) => (
            <FollowupRow
              key={f.id}
              f={f}
              showPatient={false}
              pending={pendingId === f.id}
              disabled={pendingId !== null}
              onComplete={(o) => complete(f.id, o)}
              onSnooze={(c) => snooze(f.id, c)}
              onRemove={() => remove(f.id)}
            />
          ))}
          {done.slice(0, 4).map((f) => (
            <FollowupRow
              key={f.id}
              f={f}
              done
              showPatient={false}
              pending={pendingId === f.id}
              disabled={pendingId !== null}
              onReopen={() => reopen(f.id)}
              onRemove={() => remove(f.id)}
            />
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
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
  const [kind, setKind] = useState<FollowupKind>('generic')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!title.trim()) { onError('Add a title.'); return }
    startTransition(async () => {
      const res = await runAction(() =>
        createFollowupAction({
          patientId,
          title,
          dueDate: dueDate || null,
          assignedUserId: assignedUserId || null,
          kind,
        }),
      )
      if (res.ok && 'followup' in res) onCreated(res.followup)
      else if (!res.ok) onError(res.error)
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
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as FollowupKind)}
        className="form-select text-xs py-1 w-full"
        aria-label="What is it about?"
      >
        {FOLLOWUP_KIND_IDS.map((k) => (
          <option key={k} value={k}>{FOLLOWUP_KINDS[k].label}</option>
        ))}
      </select>
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
        <ActionButton variant="primary" size="sm" onClick={submit} pending={pending}>
          Add follow-up
        </ActionButton>
      </div>
    </div>
  )
}
