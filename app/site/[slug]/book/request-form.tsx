'use client'

import { useEffect, useRef, useState } from 'react'
import { submitAppointmentRequest } from '../actions'
import { readableInk, brandFill } from '@/lib/clinic-site-theme'
import { SuccessWell } from '@/components/clinic-site/success-well'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'
import type { PublicVisitTypeOption } from './book-form'
import { SITE_BG as BG, SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'


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

  // The success screen REPLACES the form outright — the submit button unmounts
  // and focus falls back to <body>, so the whole payoff of the request funnel
  // was silent. A live region cannot carry this one: it mounts
  // already-populated, the case screen readers do not reliably announce. Focus
  // is the phase-change contract here, same as the self-scheduling form's
  // BookingSuccess: it speaks the heading AND puts the keyboard at the top of
  // the new content.
  const successHeadingRef = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    if (status === 'success') successHeadingRef.current?.focus()
  }, [status])

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
      // The action returns its outcome rather than throwing it: in production
      // Next.js replaces a server-action error message with an opaque digest,
      // so the clinic's own wording never reached the patient. The catch below
      // stays for a genuinely failed round trip — the network dropping, not
      // the form being wrong.
      const res = await submitAppointmentRequest(fd)
      if (!res.ok) {
        setErrorMsg(res.error)
        setStatus('error')
        return
      }
      setStatus('success')
    } catch {
      setErrorMsg('Something went wrong. Please call us to book.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-12 sm:py-14">
        <SuccessWell brand={brand} className="mb-6" />
        <h2
          ref={successHeadingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-[-0.02em] mb-2 focus:outline-none"
          style={{ color: INK }}
        >
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

      {/* Visible labels (placeholders vanish on the first keystroke — the
          same recipe as the booking form's fields). */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="rf-first" className="mb-1 block text-xs font-semibold" style={{ color: INK_MUTED }}>
            First name
          </label>
          <input
            id="rf-first"
            name="firstName"
            type="text"
            required
            autoComplete="given-name"
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          />
        </div>
        <div>
          <label htmlFor="rf-last" className="mb-1 block text-xs font-semibold" style={{ color: INK_MUTED }}>
            Last name
          </label>
          <input
            id="rf-last"
            name="lastName"
            type="text"
            required
            autoComplete="family-name"
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          />
        </div>
      </div>

      <div>
        <label htmlFor="rf-email" className="mb-1 block text-xs font-semibold" style={{ color: INK_MUTED }}>
          Email
        </label>
        <input
          id="rf-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
          style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
        />
      </div>

      <div>
        <label htmlFor="rf-phone" className="mb-1 block text-xs font-semibold" style={{ color: INK_MUTED }}>
          Phone number <span className="font-normal">(optional)</span>
        </label>
        <input
          id="rf-phone"
          name="phone"
          type="tel"
          placeholder="(555) 123-4567"
          autoComplete="tel"
          inputMode="tel"
          className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
          style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
        />
      </div>

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

      {/* The one node that has to interrupt: the submit failed and the patient
          is still looking at the button they just pressed. */}
      {status === 'error' && errorMsg && (
        <p role="alert" className="text-sm text-red-600">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'pending'}
        className="w-full py-4 rounded-full text-base font-semibold text-white shadow-lg transition hover:opacity-95 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: brandFill(brand) }}
      >
        {status === 'pending' ? 'Sending…' : 'Send request'}
      </button>
      <p className="text-xs text-center" style={{ color: INK_MUTED }}>
        We&rsquo;ll use your email only to reach you about your visit — never spam.
      </p>
    </form>
  )
}
