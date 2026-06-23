'use client'

import { useState } from 'react'
import { summarizeSubmissionAction } from '../../actions'
import type { IntakeSummary } from '@/lib/services/intake-summary'

/**
 * AI pre-visit summary card on the submission viewer. Shows the cached summary
 * if present, otherwise a "Summarize for the provider" button (button-triggered
 * so it never auto-spends tokens). Violet (special tone), distinct from the
 * record content. Re-runnable.
 */
export default function PreVisitSummary({
  submissionId,
  initial,
  aiEnabled,
}: {
  submissionId: string
  initial: IntakeSummary | null
  aiEnabled: boolean
}) {
  const [summary, setSummary] = useState<IntakeSummary | null>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run(force: boolean) {
    if (pending) return
    setPending(true)
    setError(null)
    void summarizeSubmissionAction(submissionId, force)
      .then((res) => {
        if (res.ok) setSummary(res.summary)
        else setError(res.error)
      })
      .catch(() => setError('Could not summarize — please try again.'))
      .finally(() => setPending(false))
  }

  if (!aiEnabled && !summary) return null

  return (
    <div className="mb-5 rounded-[var(--r-lg)] border border-violet-200/70 bg-violet-500/[0.06] p-4 dark:border-violet-400/20">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
          <span aria-hidden="true">✨</span> Pre-visit summary
        </p>
        {(summary || aiEnabled) && (
          <button
            type="button"
            onClick={() => run(!!summary)}
            disabled={pending}
            className="text-xs font-medium text-violet-700 hover:underline disabled:opacity-50 dark:text-violet-300"
          >
            {pending ? 'Summarizing…' : summary ? 'Regenerate' : 'Summarize for the provider'}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {summary ? (
        <div className="mt-2">
          <p className="text-sm text-gray-800 dark:text-gray-100">{summary.summary}</p>
          {summary.alerts.length > 0 && (
            <ul className="mt-2 space-y-1">
              {summary.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-200">
                  <span aria-hidden="true" className="mt-0.5">⚠️</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[0.7rem] text-gray-400 dark:text-gray-500">
            AI-generated from this form for triage — verify against the answers below.
          </p>
        </div>
      ) : (
        !pending && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Get a one-line summary + medical alerts (allergies, medications, anxiety) for the provider.
          </p>
        )
      )}
    </div>
  )
}
