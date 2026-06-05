export const metadata = {
  title: 'Book a Visit - DreamCRM',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { bookAppointment } from './actions'

const APPT_TYPES = [
  { value: 'checkup', label: 'Checkup / Exam' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'filling', label: 'Filling' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'other', label: 'Other' },
]

const ERROR_MESSAGES: Record<string, string> = {
  unavailable: "That time isn't available — please choose another opening during clinic hours.",
  past: 'Please choose a time in the future.',
  invalid_time: 'Please choose a valid date and time.',
}

export default async function PatientBookPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')

  const { error } = await searchParams
  const errorMsg = error ? (ERROR_MESSAGES[error] ?? null) : null

  // Earliest bookable time: at least an hour out, rounded up to the next :00/:30
  // so the picker's 30-minute steps line up with the clinic's bookable slots.
  const min = new Date(Date.now() + 60 * 60 * 1000)
  min.setUTCSeconds(0, 0)
  const m = min.getUTCMinutes()
  if (m > 30) {
    min.setUTCMinutes(0)
    min.setUTCHours(min.getUTCHours() + 1)
  } else if (m > 0) {
    min.setUTCMinutes(30)
  }
  const minDateTime = min.toISOString().slice(0, 16)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Book a Visit
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Request an appointment with {ctx.organizationName}.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      <form action={bookAppointment} className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="type">
            Type of Visit
          </label>
          <select id="type" name="type" className="form-select w-full" defaultValue="checkup">
            {APPT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="startTime">
            Preferred Date &amp; Time <span className="text-red-500">*</span>
          </label>
          <input
            id="startTime"
            name="startTime"
            type="datetime-local"
            required
            min={minDateTime}
            step={1800}
            className="form-input w-full"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Your clinic will confirm or suggest an alternate time within 24 hours.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="form-textarea w-full"
            placeholder="Anything we should know before your visit…"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            Request Appointment
          </button>
        </div>
      </form>
    </div>
  )
}
