'use client'

import { useEffect } from 'react'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'

/**
 * Route-group error boundary for the partner accept surface. Same rationale as
 * the (auth) boundary: this page is reached from an email link, sits open
 * across deploys, and must never show Next's raw error screen. Refresh-first
 * recovery (re-fetches the current build's chunks + action ids).
 */
export default function PartnerAcceptError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[partner-accept] route error boundary', error)
  }, [error])

  return (
    <div className="v2-app min-h-screen flex flex-col bg-[color:var(--color-canvas)]">
      <header className="aura-chrome border-b border-gray-200/70 dark:border-gray-700/60">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center">
          <DreamCreateLogo size={26} />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm v2-card p-6 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            We may have just shipped an update. Refreshing usually fixes it — your invite link still works.
          </p>
          <button
            onClick={() => {
              try {
                reset()
              } catch {
                /* ignore */
              }
              window.location.reload()
            }}
            className="btn w-full bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
          >
            Refresh
          </button>
        </div>
      </main>
    </div>
  )
}
