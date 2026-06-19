'use client'

import { useRef, useState, useTransition } from 'react'
import type { PatientListRow } from '@/lib/services/patients'
import { ActionButton } from '@/components/ui/action-button'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { bulkSendEmailAction } from './actions'

export default function BulkMessageModal({
  patients,
  onClose,
  onSent,
}: {
  patients: PatientListRow[]
  onClose: () => void
  /** Called after a successful send, with the number of emails delivered. */
  onSent: (sent: number) => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [result, setResult] = useState<{ sent: number; skipped: number; errors: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, dialogRef, { onEscape: onClose })

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
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Send email" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] px-2 sm:px-4">
      <div className="section-enter bg-[color:var(--color-surface-2)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-[color:var(--color-hairline)]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Send email</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span className="tabular-nums">{reachable}</span> {reachable === 1 ? 'patient' : 'patients'} will receive this
            {skipped > 0 && <> · <span className="tabular-nums">{skipped}</span> skipped (no email on file)</>}
          </p>
        </div>

        {result ? (
          <div className="px-6 py-5 flex-1">
            <p className="text-2xl mb-3" aria-hidden="true">📬</p>
            <p className="text-sm text-gray-800 dark:text-gray-100 mb-1">
              Sent <span className="tabular-nums">{result.sent}</span> {result.sent === 1 ? 'email' : 'emails'}.
            </p>
            {result.skipped > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Skipped <span className="tabular-nums">{result.skipped}</span> (no email or archived).</p>
            )}
            {result.errors > 0 && (
              <p className="text-xs text-rose-700 dark:text-rose-300"><span className="tabular-nums">{result.errors}</span> {result.errors === 1 ? 'error' : 'errors'} during send.</p>
            )}
            <div className="mt-5 flex justify-end">
              <ActionButton variant="primary" size="sm" onClick={() => onSent(result.sent)}>Done</ActionButton>
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
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Each email is personalized with the patient&apos;s first name and sent from
                your clinic&apos;s sender identity. A standard unsubscribe footer is added
                automatically.
              </p>
              {error && (
                <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[color:var(--color-hairline)] flex justify-end gap-2">
              <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton
                variant="primary"
                size="sm"
                onClick={submit}
                disabled={pending || reachable === 0}
              >
                {pending ? 'Sending…' : `Send to ${reachable}`}
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
