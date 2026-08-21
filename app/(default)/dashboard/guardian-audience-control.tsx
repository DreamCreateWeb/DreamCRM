'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
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
  /**
   * The setting could not be READ (round-11 audit). Round 10 floored the
   * unreadable config at 'platform' — correct for the DECISION, because a
   * failure must never start the machine talking to customers — and then
   * let this control print that floor as a statement of fact: "Only you
   * hear this. Practices are told nothing." A floor is what we DO when we
   * cannot find out; it is not what we KNOW.
   *
   * ROUND 15: the replacement sentence was worse. "Nothing goes to
   * practices while I can't tell" is a claim about SYSTEM BEHAVIOUR made
   * from a PAGE-LOCAL read — and the two paths that actually speak to
   * practices (the daily cron, and each clinic Overview's own note read)
   * each read the config themselves and are entirely unaffected by this
   * page failing. With the lock stored open, the sweep keeps writing notes
   * and clinics keep reading them while this line asserts the opposite. The
   * honest sentence is about this page's ignorance and nothing else.
   */
  unreadable = false,
}: {
  audience: GuardianAudience
  wouldHear?: number | null
  unreadable?: boolean
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
        {unreadable
          ? 'I couldn’t read this setting just now, so I can’t tell you what it’s set to.'
          : open
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
          {/* The inline decision (not useConfirm) is the audited Phase-4
              design — a modal would detach the would-hear count from the
              choice. Only the mechanics upgrade: real buttons, real targets. */}
          <ActionButton size="sm" variant="primary" onClick={() => apply('clinic')} pending={pending}>
            Yes, tell them
          </ActionButton>
          <ActionButton size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
            Not yet
          </ActionButton>
        </div>
      ) : (
        // WHEN THE STATE IS UNKNOWN, OFFER ONLY THE SAFE DIRECTION
        // (round-15 audit). Round 13 disabled this button on `unreadable` —
        // but `audience` is floored to 'platform' on that path, so the label
        // was "Let practices hear it too" and the one action that could make
        // the machine stop talking to customers, "Keep it to me instead",
        // was neither shown NOR clickable at exactly the moment the page
        // could not tell whether the lock was open. Closing the lock is
        // idempotent and safe whatever the true value is; opening it while
        // blind is the one thing that must not be possible.
        <span className="mt-0.5 inline-block">
          <ActionButton
            size="sm"
            variant="ghost"
            onClick={() => (open || unreadable ? apply('platform') : setConfirming(true))}
            pending={pending}
          >
            {open || unreadable ? 'Keep it to me instead' : 'Let practices hear it too'}
          </ActionButton>
        </span>
      )}

      {note && (
        <p role="status" className="mt-1 max-w-xs text-gray-500 dark:text-gray-400">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
