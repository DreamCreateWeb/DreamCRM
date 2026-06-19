'use client'

import { useState } from 'react'
import { submitContactRequest } from './actions'
import { DEFAULT_LEAD_FORMS, type LeadFormField } from '@/lib/types/lead-forms'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'
import { FieldError } from '@/components/ui/field-error'
import { validateRequired, validateEmail, validatePhone } from '@/lib/validation'

/** Map a lead-form field to the right mobile keyboard + browser-autofill hint
 *  so phones surface the dialpad/email keys and Safari/Chrome can autofill. */
function fieldInputAttrs(f: LeadFormField): {
  inputMode?: 'tel' | 'email' | 'text'
  autoComplete?: string
} {
  if (f.type === 'tel') return { inputMode: 'tel', autoComplete: 'tel' }
  if (f.type === 'email') return { inputMode: 'email', autoComplete: 'email' }
  const key = f.id.toLowerCase()
  if (key.includes('name')) return { autoComplete: 'name' }
  return {}
}

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

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
    setErrorMsg('')
    const fd = new FormData(e.currentTarget)
    fd.set('slug', slug)
    // Inline field validation before the round-trip (consistent, accessible
    // errors instead of the browser's default bubbles — the form is noValidate).
    const errs: Record<string, string> = {}
    for (const f of formFields) {
      const val = String(fd.get(f.id) ?? '')
      let msg: string | null = null
      if (f.required) msg = validateRequired(val, f.label)
      if (!msg && val && f.type === 'email') msg = validateEmail(val)
      if (!msg && val && f.type === 'tel') msg = validatePhone(val)
      if (msg) errs[f.id] = msg
    }
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      setStatus('idle')
      return
    }
    setStatus('pending')
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
            aria-invalid={!!fieldErrors[f.id]}
            aria-describedby={fieldErrors[f.id] ? `err-cf-${f.id}` : undefined}
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
          <FieldError id={`err-cf-${f.id}`} message={fieldErrors[f.id]} />
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
            aria-invalid={!!fieldErrors[f.id]}
            aria-describedby={fieldErrors[f.id] ? `err-cf-${f.id}` : undefined}
            placeholder={f.placeholder ?? ''}
            className={`${inputClass} resize-none`}
          />
          <FieldError id={`err-cf-${f.id}`} message={fieldErrors[f.id]} />
        </div>
      )
    }
    const inputType =
      f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    const attrs = fieldInputAttrs(f)
    return (
      <div key={f.id}>
        {label}
        <input
          id={`cf-${f.id}`}
          name={f.id}
          type={inputType}
          required={f.required}
          aria-invalid={!!fieldErrors[f.id]}
          aria-describedby={fieldErrors[f.id] ? `err-cf-${f.id}` : undefined}
          placeholder={f.placeholder ?? ''}
          min={f.type === 'date' ? new Date().toISOString().split('T')[0] : undefined}
          inputMode={attrs.inputMode}
          autoComplete={attrs.autoComplete}
          className={inputClass}
          style={{ ['--tw-ring-color' as string]: brand }}
        />
        <FieldError id={`err-cf-${f.id}`} message={fieldErrors[f.id]} />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormTrustFields />
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
      <p className="text-xs text-gray-500 text-center">
        We only use this to reach you about your visit — never spam.
      </p>
    </form>
  )
}
