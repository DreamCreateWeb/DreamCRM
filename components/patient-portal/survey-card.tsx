'use client'

import { useState, useTransition } from 'react'
import { answerMySurveyAction, commentMySurveyAction } from '@/app/(portal)/patient/actions'
import {
  PortalCard,
  BrandButton,
  PortalTextarea,
  PortalErrorText,
  PORTAL_INK as INK,
  PORTAL_MUTED as MUTED,
  PORTAL_BORDER as BORDER,
} from '@/components/patient-portal/ui'


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

  // The card swaps its ENTIRE body at each phase — rating row → comment box →
  // thank-you — while the card itself stays mounted, so nothing remounts and
  // nothing is spoken. A screen-reader user tapped a score and the only
  // evidence it registered was focus landing somewhere unexpected. One polite
  // live region narrates the phase, the same shape as the slot picker's
  // (`slot-picker.tsx` — checking → what landed) one file away.
  //
  // It SUMMARISES the new phase rather than repeating the copy word for word:
  // the announcement fires, and then the reader arrives at the visible text and
  // reads it again. Two different sentences is one fact told twice; two
  // identical ones is a stutter.
  const liveStatus =
    phase === 'comment'
      ? `Saved — you rated ${score} out of 10. A note is optional.`
      : phase === 'done'
        ? 'Thanks — your rating is in.'
        : ''

  return (
    <PortalCard>
      <p className="sr-only" role="status">
        {liveStatus}
      </p>
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
                className="h-11 w-11 rounded-full text-[0.9rem] font-semibold transition active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: '#FFFFFF', color: INK, border: `1px solid ${BORDER}` }}
              >
                {n}
              </button>
            ))}
          </div>
          {error && <PortalErrorText>{error}</PortalErrorText>}
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
          <PortalTextarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="The wait, the chair, the small talk — anything."
            className="mt-3"
          />
          <div className="mt-2 flex items-center gap-3">
            <BrandButton brand={brand} onClick={sendNote} pending={pending}>
              {note.trim() ? 'Send it' : 'Done'}
            </BrandButton>
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
