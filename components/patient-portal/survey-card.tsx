'use client'

import { useState, useTransition } from 'react'
import { answerMySurveyAction, commentMySurveyAction } from '@/app/(portal)/patient/actions'
import { PortalCard } from '@/components/patient-portal/ui'

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

/**
 * The post-visit pulse — a one-tap 0–10 rating on the portal dashboard while
 * the visit is still fresh. Same survey rows + detractor escalation as the
 * email path; answering here means one fewer email in the patient's inbox.
 * After scoring, an optional "anything we should know?" note; then the card
 * thanks and collapses to a quiet done-state until the page refreshes it away.
 */
export default function SurveyCard({ token, brand }: { token: string; brand: string }) {
  const [phase, setPhase] = useState<'ask' | 'comment' | 'done'>('ask')
  const [score, setScore] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function pick(n: number) {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const res = await answerMySurveyAction(token, n)
      if (res.ok) {
        setScore(n)
        setPhase('comment')
      } else {
        setError(res.error ?? 'That didn’t save — try again.')
      }
    })
  }

  function sendNote() {
    if (pending) return
    if (!note.trim()) {
      setPhase('done')
      return
    }
    startTransition(async () => {
      await commentMySurveyAction(token, note)
      setPhase('done')
    })
  }

  return (
    <PortalCard>
      {phase === 'ask' && (
        <>
          <p className="text-[1.05rem] font-semibold" style={{ color: INK }}>
            How was your last visit?
          </p>
          <p className="mt-1 text-[0.85rem]" style={{ color: MUTED }}>
            0 = not great · 10 = tell everyone. One tap, that’s it.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => pick(n)}
                disabled={pending}
                aria-label={`Rate ${n} out of 10`}
                className="h-9 w-9 rounded-full text-[0.85rem] font-semibold transition hover:scale-110 disabled:opacity-50"
                style={{ backgroundColor: '#FFFFFF', color: INK, border: `1px solid ${BORDER}` }}
              >
                {n}
              </button>
            ))}
          </div>
          {error && (
            <p className="mt-2 text-[0.82rem] font-medium" style={{ color: '#B4231F' }} role="alert">
              {error}
            </p>
          )}
        </>
      )}
      {phase === 'comment' && (
        <>
          <p className="text-[1.05rem] font-semibold" style={{ color: INK }}>
            {score != null && score >= 9
              ? 'Thank you — that made our day.'
              : 'Thank you for the honesty.'}
          </p>
          <p className="mt-1 text-[0.85rem]" style={{ color: MUTED }}>
            Anything we should know? Totally optional — it goes straight to the team.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="The wait, the chair, the small talk — anything."
            className="mt-3 w-full rounded-2xl px-3.5 py-2.5 text-[0.9rem] outline-none"
            style={{ border: `1px solid ${BORDER}`, color: INK, backgroundColor: '#FFFFFF' }}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={sendNote}
              disabled={pending}
              className="rounded-full px-5 py-2 text-[0.88rem] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: brand }}
            >
              {note.trim() ? 'Send it' : 'Done'}
            </button>
          </div>
        </>
      )}
      {phase === 'done' && (
        <p className="text-[0.95rem] font-semibold" style={{ color: INK }}>
          ✓ Got it — thank you for helping us do better.
        </p>
      )}
    </PortalCard>
  )
}
