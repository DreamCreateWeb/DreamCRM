'use client'

import { useState } from 'react'
import { submitContactRequest } from './actions'
import { DEFAULT_LEAD_FORMS, type LeadFormField } from '@/lib/types/lead-forms'

interface Props {
  /** Public slug — the action resolves the org from it server-side (never a
   *  client-posted orgId). */
  slug: string
  brand: string
  isPro: boolean
  basePath: string
  /** Editable field definitions (Website Studio). Defaults to the standard
   *  name · phone · email · date · message set when unset. */
  fields?: LeadFormField[]
  /** Live option sources for any dynamic-select fields a clinic adds. */
  services?: string[] | null
  carriers?: string[] | null
}

export default function ContactForm({ slug, brand, isPro, basePath, fields, services, carriers }: Props) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const serviceList = (services ?? []).filter((s) => s.trim().length > 0)
  const carrierList = (carriers ?? []).filter((c) => c.trim().length > 0)
  const formFields = fields && fields.length > 0 ? fields : DEFAULT_LEAD_FORMS.contact

  if (isPro) {
    // Pro+ users go to the full booking page
    return (
      <div className="text-center">
        <a
          href={`${basePath}/book`}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-white shadow-lg transition hover:opacity-90"
          style={{ backgroundColor: brand }}
        >
          Book Online Now
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </a>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6" style={{ backgroundColor: brand, opacity: 0.12 }}>
          <svg className="w-8 h-8" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Request received!</h3>
        <p className="text-gray-500">We'll be in touch within 1 business day to confirm your appointment.</p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('pending')
    setErrorMsg('')
    const fd = new FormData(e.currentTarget)
    fd.set('slug', slug)
    // Source-attribution snapshot — captured at submit time from the
    // browser context. Lets staff see "came from /services, referred by
    // Google" in the Leads drawer + drives a future UTM campaign report.
    if (typeof window !== 'undefined') {
      fd.set('sourcePage', window.location.pathname)
      fd.set('referrer', document.referrer || '')
      const params = new URLSearchParams(window.location.search)
      fd.set('utm_source', params.get('utm_source') || '')
      fd.set('utm_medium', params.get('utm_medium') || '')
      fd.set('utm_campaign', params.get('utm_campaign') || '')
    }
    try {
      await submitContactRequest(fd)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please call us directly.')
      setStatus('error')
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition'

  function renderField(f: LeadFormField) {
    const label = (
      <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor={`cf-${f.id}`}>
        {f.label}
        {f.required && <span className="text-red-500"> *</span>}
      </label>
    )
    if (f.type === 'select') {
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
          {label}
          <select
            id={`cf-${f.id}`}
            name={f.id}
            defaultValue=""
            required={f.required}
            className={inputClass}
          >
            <option value="">Select…</option>
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
          {label}
          <textarea
            id={`cf-${f.id}`}
            name={f.id}
            rows={3}
            required={f.required}
            placeholder={f.placeholder ?? ''}
            className={`${inputClass} resize-none`}
          />
        </div>
      )
    }
    const inputType =
      f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    return (
      <div key={f.id}>
        {label}
        <input
          id={`cf-${f.id}`}
          name={f.id}
          type={inputType}
          required={f.required}
          placeholder={f.placeholder ?? ''}
          min={f.type === 'date' ? new Date().toISOString().split('T')[0] : undefined}
          className={inputClass}
          style={{ ['--tw-ring-color' as string]: brand }}
        />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formFields.map(renderField)}

      {status === 'error' && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'pending'}
        className="w-full py-3.5 rounded-xl text-base font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {status === 'pending' ? 'Sending…' : 'Send Request'}
      </button>
      <p className="text-xs text-gray-400 text-center">
        We respect your privacy. Your information is never shared.
      </p>
    </form>
  )
}
