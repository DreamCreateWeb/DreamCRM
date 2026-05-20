'use client'

import { useState, useTransition } from 'react'
import type { PatientListRow } from '@/lib/services/patients'
import { bulkSendEmailAction } from './actions'

export default function BulkMessageModal({
  patients,
  onClose,
  onSent,
}: {
  patients: PatientListRow[]
  onClose: () => void
  onSent: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [result, setResult] = useState<{ sent: number; skipped: number; errors: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reachable = patients.filter((p) => p.email).length
  const skipped = patients.length - reachable

  function submit() {
    setError(null)
    setResult(null)
    if (!body.trim()) { setError('Message body is required'); return }
    startTransition(async () => {
      const r = await bulkSendEmailAction(patients.map((p) => p.id), subject, body)
      if ('ok' in r && r.ok === false) {
        setError(r.error)
      } else if ('attempted' in r) {
        setResult({
          sent: r.sent,
          skipped: r.skippedNoEmail + r.skippedArchived,
          errors: r.errors.length,
        })
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Send email</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {reachable} {reachable === 1 ? 'patient' : 'patients'} will receive this
            {skipped > 0 && <> · {skipped} skipped (no email on file)</>}
          </p>
        </div>

        {result ? (
          <div className="px-6 py-5 flex-1">
            <p className="text-2xl mb-3">📬</p>
            <p className="text-sm text-gray-800 dark:text-gray-100 mb-1">
              Sent {result.sent} {result.sent === 1 ? 'email' : 'emails'}.
            </p>
            {result.skipped > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Skipped {result.skipped} (no email or archived).</p>
            )}
            {result.errors > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">{result.errors} {result.errors === 1 ? 'error' : 'errors'} during send.</p>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={onSent} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800">Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Time for your 6-month check-up"
                  className="form-input w-full mt-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Message</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi — it's been six months since your last cleaning. Click the link below to book."
                  className="form-textarea w-full mt-1 text-sm min-h-[160px]"
                />
              </label>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Each email will be personalized with the patient's first name. Sends from
                your clinic's display name via DreamCreateWeb's domain. Standard CAN-SPAM
                footer is added automatically.
              </p>
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700/60 flex justify-end gap-2">
              <button onClick={onClose} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={pending || reachable === 0}
                className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 disabled:opacity-50"
              >
                {pending ? 'Sending…' : `Send to ${reachable}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
