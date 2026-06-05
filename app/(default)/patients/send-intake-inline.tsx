'use client'

import { useState, useTransition } from 'react'
import { sendIntakeRequestAction } from './actions'

/**
 * Inline "Send intake" action. Fires the REAL send (sendIntakeRequestToPatient
 * via the server action) and shows inline feedback, replacing the dead
 * `<Link href="/intake-forms">` CTAs that merely navigated to the forms module
 * — where there's no way to send a form to a specific patient — instead of
 * actually emailing the patient their intake link.
 *
 * The underlying service enforces every guard (no email on file, no default
 * intake form configured, etc.); we surface those messages verbatim.
 */
export default function SendIntakeInline({
  patientId,
  label = 'Send intake',
  className,
}: {
  patientId: string
  label?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function onClick() {
    setFeedback(null)
    startTransition(async () => {
      const r = await sendIntakeRequestAction(patientId)
      setFeedback(
        r.ok
          ? { kind: 'ok', msg: `Intake link sent to ${r.sentTo}` }
          : { kind: 'err', msg: r.error },
      )
      setTimeout(() => setFeedback(null), 4000)
    })
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          className ??
          'font-medium text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50'
        }
      >
        {pending ? 'Sending…' : label}
      </button>
      {feedback && (
        <span
          className={`text-[11px] ${feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
        >
          {feedback.msg}
        </span>
      )}
    </span>
  )
}
