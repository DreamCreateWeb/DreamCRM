'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import type { PracticeTurn, PracticeFeedback } from '@/lib/services/practice-call'
import { practiceReplyAction, practiceFeedbackAction } from '../admin-actions'

/**
 * 🎭 The rehearsal booth — practice the cold call against an AI playing this
 * exact practice's front desk before dialing for real. Chat-style: they
 * answer the phone, you type what you'd say, they push back the way a busy
 * front desk actually does. End it for warm, specific coaching. Nothing is
 * saved; a rehearsal is disposable by design.
 */
export default function PracticePanel({
  prospectId,
  prospectName,
  onClose,
}: {
  prospectId: string
  prospectName: string
  onClose: () => void
}) {
  const [turns, setTurns] = useState<PracticeTurn[]>([])
  const [draft, setDraft] = useState('')
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [coaching, startCoaching] = useTransition()
  const opened = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // They answer the phone when the booth opens.
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    startTransition(async () => {
      const res = await practiceReplyAction(prospectId, [])
      if (res.ok) setTurns([{ role: 'them', text: res.reply }])
      else setError('The line is quiet — AI is unavailable right now.')
    })
  }, [prospectId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, feedback])

  const say = () => {
    const text = draft.trim()
    if (!text || pending || feedback) return
    const next: PracticeTurn[] = [...turns, { role: 'you' as const, text }]
    setTurns(next)
    setDraft('')
    setError(null)
    startTransition(async () => {
      const res = await practiceReplyAction(prospectId, next)
      if (res.ok) setTurns([...next, { role: 'them', text: res.reply }])
      else setError("They didn't respond — try again.")
    })
  }

  const endRehearsal = () => {
    if (turns.length === 0) return onClose()
    setError(null)
    startCoaching(async () => {
      const res = await practiceFeedbackAction(prospectId, turns)
      if (res.ok) setFeedback(res.feedback)
      else setError("Couldn't get coaching this time — the rehearsal still counted.")
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[var(--r-lg)] bg-white shadow-2xl ring-1 ring-[color:var(--color-hairline)] dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-hairline)] px-4 py-3">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">🎭 Rehearsal — {prospectName}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Say it out loud as you type. Nothing is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close rehearsal"
          >
            ✕
          </button>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'you' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-[var(--r-md)] px-3 py-2 text-sm leading-relaxed ${
                  t.role === 'you'
                    ? 'bg-teal-600 text-white'
                    : 'bg-[color:var(--color-surface-sunk)] text-gray-800 dark:text-gray-200'
                }`}
              >
                {t.text}
              </div>
            </div>
          ))}
          {pending && (
            <p className="text-xs text-gray-400 dark:text-gray-500">…</p>
          )}
          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          {feedback && (
            <div className="rounded-[var(--r-md)] border border-teal-500/20 bg-teal-500/5 p-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{feedback.verdict}</p>
              {feedback.wins.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    What worked
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    {feedback.wins.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.fixes.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Tighten this
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    {feedback.fixes.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer / actions */}
        <div className="border-t border-[color:var(--color-hairline)] p-3">
          {feedback ? (
            <div className="flex justify-end gap-2">
              <ActionButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFeedback(null)
                  setTurns([])
                  setError(null)
                  opened.current = false
                  // Re-open the line for another round.
                  startTransition(async () => {
                    const res = await practiceReplyAction(prospectId, [])
                    if (res.ok) setTurns([{ role: 'them', text: res.reply }])
                  })
                }}
              >
                🔁 Again
              </ActionButton>
              <ActionButton variant="primary" size="sm" onClick={onClose}>
                📞 Dial for real
              </ActionButton>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') say()
                }}
                placeholder="What do you say?"
                className="form-input flex-1 rounded-full text-sm"
                maxLength={600}
                autoFocus
              />
              <ActionButton variant="primary" size="sm" disabled={pending || !draft.trim()} onClick={say}>
                Say it
              </ActionButton>
              <ActionButton variant="secondary" size="sm" disabled={coaching || turns.length < 2} onClick={endRehearsal}>
                {coaching ? 'Coaching…' : '🏁 End + coach me'}
              </ActionButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
