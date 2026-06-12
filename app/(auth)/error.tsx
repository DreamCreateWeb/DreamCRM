'use client'

import { useEffect } from 'react'

/**
 * Route-group error boundary for the auth surfaces (sign-in / sign-up / reset /
 * accept-invite). These pages are reached from email links and may sit open
 * across deploys, so a render-time error (incl. a deployment-skew chunk/action
 * mismatch) must NEVER show Next's raw error screen. A refresh re-fetches the
 * current build's chunks + action ids, which is the fix in the overwhelming
 * majority of cases — so we lead with it.
 */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[auth] route error boundary', error)
  }, [error])

  return (
    <div className="v2-app min-h-[100dvh] flex items-center justify-center bg-white dark:bg-gray-900 px-4">
      <div className="v2-card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          We may have just shipped an update. Refreshing usually fixes it — your link still works.
        </p>
        <button
          onClick={() => {
            // Try the in-place recovery first; fall back to a hard reload, which
            // re-fetches the current build (the deployment-skew fix).
            try {
              reset()
            } catch {
              /* ignore */
            }
            window.location.reload()
          }}
          className="btn w-full bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
