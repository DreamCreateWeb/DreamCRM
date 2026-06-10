'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { createInternalAppointmentAction } from './actions'

const APPT_TYPES = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'checkup', label: 'Checkup' },
  { value: 'filling', label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root canal' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'other', label: 'Other' },
] as const

/**
 * In-place drawer rendered on the patient detail page when "Book
 * appointment" is clicked. Reuses the same date+time form pattern as the
 * reschedule drawer in the appointments module. Submits via
 * createInternalAppointmentAction with the patient pre-filled.
 *
 * Per the research doc: staying on the patient page keeps the staff
 * member in their relationship conversation context instead of bouncing
 * them to /appointments.
 */
export default function BookFromPatientDrawer({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string
  patientName: string
  onClose: () => void
}) {
  const router = useRouter()
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [timeStr, setTimeStr] = useState('09:00')
  const [type, setType] = useState<string>('cleaning')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const iso = `${dateStr}T${timeStr}:00`
    const local = new Date(iso)
    if (Number.isNaN(local.getTime())) { setError('Pick a valid date + time'); return }
    startTransition(async () => {
      const r = await createInternalAppointmentAction({
        patientId,
        startTime: local.toISOString(),
        type,
        notes: notes.trim() || null,
      })
      if ('ok' in r && r.ok === true) {
        router.refresh()
        onClose()
      } else if ('error' in r) {
        setError(r.error)
      }
    })
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Book appointment" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Book appointment</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">For <strong>{patientName}</strong></p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="form-select w-full mt-1 text-sm">
              {APPT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Date</span>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="form-input w-full mt-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Time</span>
              <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} className="form-input w-full mt-1 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the front desk should know…" className="form-textarea w-full mt-1 text-sm min-h-[80px]" />
          </label>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700/60 flex justify-end gap-2">
          <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Book appointment'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
