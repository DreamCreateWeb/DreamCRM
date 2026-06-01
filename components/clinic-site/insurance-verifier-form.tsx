'use client'

import { useState } from 'react'
import { submitInsuranceVerifyRequest } from '@/app/site/[slug]/insurance-verify-action'

interface Props {
  orgId: string
  brand: string
  /** Carrier list — shown as a select dropdown when set. When null/empty
   *  the form skips the dropdown entirely (the clinic hasn't told us which
   *  carriers they take, so guessing one would be worse than asking
   *  "what's yours?" with the free-text email/phone alone). */
  carriers: string[] | null
}

/**
 * Insurance verifier form for the public clinic site.
 *
 * Lives in the forest-teal "Dental insurance coverage" band. Captures a
 * contact request to confirm whether the clinic accepts the patient's
 * plan — not an actual eligibility check (no Eligible.com hookup; v1 is
 * "we'll email you back"). On submit, creates a `lead` row scoped to the
 * org with `sourcePage: 'insurance_verifier'` so the request lands in the
 * /leads triage queue and front-desk can follow up.
 *
 * Success state replaces the form with a calm "we'll be in touch within
 * one business day" message so expectations stay honest.
 */
export default function InsuranceVerifierForm({ orgId, brand, carriers }: Props) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const carrierList = (carriers ?? []).filter((c) => c.trim().length > 0)
  const showCarrierDropdown = carrierList.length > 0

  if (status === 'success') {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.18)' }}
        >
          <svg
            className="w-7 h-7 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-white mb-1">Thanks!</p>
        <p className="text-sm text-white/80">
          We&apos;ll be in touch within one business day.
        </p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('pending')
    setErrorMsg('')
    const fd = new FormData(e.currentTarget)
    fd.set('orgId', orgId)
    const result = await submitInsuranceVerifyRequest(fd)
    if (result.ok) {
      setStatus('success')
    } else {
      setErrorMsg(result.error)
      setStatus('error')
    }
  }

  const inputClass =
    'w-full px-5 py-3 rounded-full bg-white text-[#1C1A17] placeholder-gray-400 text-sm border-none focus:outline-none focus:ring-2 focus:ring-white/40 transition'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="sr-only" htmlFor="iv-email">
          Email
        </label>
        <input
          id="iv-email"
          name="email"
          type="email"
          required
          placeholder="Email"
          className={inputClass}
        />
      </div>
      <div>
        <label className="sr-only" htmlFor="iv-phone">
          Phone
        </label>
        <input
          id="iv-phone"
          name="phone"
          type="tel"
          required
          placeholder="Phone"
          className={inputClass}
        />
      </div>
      {showCarrierDropdown && (
        <div>
          <label className="sr-only" htmlFor="iv-carrier">
            Insurance carrier
          </label>
          <select
            id="iv-carrier"
            name="carrier"
            defaultValue=""
            className={inputClass}
            style={{ appearance: 'auto' }}
          >
            <option value="">Insurance carrier (optional)</option>
            {carrierList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__other__">Other / not listed</option>
          </select>
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm font-medium text-rose-100 bg-rose-900/30 rounded-xl px-4 py-2">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'pending'}
        className="w-full px-7 py-3.5 rounded-full text-base font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {status === 'pending' ? 'Sending…' : 'Check insurance'}
      </button>
    </form>
  )
}
