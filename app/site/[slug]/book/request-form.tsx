'use client'

import { useState } from 'react'
import { submitAppointmentRequest } from '../actions'
import { readableInk } from '@/lib/clinic-site-theme'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'
import type { PublicVisitTypeOption } from './book-form'

const BG = 'var(--c-bg, #FAF7F2)'
const INK = 'var(--c-ink, #1C1A17)'
const INK_MUTED = 'var(--c-ink-muted, #6B635A)'
const SURFACE = 'var(--c-surface, #FFFFFF)'
const BORDER = 'var(--c-border, #E8E2D9)'

interface Props {
  /** Public slug — the action resolves the org from it server-side (never a
   *  client-posted orgId). */
  slug: string
  brand: string
  clinicName: string
  clinicPhone?: string | null
  /** Public-bookable visit types — used only to populate the optional "what do
   *  you need?" dropdown (submits the label as free text). */
  visitTypes: PublicVisitTypeOption[]
}

/**
 * The request-only booking form, shown on /book when the clinic has turned OFF
 * online self-scheduling (Settings → Practice). No date/time picker — the
 * patient sends a short request (email REQUIRED, phone optional) that lands as
 * an inbound message in the clinic's inbox; the front desk reaches out to set
 * the time. Mirrors BookForm's theming + spam-trust fields.
 */
export default function RequestForm({ slug, brand, clinicName, clinicPhone = null, visitTypes }: Props) {
  const brandInk = readableInk(brand)
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('pending')
    setErrorMsg('')
    const fd = new FormData(e.currentTarget)
    fd.set('slug', slug)
    // Source-attribution snapshot (mirrors the booking + contact forms).
    if (typeof window !== 'undefined') {
      fd.set('sourcePage', window.location.pathname)
      fd.set('referrer', document.referrer || '')
      // Refer-a-friend share-link token (attributes a NEW patient's request
      // to the friend who sent them).
      fd.set('ref', new URLSearchParams(window.location.search).get('ref') || '')
    }
    try {
      await submitAppointmentRequest(fd)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please call us to book.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-12 sm:py-14">
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
          style={{ backgroundColor: brand + '22' }}
        >
          <svg className="w-10 h-10" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold tracking-[-0.02em] mb-2" style={{ color: INK }}>
          Request received.
        </h2>
        <p className="leading-relaxed mb-7 max-w-md mx-auto" style={{ color: INK_MUTED }}>
          Thanks for reaching out to {clinicName}. We&rsquo;ll get back to you within one business
          day to find a time that works.
        </p>
        {clinicPhone && (
          <p className="text-sm" style={{ color: INK_MUTED }}>
            Need to reach us sooner? Call{' '}
            <a href={`tel:${clinicPhone}`} className="font-semibold hover:underline" style={{ color: INK }}>
              {clinicPhone}
            </a>
            .
          </p>
        )}
      </div>
    )
  }

  const reasons = visitTypes.map((t) => t.label).filter((l) => l.trim().length > 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Spam-trust hidden fields — validated by `looksLikeBot` server-side. */}
      <FormTrustFields />

      <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: brandInk }}>
        Request an appointment
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <input
          name="firstName"
          type="text"
          required
          placeholder="First name"
          autoComplete="given-name"
          className="px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
          style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
        />
        <input
          name="lastName"
          type="text"
          required
          placeholder="Last name"
          autoComplete="family-name"
          className="px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
          style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
        />
      </div>

      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        autoComplete="email"
        inputMode="email"
        className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
        style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
      />

      <input
        name="phone"
        type="tel"
        placeholder="Phone number (optional)"
        autoComplete="tel"
        inputMode="tel"
        className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
        style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
      />

      {reasons.length > 0 && (
        <select
          name="reason"
          defaultValue=""
          aria-label="What do you need?"
          className="w-full min-h-[44px] px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2 appearance-none"
          style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
        >
          <option value="">What do you need? (optional)</option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}

      <input
        name="preferredTimes"
        type="text"
        placeholder="When works best? e.g. weekday mornings (optional)"
        className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
        style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
      />

      <textarea
        name="notes"
        rows={3}
        placeholder="Anything we should know? (optional)"
        className="w-full px-4 py-3 rounded-xl text-[15px] resize-none focus:outline-none focus:ring-2"
        style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
      />

      {status === 'error' && errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

      <button
        type="submit"
        disabled={status === 'pending'}
        className="w-full py-4 rounded-full text-base font-semibold text-white shadow-lg transition hover:opacity-95 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: brand }}
      >
        {status === 'pending' ? 'Sending…' : 'Send request'}
      </button>
      <p className="text-xs text-center" style={{ color: INK_MUTED }}>
        We&rsquo;ll use your email only to reach you about your visit — never spam.
      </p>
    </form>
  )
}
