'use client'

import { useState, useTransition } from 'react'
import type { PatientNoteRow } from '@/lib/services/patient-notes'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { addPatientNoteAction, deletePatientNoteAction } from '../actions'

function fmtRel(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function NotesPanel({
  patientId,
  notes,
}: {
  patientId: string
  notes: PatientNoteRow[]
}) {
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  function add() {
    if (!body.trim()) return
    setError(null)
    const text = body
    startTransition(async () => {
      const r = await addPatientNoteAction(patientId, text)
      if (!r.ok) { setError(r.error); return }
      setBody('')
    })
  }

  async function remove(noteId: string) {
    if (
      !(await confirm({
        title: 'Delete this note?',
        message: "It comes off the record for everyone — there's no undo.",
        confirmLabel: 'Delete',
        danger: true,
      }))
    )
      return
    startTransition(async () => { await deletePatientNoteAction(patientId, noteId) })
  }

  return (
    <div className="v2-card px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-3">
        Notes
      </p>
      <div className="space-y-3 mb-3 max-h-[240px] overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No notes yet. Use this space for relationship notes (&ldquo;prefers
            morning&rdquo;, &ldquo;anxious&rdquo;) — never clinical notes.
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id}>
              <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-snug">
                {n.body}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                <span>{n.authorName ?? 'Staff'}</span>
                <span>·</span>
                <span suppressHydrationWarning>{fmtRel(n.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  disabled={pending}
                  className="ml-auto grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-gray-500 dark:text-gray-400 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:text-rose-400 disabled:opacity-50"
                  aria-label="Delete note"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                  </svg>
                </button>
              </p>
            </div>
          ))
        )}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a relationship note…"
        className="form-textarea w-full text-xs min-h-[60px] mb-2"
      />
      {error && <p className="text-xs text-rose-700 dark:text-rose-300 mb-2">{error}</p>}
      <ActionButton
        variant="primary"
        size="sm"
        onClick={add}
        disabled={pending || !body.trim()}
        className="w-full justify-center"
      >
        {pending ? 'Saving…' : 'Add note'}
      </ActionButton>
    </div>
  )
}
