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

export default async function PatientBookPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')

  const minDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)

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
