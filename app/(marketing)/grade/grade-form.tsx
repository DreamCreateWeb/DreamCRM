'use client'

import { useEffect, useState, useTransition } from 'react'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import { runGradeAction } from './actions'

/**
 * The grader form. The submit runs a LIVE check (their homepage + their
 * Google listing) which takes a handful of seconds — the pending state says
 * exactly what's happening so nobody bails at second three. On success the
 * server action redirects to the tokenized report.
 */
export default function GradeForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [loadedAt, setLoadedAt] = useState('')
  useEffect(() => {
    setLoadedAt(String(Date.now()))
  }, [])

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await runGradeAction(formData)
      // On success the action redirects — reaching here means it didn't.
      if (res && !res.ok) setError(res.error)
    })
  }

  const label = 'block text-sm font-medium text-gray-700'
  const input =
    'mt-1 w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[0.95rem] text-gray-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30'

  return (
    <form action={onSubmit} className="space-y-4">
      {/* Bot armor — innocuous names on purpose (lib/form-trust.ts). */}
      <input
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input type="hidden" name={TIMETRAP_FIELD} value={loadedAt} />

      <div>
        <label htmlFor="g-name" className={label}>
          Practice name
        </label>
        <input id="g-name" name="practiceName" required maxLength={200} placeholder="Smile Bright Dental" className={input} />
      </div>
      <div className="grid grid-cols-[1fr_5.5rem] gap-3">
        <div>
          <label htmlFor="g-city" className={label}>
            City
          </label>
          <input id="g-city" name="city" maxLength={100} placeholder="Austin" className={input} />
        </div>
        <div>
          <label htmlFor="g-state" className={label}>
            State
          </label>
          <input id="g-state" name="state" maxLength={2} placeholder="TX" className={`${input} uppercase`} />
        </div>
      </div>
      <div>
        <label htmlFor="g-site" className={label}>
          Website <span className="font-normal text-gray-400">(leave blank if you don’t have one)</span>
        </label>
        <input id="g-site" name="websiteUrl" maxLength={300} placeholder="smilebright.com" className={input} />
      </div>
      <div>
        <label htmlFor="g-email" className={label}>
          Email for your report
        </label>
        <input id="g-email" name="email" type="email" required maxLength={200} placeholder="dr@smilebright.com" className={input} />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? 'Grading — checking your site and your Google listing…' : 'Grade my practice'}
      </button>
      <p className="text-center text-xs text-gray-400">
        Free, takes about ten seconds. We’ll email you a link to the full report — one email, no list.
      </p>
    </form>
  )
}
