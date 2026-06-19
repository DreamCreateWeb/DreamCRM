'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { addDaysYmd, todayYmd, MAX_FOLLOWUP_TITLE_LEN } from '@/lib/types/followups'
import { createFollowupAction } from '@/app/(default)/patients/actions'

/**
 * One-tap follow-up creation for any patient-scoped surface (appointment
 * drawer, message thread, …). Collapsed to a link until clicked; defaults the
 * due date three days out. On success it calls `onDone(message)` so the host
 * can flash a toast — the new follow-up flows into My Day, the digest, the
 * board, and the patient timeline via the action's revalidation.
 *
 * This is the single shared implementation so "add a follow-up" looks and
 * behaves the same everywhere it appears.
 */
export default function FollowupQuickAdd({
  patientId,
  patientFirstName,
  onDone,
  triggerLabel = '+ Add a follow-up',
  triggerClassName = 'text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400',
}: {
  patientId: string
  patientFirstName: string
  onDone: (msg: string) => void
  /** Text for the collapsed trigger ("+ Add a follow-up" by default). */
  triggerLabel?: string
  /** Override the trigger's classes to fit the host's button row. */
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(addDaysYmd(todayYmd(), 3))
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!title.trim()) return
    startTransition(async () => {
      const res = await createFollowupAction({ patientId, title, dueDate: dueDate || null })
      if (res.ok) {
        setOpen(false)
        setTitle('')
        onDone(`Follow-up added for ${patientFirstName}`)
      } else {
        onDone(res.error)
      }
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-teal-500/40 bg-teal-500/[0.03] p-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_FOLLOWUP_TITLE_LEN))}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder={`Follow up with ${patientFirstName}…`}
        className="form-input w-full text-xs py-1"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="form-input text-xs py-1 flex-1"
          aria-label="Due date"
        />
        <ActionButton variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? 'Adding…' : 'Add'}
        </ActionButton>
        <ActionButton variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </ActionButton>
      </div>
    </div>
  )
}
