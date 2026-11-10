'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { runAction } from '@/lib/run-action'
import { PROSPECT_STATUS_LABELS, type DuplicateCandidate } from '@/lib/types/prospecting'
import { mergeProspectAction } from './admin-actions'

/**
 * The drawer's duplicate card (P-03): "Possible duplicate of <name> ·
 * Merge". The matcher found a row sharing this practice's phone, Google
 * listing, or name + ZIP; the sweep only merges the EXACT ones on its own,
 * so a human decides here. The confirm is awaited BEFORE the transition
 * (the dialog law); the merge itself rides runAction; the survivor rule
 * picks which row stays, and the drawer re-opens on it.
 */
export default function DuplicateCard({
  prospectId,
  prospectName,
  candidates,
}: {
  prospectId: string
  prospectName: string
  candidates: DuplicateCandidate[]
}) {
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const confirm = useConfirm()
  if (candidates.length === 0) return null

  return (
    <div
      className="rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] p-3"
      data-duplicate-card
      role="group"
      aria-label="Possible duplicates"
    >
      <div className="flex items-center gap-2">
        <StatusPill tone="warn" label={candidates.length === 1 ? 'Possible duplicate' : `${candidates.length} possible duplicates`} />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          The row that keeps the history is the better-verified one; nothing is deleted.
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-duplicate-of={c.id}>
            <div className="min-w-0">
              <span className="text-gray-500 dark:text-gray-400">Possible duplicate of </span>
              <Link
                href={`/platform/prospecting?prospect=${c.id}`}
                scroll={false}
                className="font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400"
              >
                {c.name}
              </Link>
              <span className="text-gray-500 dark:text-gray-400">
                {[c.city, c.state].filter(Boolean).length > 0 ? ` · ${[c.city, c.state].filter(Boolean).join(', ')}` : ''} ·{' '}
                {c.reasons.join(' · ')}
              </span>
              <span className="ml-1.5 inline-flex items-center gap-1">
                <StatusPill tone={c.exact ? 'ok' : 'neutral'} label={c.exact ? 'Exact match' : 'Needs a look'} />
                <StatusPill tone="neutral" label={PROSPECT_STATUS_LABELS[c.status] ?? c.status} />
              </span>
            </div>
            <ActionButton
              size="sm"
              variant="secondary"
              pending={pending && active === c.id}
              disabled={pending}
              onClick={async () => {
                // The dialog law: awaited BEFORE the transition.
                if (
                  !(await confirm({
                    title: `Merge ${c.name} with ${prospectName}?`,
                    message:
                      'Contacts, calls, meetings, outreach history and suppressions move onto the row that stays; the other is marked merged and kept.',
                    confirmLabel: 'Merge',
                  }))
                )
                  return
                setActive(c.id)
                startTransition(async () => {
                  setError(null)
                  try {
                    const r = await runAction(() => mergeProspectAction(prospectId, c.id))
                    if (!r.ok) {
                      setError('error' in r ? r.error : `Could not merge (${r.reason}).`)
                      return
                    }
                    toast('Merged — one practice, one record')
                    // A merge changes which row the drawer should show.
                    window.location.assign(`/platform/prospecting?prospect=${r.survivorId}`)
                  } finally {
                    setActive(null)
                  }
                })
              }}
            >
              Merge
            </ActionButton>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
