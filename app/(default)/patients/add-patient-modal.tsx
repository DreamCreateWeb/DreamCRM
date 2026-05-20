'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createPatientAction } from './actions'

export default function AddPatientModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = await createPatientAction(formData)
      if (!r.ok) { setError(r.error); return }
      router.push(`/patients/${r.id}`)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add patient</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Lightweight v1: name, contact, and DOB. You can fill in the rest from the patient page.
          </p>
        </div>
        <form action={submit} className="px-6 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">First name</span>
              <input name="firstName" required className="form-input w-full mt-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Last name</span>
              <input name="lastName" required className="form-input w-full mt-1 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email</span>
            <input name="email" type="email" className="form-input w-full mt-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Phone</span>
            <input name="phone" type="tel" className="form-input w-full mt-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date of birth</span>
            <input name="dateOfBirth" type="date" className="form-input w-full mt-1 text-sm" />
          </label>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 disabled:opacity-50">
              {pending ? 'Saving…' : 'Save & open'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
