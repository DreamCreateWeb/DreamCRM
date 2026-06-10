'use client'

import { useState, useTransition } from 'react'
import { dismissHintAction } from '@/app/(default)/dashboard/onboarding-actions'

/** Client half of ModuleHint — renders the banner + handles dismissal. */
export default function ModuleHintBanner({
  id,
  title,
  body,
}: {
  id: string
  title: string
  body: string
}) {
  const [hidden, setHidden] = useState(false)
  const [, startTransition] = useTransition()
  if (hidden) return null

  const dismiss = () => {
    setHidden(true)
    startTransition(async () => {
      await dismissHintAction(id)
    })
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-500/[0.06] px-4 py-3.5 dark:border-violet-500/30 dark:bg-violet-500/10">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 12.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4.2V9a1 1 0 0 1-2 0V7.5a1 1 0 0 1 1-1 1.25 1.25 0 1 0-1.25-1.25 1 1 0 0 1-2 0A3.25 3.25 0 1 1 9 8.3Z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{body}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss hint"
        className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M4.3 3.3a.7.7 0 0 0-1 1L7 8l-3.7 3.7a.7.7 0 1 0 1 1L8 9l3.7 3.7a.7.7 0 1 0 1-1L9 8l3.7-3.7a.7.7 0 0 0-1-1L8 7 4.3 3.3Z" />
        </svg>
      </button>
    </div>
  )
}
