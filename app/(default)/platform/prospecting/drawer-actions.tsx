'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import {
  suppressProspectAction,
  enrollProspectAction,
  stopEnrollmentAction,
  startBrandedDemoAction,
  reEnrichProspectAction,
} from './admin-actions'

/**
 * Drawer action strip: Enroll (fail-closed guards server-side) / Stop /
 * Suppress. Convert + Branded demo land with their phases — no dead
 * buttons before their machinery exists (the no-fake-content rule).
 */
export default function DrawerActions({
  prospectId,
  status,
  hasEmail,
}: {
  prospectId: string
  status: string
  hasEmail: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'suppressed' || status === 'converted') return null

  const enrollable =
    hasEmail && ['enriched', 'discovered', 'engaged'].includes(status)
  const enrolled = ['queued', 'contacted'].includes(status)

  return (
    <div className="mt-6 pt-4 border-t border-[color:var(--color-hairline)]">
      <div className="flex flex-wrap items-center gap-2">
        {enrollable && (
          <ActionButton
            size="sm"
            variant="primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const r = await enrollProspectAction(prospectId)
                if (!r.ok) setError(r.error ?? 'Could not enroll.')
              })
            }
          >
            ✉️ Enroll in outreach
          </ActionButton>
        )}
        {!hasEmail && !enrolled && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            No email found — this one goes straight to a phone call.
          </span>
        )}
        {enrolled && (
          <ActionButton
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => startTransition(() => stopEnrollmentAction(prospectId))}
          >
            ⏹ Stop sequence
          </ActionButton>
        )}
        <ActionButton
          size="sm"
          variant="secondary"
          disabled={pending}
          title="Enter the demo clinic with this practice's name on it — their practice, running on DreamCRM"
          onClick={() =>
            startTransition(async () => {
              await startBrandedDemoAction(prospectId)
              // Server action redirects; hard-assign as a fallback so the
              // new demo cookies are seen by middleware + tenant context.
              window.location.assign('/')
            })
          }
        >
          🎬 Branded demo
        </ActionButton>
        <ActionButton
          size="sm"
          variant="ghost"
          disabled={pending}
          title="Recrawl their site (brand color, logo, booking signals), refresh Google data, and rescore"
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const r = await reEnrichProspectAction(prospectId)
              if (!r.ok) {
                setError(
                  r.reason === 'budget'
                    ? 'Monthly enrichment budget is used up — try next month or raise it in Settings.'
                    : `Re-enrich failed (${r.reason ?? 'unknown'}).`,
                )
              }
            })
          }
        >
          ↻ Re-enrich
        </ActionButton>
        {confirming ? (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Never contact this practice again{hasEmail ? ' (email suppressed forever)' : ''}?
            </span>
            <ActionButton
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => startTransition(() => suppressProspectAction(prospectId))}
            >
              Yes, suppress
            </ActionButton>
            <ActionButton size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </ActionButton>
          </>
        ) : (
          <ActionButton size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            🚫 Suppress
          </ActionButton>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}
