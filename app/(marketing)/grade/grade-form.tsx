'use client'

import { useEffect, useState, useTransition } from 'react'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import { DAY_WIRE } from '@/components/marketing/ui'
import { runGradeAction } from './actions'

/**
 * The grader form. The submit runs a LIVE check (their homepage + their
 * Google listing) which takes a handful of seconds — the pending state says
 * exactly what's happening so nobody bails at second three. On success the
 * server action redirects to the tokenized report.
 *
 * DAYLIGHT DREAM, move 6 page 6 — the CONTROLS, and nothing about the
 * submit path. `BRAND.md` Part 3's radius ladder is 10px for controls and
 * buttons; every field and the button here were `rounded-lg`, which is 8px
 * and belongs to the dashboard. Nothing in CI grades a radius, which is
 * exactly why every page in this move has to read the ladder against itself.
 *
 * The button is Part 2's primary action — the `teal-600 → teal-700` gradient
 * carrying white, both stops graded by rule 3 in `tests/a11y/class-pairs.ts`
 * (5.09 and 7.05) — and it deepens its GLOW on hover rather than darkening
 * its fill, so the label's contrast is fixed across the interaction instead
 * of drifting with it (Part 3: depth is emission, not stacking).
 *
 * THE ERROR INK MOVED `rose-600` → `rose-700`, and that is a real contrast
 * change rather than a restyle. `rose-600` measures **4.53** on white
 * through `tests/a11y/palette.ts` — legal by 0.03, and **4.34** on
 * `surface-1`. That is `fuchsia-600`'s trap (Part 7) wearing a different
 * hue: a pair that passes the guard and fails the page the moment the ink
 * lands on a raised panel. `rose-700` is 6.03 and the question never arises.
 * Part 5 keeps error copy completely straight — no emoji, no personality,
 * no apology theatre — and this change does not touch a word of it.
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

  const label = 'block text-[0.85rem] font-semibold text-gray-800'
  const input =
    'mt-1.5 w-full rounded-[10px] border border-gray-300 bg-white px-3.5 py-2.5 text-[0.95rem] text-gray-950 placeholder:text-gray-500 transition-shadow duration-150 ease-out focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30'

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
          Website <span className="font-normal text-gray-500">(leave blank if you don’t have one)</span>
        </label>
        <input id="g-site" name="websiteUrl" maxLength={300} placeholder="smilebright.com" className={input} />
      </div>
      <div>
        <label htmlFor="g-email" className={label}>
          Email for your report
        </label>
        <input id="g-email" name="email" type="email" required maxLength={200} placeholder="dr@smilebright.com" className={input} />
      </div>

      {error && (
        <p className="rounded-[10px] border border-rose-200 bg-white px-3.5 py-2.5 text-[0.88rem] leading-relaxed text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[10px] bg-gradient-to-r from-teal-600 to-teal-700 px-4 py-3 text-[0.92rem] font-semibold text-white shadow-[0_6px_20px_-8px_rgb(58_103_217/0.6)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_9px_26px_-8px_rgb(58_103_217/0.78)] disabled:cursor-wait disabled:opacity-80 disabled:hover:translate-y-0"
      >
        {pending ? 'Grading — checking your site and your Google listing…' : 'Grade my practice'}
      </button>
      <p className="border-t pt-3 text-[0.78rem] leading-relaxed text-gray-500" style={{ borderColor: DAY_WIRE }}>
        Free, takes about ten seconds. We’ll email you a link to the full report — one email, no list.
      </p>
    </form>
  )
}
