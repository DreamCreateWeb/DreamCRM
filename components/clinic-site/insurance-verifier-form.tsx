'use client'

import { useState } from 'react'
import { submitInsuranceVerifyRequest } from '@/app/site/[slug]/insurance-verify-action'
import { DEFAULT_LEAD_FORMS, type LeadFormField } from '@/lib/types/lead-forms'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'

interface Props {
  /** Public slug — the action resolves the org from it server-side (never a
   *  client-posted orgId). */
  slug: string
  brand: string
  /** Carrier list — feeds the carrier dropdown's options. When null/empty
   *  that dynamic dropdown auto-hides (we don't show an empty carrier picker). */
  carriers: string[] | null
  /** Service names from the clinic's catalog — feed the "what brought you in"
   *  dropdown's options; auto-hides when null/empty. */
  services?: string[] | null
  /** Editable field definitions (Website Studio). Defaults to the standard
   *  email · phone · service · carrier set when unset. */
  fields?: LeadFormField[]
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
export default function InsuranceVerifierForm({ slug, brand, carriers, services, fields }: Props) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const carrierList = (carriers ?? []).filter((c) => c.trim().length > 0)
  const serviceList = (services ?? []).filter((s) => s.trim().length > 0)
  const formFields = fields && fields.length > 0 ? fields : DEFAULT_LEAD_FORMS.insurance_verifier

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
    fd.set('slug', slug)
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

  function renderField(f: LeadFormField) {
    const optionalSuffix = f.required ? '' : ' (optional)'
    const placeholder = (f.placeholder ?? f.label) + optionalSuffix
    if (f.type === 'select') {
      // Dynamic selects pull their options from live clinic data; hide cleanly
      // when that list is empty (no point showing an empty carrier picker).
      const liveOpts =
        f.dynamicOptions === 'services'
          ? serviceList
          : f.dynamicOptions === 'carriers'
            ? carrierList
            : null
      if (f.dynamicOptions && (!liveOpts || liveOpts.length === 0)) return null
      const opts = liveOpts ?? f.options ?? []
      return (
        <div key={f.id}>
          <label className="sr-only" htmlFor={`iv-${f.id}`}>
            {f.label}
          </label>
          <select
            id={`iv-${f.id}`}
            name={f.id}
            defaultValue=""
            required={f.required}
            className={inputClass}
            style={{ appearance: 'auto' }}
          >
            <option value="">
              {f.label}
              {optionalSuffix}
            </option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {f.dynamicOptions && <option value="__other__">Other / not listed</option>}
          </select>
        </div>
      )
    }
    if (f.type === 'textarea') {
      return (
        <div key={f.id}>
          <label className="sr-only" htmlFor={`iv-${f.id}`}>
            {f.label}
          </label>
          <textarea
            id={`iv-${f.id}`}
            name={f.id}
            required={f.required}
            placeholder={placeholder}
            rows={3}
            className={`${inputClass} rounded-2xl`}
          />
        </div>
      )
    }
    return (
      <div key={f.id}>
        <label className="sr-only" htmlFor={`iv-${f.id}`}>
          {f.label}
        </label>
        <input
          id={`iv-${f.id}`}
          name={f.id}
          type={
            f.type === 'email'
              ? 'email'
              : f.type === 'tel'
                ? 'tel'
                : f.type === 'date'
                  ? 'date'
                  : 'text'
          }
          inputMode={f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : undefined}
          autoComplete={f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : undefined}
          required={f.required}
          placeholder={placeholder}
          className={inputClass}
        />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <FormTrustFields />
      {formFields.map(renderField)}

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
      <p className="text-xs text-center text-white/70">
        We only use this to reach you about your visit — never spam.
      </p>
    </form>
  )
}
