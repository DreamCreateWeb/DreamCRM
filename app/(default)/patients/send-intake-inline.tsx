'use client'

import { useState, useTransition } from 'react'
import { sendIntakeRequestAction } from './actions'

export interface IntakeFormOption {
  id: string
  title: string
}

/**
 * Inline "Send intake" action. Fires the REAL send (sendIntakeRequestToPatient
 * via the server action) and shows inline feedback, replacing the dead
 * `<Link href="/intake-forms">` CTAs that merely navigated to the forms module.
 *
 * When the clinic has more than one intake form, a small dropdown lets the
 * front desk pick which form to send (defaults to the clinic's default form,
 * which the service lists first). With one form (or none configured) the
 * dropdown is hidden and the default is sent.
 *
 * The underlying service enforces every guard (no email on file, no form
 * configured, archived form, etc.); we surface those messages verbatim.
 */
export default function SendIntakeInline({
  patientId,
  forms = [],
  label = 'Send intake',
  className,
}: {
  patientId: string
  forms?: IntakeFormOption[]
  label?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [formId, setFormId] = useState<string>(forms[0]?.id ?? '')

  function onClick() {
    setFeedback(null)
    startTransition(async () => {
      const r = await sendIntakeRequestAction(patientId, formId || undefined)
      setFeedback(
        r.ok
          ? { kind: 'ok', msg: `"${r.formTitle}" sent to ${r.sentTo}` }
          : { kind: 'err', msg: r.error },
      )
      setTimeout(() => setFeedback(null), 4000)
    })
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-1.5">
      {forms.length > 1 && (
        <select
          value={formId}
          onChange={(e) => setFormId(e.target.value)}
          disabled={pending}
          aria-label="Choose intake form"
          className="text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-1.5 py-0.5 max-w-[10rem]"
        >
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      )}
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
          className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}
        >
          {feedback.msg}
        </span>
      )}
    </span>
  )
}
