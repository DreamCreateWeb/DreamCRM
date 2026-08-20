'use client'

import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * THE dirty → save → confirmed bar (hoisted from the Practice panel, which
 * modeled it first). One save language for form panels: the button disables
 * until something changed, "Unsaved changes" warns while dirty, and "Saved"
 * PERSISTS until the next edit — a confirmation that self-destructs on a
 * timer is a confirmation the user can miss.
 *
 * Surfaces with several stacked cards adopt ONE of these per card in place
 * of competing raw primaries (design-panel's four teal buttons were the
 * motivating offender).
 */
export function SaveBar({
  dirty,
  saved,
  pending,
  onSave,
  saveLabel = 'Save changes',
}: {
  dirty: boolean
  saved: boolean
  pending: boolean
  onSave: () => void
  saveLabel?: string
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <ActionButton variant="primary" size="sm" onClick={onSave} pending={pending} disabled={!dirty}>
        {saveLabel}
      </ActionButton>
      {dirty && !pending && <StatusPill tone="warn" label="Unsaved changes" />}
      {!dirty && saved && !pending && (
        <span
          role="status"
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
            <path d="M13.4 4.2a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4L6.7 9.5l5.3-5.3a1 1 0 0 1 1.4 0Z" />
          </svg>
          Saved
        </span>
      )}
    </div>
  )
}
