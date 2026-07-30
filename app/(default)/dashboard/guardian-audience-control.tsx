'use client'

import { useState, useTransition } from 'react'
import type { GuardianAudience } from '@/lib/guardian'
import { setGuardianAudienceAction } from './admin-actions'

/**
 * THE AUDIENCE LOCK (Transformation Phase 4). Who the Guardian talks to.
 *
 * It ships closed and only a human opens it, so this reads as a decision
 * rather than a setting: it says plainly what is true right now and what
 * changes if you flip it. No toggle switch — a switch invites a stray click,
 * and a stray click here starts the machine talking to customers.
 */
export default function GuardianAudienceControl({
  audience,
  /** How many practices have a finding they'd be told if the lock opened,
   *  or null when the sweep couldn't look — a decision this consequential
   *  should never be taken against a number the machine had to guess
   *  (round-9 in-phase gap). Deliberately NOT "today": delivery also waits
   *  on the weekly alert cadence, which this component cannot see, and
   *  round 10 caught the copy claiming otherwise. */
  wouldHear = null,
}: {
  audience: GuardianAudience
  wouldHear?: number | null
}) {
  const [current, setCurrent] = useState<GuardianAudience>(audience)
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const open = current === 'clinic'

  function apply(next: GuardianAudience) {
    setError(null)
    start(async () => {
      const r = await setGuardianAudienceAction({ audience: next })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setCurrent(next)
      setConfirming(false)
      setNote(r.message)
    })
  }

  return (
    <div className="text-xs text-right">
      <p className="text-gray-500 dark:text-gray-400">
        {open
          ? 'Practices hear what they can fix themselves.'
          : 'Only you hear this. Practices are told nothing.'}
      </p>

      {confirming ? (
        <div className="mt-1 flex items-center justify-end gap-2">
          <span className="text-gray-600 dark:text-gray-300">
            {wouldHear === null
              ? 'Let practices hear the things they can fix?'
              : wouldHear === 0
                ? 'Let practices hear the things they can fix? Nothing is waiting to go out.'
                : `Let practices hear the things they can fix? ${wouldHear} ${
                    wouldHear === 1 ? 'practice has' : 'practices have'
                  } something they'd be told, as each one's weekly cadence comes round.`}
          </span>
          <button
            type="button"
            onClick={() => apply('clinic')}
            disabled={pending}
            className="rounded-full bg-[color:var(--color-brand)] px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Yes, tell them'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-gray-500 dark:text-gray-400 hover:underline"
          >
            Not yet
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (open ? apply('platform') : setConfirming(true))}
          disabled={pending}
          className="mt-0.5 text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-60"
        >
          {pending ? 'Saving…' : open ? 'Keep it to me instead' : 'Let practices hear it too'}
        </button>
      )}

      {note && <p className="mt-1 max-w-xs text-gray-500 dark:text-gray-400">{note}</p>}
      {error && <p className="mt-1 text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}
