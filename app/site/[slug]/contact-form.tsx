'use client'

import { useState } from 'react'
import { submitContactRequest } from './actions'

interface Props {
  orgId: string
  brand: string
  isPro: boolean
  basePath: string
}

export default function ContactForm({ orgId, brand, isPro, basePath }: Props) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

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
    fd.set('orgId', orgId)
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="cf-name">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            id="cf-name"
            name="name"
            type="text"
            required
            placeholder="Jane Smith"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
            style={{ ['--tw-ring-color' as string]: brand }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="cf-phone">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            id="cf-phone"
            name="phone"
            type="tel"
            required
            placeholder="(555) 000-0000"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="cf-email">
          Email
        </label>
        <input
          id="cf-email"
          name="email"
          type="email"
          placeholder="jane@example.com"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="cf-date">
          Preferred Date
        </label>
        <input
          id="cf-date"
          name="preferredDate"
          type="date"
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="cf-message">
          Message or reason for visit
        </label>
        <textarea
          id="cf-message"
          name="message"
          rows={3}
          placeholder="e.g. Annual cleaning, tooth pain, new patient…"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition resize-none"
        />
      </div>

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
