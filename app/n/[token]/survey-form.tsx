'use client'

import { useState } from 'react'
import { submitNpsScoreAction, submitNpsCommentAction } from './actions'

/**
 * The 10-second survey: a 0–10 tap row, then an optional "tell us more" box.
 * Already-answered tokens land on the thanks state (re-opening the email
 * link later never re-asks).
 */
// The sibling token pages' warm constants (c/, b/) — this page was the one
// off-brand landing, in cool Tailwind grays.
const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'
const ERROR = '#B4231F'

export default function SurveyForm({
  token,
  brand,
  clinicName,
  patientFirstName,
  initialScore,
}: {
  token: string
  brand: string
  clinicName: string
  patientFirstName: string
  initialScore: number | null
}) {
  const [score, setScore] = useState<number | null>(initialScore)
  const [comment, setComment] = useState('')
  const [stage, setStage] = useState<'ask' | 'comment' | 'done'>(
    initialScore != null ? 'done' : 'ask',
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function pick(n: number) {
    if (pending) return
    setPending(true)
    setScore(n)
    const r = await submitNpsScoreAction(token, n)
    setPending(false)
    if (r.ok) {
      setError('')
      setStage('comment')
    } else {
      // Was a silent revert to the ask stage — the tap just seemed to vanish.
      setError('That didn’t go through — mind tapping your number again?')
      setScore(null)
      setStage('ask')
    }
  }

  async function sendComment() {
    if (pending) return
    if (!comment.trim()) {
      setStage('done')
      return
    }
    setPending(true)
    await submitNpsCommentAction(token, comment)
    setPending(false)
    setStage('done')
  }

  const card = (children: React.ReactNode) => (
    <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8" style={{ border: `1px solid ${BORDER}` }}>{children}</div>
  )

  if (stage === 'done') {
    return card(
      <>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: INK }}>
          Thank you, {patientFirstName} 💛
        </h1>
        <p className="mt-2 text-[0.95rem]" style={{ color: MUTED }}>
          Your answer went straight to the {clinicName} team — it genuinely helps us get better.
        </p>
      </>,
    )
  }

  if (stage === 'comment') {
    return card(
      <>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: INK }}>
          Got it — {score}/10
        </h1>
        <p className="mt-2 text-[0.95rem]" style={{ color: MUTED }}>
          {score != null && score <= 6
            ? 'We’d love to make it right. What happened?'
            : 'Anything we could do even better? (Totally optional.)'}
        </p>
        <textarea
          className="mt-4 w-full rounded-xl px-3 py-2.5 text-[0.95rem] focus:outline-none focus:ring-2"
          style={{ border: `1px solid ${BORDER}`, color: INK }}
          rows={4}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us more…"
        />
        <button
          type="button"
          onClick={sendComment}
          disabled={pending}
          className="mt-4 w-full rounded-full px-6 py-3 text-[0.95rem] font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          {pending ? 'Sending…' : comment.trim() ? 'Send' : 'Skip — I’m done'}
        </button>
      </>,
    )
  }

  return card(
    <>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: INK }}>
        Hi {patientFirstName} — one quick question
      </h1>
      <p className="mt-2 text-[0.95rem]" style={{ color: MUTED }}>
        How likely are you to recommend {clinicName} to a friend?
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[0.85rem] font-medium" style={{ color: ERROR }}>
          {error}
        </p>
      )}
      <div className="mt-5 grid grid-cols-6 sm:grid-cols-11 gap-1.5" role="radiogroup" aria-label="0 to 10">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            disabled={pending}
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} out of 10`}
            className="aspect-square rounded-lg border text-[0.95rem] font-semibold transition-colors disabled:opacity-60"
            style={
              score === n
                ? { backgroundColor: brand, borderColor: brand, color: 'white' }
                : { borderColor: '#E5E1D8', color: '#1C1A17', backgroundColor: 'white' }
            }
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[0.75rem]" style={{ color: MUTED }}>
        <span>Not likely</span>
        <span>Absolutely</span>
      </div>
      <p className="mt-5 text-[0.8rem]" style={{ color: MUTED }}>
        Goes straight to the team — nothing is posted anywhere public.
      </p>
    </>,
  )
}
