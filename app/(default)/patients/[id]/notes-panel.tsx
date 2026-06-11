'use client'

import { useState, useTransition } from 'react'
import type { PatientNoteRow } from '@/lib/services/patient-notes'
import { ActionButton } from '@/components/ui/action-button'
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

  function remove(noteId: string) {
    startTransition(async () => { await deletePatientNoteAction(patientId, noteId) })
  }

  return (
    <div className="v2-card px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-3">
        Notes
      </p>
      <div className="space-y-3 mb-3 max-h-[240px] overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            No notes yet. Use this space for relationship notes (&ldquo;prefers
            morning&rdquo;, &ldquo;anxious&rdquo;) — never clinical notes.
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="text-xs">
              <p className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-snug">
                {n.body}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                <span>{n.authorName ?? 'Staff'}</span>
                <span>·</span>
                <span suppressHydrationWarning>{fmtRel(n.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="ml-auto text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400"
                  aria-label="Delete note"
                >
                  ×
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
