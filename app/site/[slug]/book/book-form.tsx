'use client'

import { useState } from 'react'
import { submitBookingRequest } from '../actions'

const APPT_TYPES = [
  { value: 'checkup', label: 'Checkup / Exam' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'filling', label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root Canal' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'other', label: 'Other' },
]

interface Props {
  orgId: string
  brand: string
  clinicName: string
}

export default function BookForm({ orgId, brand, clinicName }: Props) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  if (status === 'success') {
    return (
      <div className="text-center py-16">
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
          style={{ backgroundColor: brand + '18' }}
        >
          <svg className="w-10 h-10" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">You're booked!</h2>
        <p className="text-gray-500 max-w-sm mx-auto">
          Your appointment at {clinicName} has been scheduled. Check your email for confirmation — we'll call to confirm within 24 hours.
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
    try {
      await submitBookingRequest(fd)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please call us to book.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bk-first">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            id="bk-first"
            name="firstName"
            type="text"
            required
            placeholder="Jane"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bk-last">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            id="bk-last"
            name="lastName"
            type="text"
            required
            placeholder="Smith"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bk-email">
            Email
          </label>
          <input
            id="bk-email"
            name="email"
            type="email"
            placeholder="jane@example.com"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bk-phone">
            Phone
          </label>
          <input
            id="bk-phone"
            name="phone"
            type="tel"
            placeholder="(555) 000-0000"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bk-type">
          Type of Visit
        </label>
        <select
          id="bk-type"
          name="type"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
        >
          {APPT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bk-time">
          Preferred Date & Time <span className="text-red-500">*</span>
        </label>
        <input
          id="bk-time"
          name="startTime"
          type="datetime-local"
          required
          min={new Date().toISOString().slice(0, 16)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="bk-notes">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="bk-notes"
          name="notes"
          rows={3}
          placeholder="Anything we should know before your visit…"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'pending'}
        className="w-full py-4 rounded-xl text-base font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {status === 'pending' ? 'Booking…' : 'Confirm Appointment'}
      </button>
      <p className="text-xs text-gray-400 text-center">
        We'll send you a confirmation and call to verify within 24 hours.
      </p>
    </form>
  )
}
