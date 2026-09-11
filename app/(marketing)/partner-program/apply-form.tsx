'use client'

import { useActionState, useMemo } from 'react'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import { applyPartnerAction } from './actions'

type FormState = { ok: true } | { ok: false; error: string } | null

async function submit(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await applyPartnerAction(formData)
  } catch {
    return { ok: false, error: 'Something went wrong — give it another try.' }
  }
}

export default function ApplyForm() {
  const [state, action, pending] = useActionState(submit, null)
  const loadedAt = useMemo(() => String(Date.now()), [])

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-8 text-center">
        <p className="text-[1.1rem] font-bold text-gray-950">Application in — thank you.</p>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-gray-600">
          A real person reads every one. If it looks like a fit, you&apos;ll hear from us within a
          couple of business days with your partner invite.
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
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
          <span className="text-[0.82rem] font-semibold text-gray-800">Your name</span>
          <input name="name" required maxLength={200} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[0.9rem] focus:border-teal-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-[0.82rem] font-semibold text-gray-800">Email</span>
          <input name="email" type="email" required maxLength={200} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[0.9rem] focus:border-teal-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-[0.82rem] font-semibold text-gray-800">Phone (optional)</span>
          <input name="phone" maxLength={40} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[0.9rem] focus:border-teal-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-[0.82rem] font-semibold text-gray-800">Company (optional)</span>
          <input name="company" maxLength={200} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[0.9rem] focus:border-teal-500 focus:outline-none" />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-[0.82rem] font-semibold text-gray-800">
          Who do you work with, and how many practices could this reach?
        </span>
        <textarea
          name="message"
          rows={4}
          maxLength={2000}
          placeholder="e.g. I coach 30 practices across Texas on front-office operations…"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[0.9rem] focus:border-teal-500 focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-lg bg-teal-600 px-6 py-3 text-[0.95rem] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Sending…' : 'Apply to the partner program'}
      </button>
      {state && !state.ok && (
        <p className="mt-3 text-[0.85rem] font-medium text-rose-600">{state.error}</p>
      )}
      <p className="mt-4 text-[0.75rem] leading-relaxed text-gray-500">
        We&apos;ll only use this to talk to you about the partner program — no lists, no drip
        campaigns.
      </p>
    </form>
  )
}
