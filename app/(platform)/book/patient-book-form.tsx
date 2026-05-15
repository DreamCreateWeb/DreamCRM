'use client'

import { useState } from 'react'
import { submitPatientBookingRequest } from './actions'

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
  patientId: string | null
  brand: string
  clinicName: string
}

export default function PatientBookForm({ orgId, patientId, brand, clinicName }: Props) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  if (status === 'success') {
    return (
      <div className="text-center py-12">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
          style={{ backgroundColor: brand + '18' }}
        >
          <svg className="w-8 h-8" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Appointment Requested</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
          {clinicName} will confirm your appointment within 24 hours.
        </p>
        <a href="/appointments" className="inline-block mt-6 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline">
          View my appointments →
        </a>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('pending')
    setErrorMsg('')
    const fd = new FormData(e.currentTarget)
    fd.set('orgId', orgId)
    if (patientId) fd.set('patientId', patientId)
    try {
      await submitPatientBookingRequest(fd)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please call us to book.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="pb-type">
          Type of Visit
        </label>
        <select
          id="pb-type"
          name="type"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
        >
          {APPT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="pb-time">
          Preferred Date & Time <span className="text-red-500">*</span>
        </label>
        <input
          id="pb-time"
          name="startTime"
          type="datetime-local"
          required
          min={new Date().toISOString().slice(0, 16)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="pb-notes">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="pb-notes"
          name="notes"
          rows={3}
          placeholder="Anything we should know before your visit…"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
        />
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'pending'}
        className="w-full py-3.5 rounded-xl text-base font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {status === 'pending' ? 'Submitting…' : 'Request Appointment'}
      </button>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        The clinic will confirm within 24 hours.
      </p>
    </form>
  )
}
