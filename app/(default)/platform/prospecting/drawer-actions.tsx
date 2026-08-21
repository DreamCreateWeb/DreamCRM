'use client'

import { useState, useTransition } from 'react'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
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
  // Which act is in flight — five buttons share the transition, one spins.
  const [active, setActive] = useState<'enroll' | 'stop' | 'demo' | 'enrich' | 'suppress' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const confirm = useConfirm()

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
            pending={pending && active === 'enroll'}
            disabled={pending}
            onClick={() => {
              setActive('enroll')
              startTransition(async () => {
                setError(null)
                const r = await enrollProspectAction(prospectId)
                if (!r.ok) setError(r.error ?? 'Could not enroll.')
                else toast('Enrolled — the next outreach run picks them up')
                setActive(null)
              })
            }}
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
            pending={pending && active === 'stop'}
            disabled={pending}
            onClick={() => {
              setActive('stop')
              startTransition(async () => {
                await stopEnrollmentAction(prospectId)
                toast('Sequence stopped')
                setActive(null)
              })
            }}
          >
            ⏹ Stop sequence
          </ActionButton>
        )}
        <ActionButton
          size="sm"
          variant="secondary"
          href={`/platform/prospecting/demo/${prospectId}`}
          title="The pre-call briefing: gaps as demo ammunition, walk-up story, AI objection prep"
        >
          📋 Demo prep
        </ActionButton>
        <ActionButton
          size="sm"
          variant="secondary"
          disabled={pending}
          title="Enter the demo clinic with this practice's name on it — their practice, running on DreamCRM"
          onClick={() =>
            startTransition(async () => {
              // Pre-open the script window INSIDE the click gesture (popup
              // blockers kill window.open after an await), then point it at
              // the script once the demo cookies exist.
              const script = window.open('', 'dcDemoScript', 'width=440,height=780')
              const res = await startBrandedDemoAction(prospectId)
              if (script) script.location.href = '/demo/script'
              // Hard-assign so middleware + tenant context see the new demo
              // cookies; the action picks the story's first beat.
              window.location.assign(res.to)
            })
          }
        >
          🎬 Branded demo
        </ActionButton>
        <ActionButton
          size="sm"
          variant="ghost"
          pending={pending && active === 'enrich'}
          disabled={pending}
          title="Recrawl their site (brand color, logo, booking signals), refresh Google data, and rescore"
          onClick={() => {
            setActive('enrich')
            startTransition(async () => {
              setError(null)
              const r = await reEnrichProspectAction(prospectId)
              if (!r.ok) {
                setError(
                  r.reason === 'budget'
                    ? 'Monthly enrichment budget is used up — try next month or raise it in Settings.'
                    : `Re-enrich failed (${r.reason ?? 'unknown'}).`,
                )
              } else {
                toast('Refreshed — new crawl, Google data, and score')
              }
              setActive(null)
            })
          }}
        >
          ↻ Re-enrich
        </ActionButton>
        <ActionButton
          size="sm"
          variant="secondary"
          pending={pending && active === 'suppress'}
          disabled={pending}
          onClick={async () => {
            if (
              !(await confirm({
                title: 'Never contact this practice again?',
                message: hasEmail ? 'Their email is suppressed forever.' : undefined,
                confirmLabel: 'Suppress',
                danger: true,
              }))
            )
              return
            setActive('suppress')
            startTransition(async () => {
              await suppressProspectAction(prospectId)
              toast('Suppressed — they will never be contacted again')
              setActive(null)
            })
          }}
        >
          🚫 Suppress
        </ActionButton>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
