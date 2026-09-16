'use client'

import { useActionState, useMemo } from 'react'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import { MarketingEmoji } from '@/components/marketing/emoji'
import { DAY_WIRE } from '@/components/marketing/ui'
import { applyPartnerAction } from './actions'

/**
 * DAYLIGHT DREAM, move 6 page 6 — the CONTROLS only, nothing about the
 * submit path or what it files.
 *
 * `BRAND.md` Part 3's radius ladder: 14px cards, 10px controls. Every field
 * and the button here were `rounded-lg` (8px, the dashboard's step) inside a
 * `rounded-xl` (12px) card, so the card was a small tile and the controls
 * belonged to another design system. Nothing in CI grades a radius.
 *
 * The button is Part 2's primary action — the `teal-600 → teal-700` gradient
 * carrying white, both stops graded by rule 3 in `tests/a11y/class-pairs.ts`
 * — deepening its glow on hover rather than darkening its fill, so the
 * label's contrast is fixed across the interaction (Part 3: depth is
 * emission).
 *
 * THE ERROR INK MOVED `rose-600` → `rose-700`. `rose-600` measures **4.53**
 * on white and **4.34** on `surface-1` through `tests/a11y/palette.ts` —
 * legal by 0.03 on the ground it happens to sit on today, illegal on the
 * raised one. That is `fuchsia-600`'s trap (Part 7) in another hue.
 * `rose-700` is 6.03. Part 5 keeps error copy completely straight and this
 * changes none of its words.
 *
 * THE POPPER STAYS. Part 5 gives it exactly one permission — a real win the
 * visitor caused — and somebody finishing an application is that. It is the
 * only emoji on this route; the body copy carries none, because a page about
 * commission rates and payout floors is billing register.
 */
type FormState = { ok: true } | { ok: false; error: string } | null

async function submit(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await applyPartnerAction(formData)
  } catch {
    return { ok: false, error: 'Something went wrong — give it another try.' }
  }
}

/** One recipe, five controls. Part 3's 10px control step. */
const FIELD =
  'mt-1.5 w-full rounded-[10px] border border-gray-300 bg-white px-3 py-2.5 text-[0.9rem] text-gray-950 placeholder:text-gray-500 transition-shadow duration-150 ease-out focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30'

export default function ApplyForm() {
  const [state, action, pending] = useActionState(submit, null)
  const loadedAt = useMemo(() => String(Date.now()), [])

  if (state?.ok) {
    return (
      <div
        className="rounded-[14px] border border-l-[3px] border-l-teal-600 bg-white p-8 text-center"
        style={{ borderTopColor: DAY_WIRE, borderRightColor: DAY_WIRE, borderBottomColor: DAY_WIRE }}
      >
        {/* A real win the visitor caused — BRAND.md Part 5's one use for the
            popper. Decorative: the line under it already says what happened. */}
        <MarketingEmoji name="popper" size={44} className="mb-3" />
        <p className="text-[1.1rem] font-bold text-gray-950">Application in — thank you.</p>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-gray-600">
          A real person reads every one. If it looks like a fit, you&apos;ll hear from us within a
          couple of business days with your partner invite.
        </p>
      </div>
    )
  }

  return (
    <form
      action={action}
      className="rounded-[14px] border bg-white p-6 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)] sm:p-8"
      style={{ borderColor: DAY_WIRE }}
    >
      <input
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input type="hidden" name={TIMETRAP_FIELD} value={loadedAt} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[0.84rem] font-semibold text-gray-800">Your name</span>
          <input name="name" required maxLength={200} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-[0.84rem] font-semibold text-gray-800">Email</span>
          <input name="email" type="email" required maxLength={200} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-[0.84rem] font-semibold text-gray-800">Phone (optional)</span>
          <input name="phone" maxLength={40} className={FIELD} />
        </label>
        <label className="block">
          <span className="text-[0.84rem] font-semibold text-gray-800">Company (optional)</span>
          <input name="company" maxLength={200} className={FIELD} />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-[0.84rem] font-semibold text-gray-800">
          Who do you work with, and how many practices could this reach?
        </span>
        <textarea
          name="message"
          rows={4}
          maxLength={2000}
          placeholder="e.g. I coach 30 practices across Texas on front-office operations…"
          className={FIELD}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-[10px] bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-3 text-[0.95rem] font-semibold text-white shadow-[0_6px_20px_-8px_rgb(58_103_217/0.6)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_9px_26px_-8px_rgb(58_103_217/0.78)] disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
      >
        {pending ? 'Sending…' : 'Apply to the partner program'}
      </button>
      {state && !state.ok && (
        <p className="mt-3 rounded-[10px] border border-rose-200 bg-white px-3.5 py-2.5 text-[0.88rem] leading-relaxed text-rose-700">
          {state.error}
        </p>
      )}
      <p
        className="mt-5 border-t pt-4 text-[0.78rem] leading-relaxed text-gray-500"
        style={{ borderColor: DAY_WIRE }}
      >
        We&apos;ll only use this to talk to you about the partner program — no lists, no drip
        campaigns.
      </p>
    </form>
  )
}
