'use client'

import { useEffect } from 'react'

/**
 * Shared route-group error boundary UI. Every authenticated + public surface
 * mounts an `error.tsx` that renders this, so a thrown render/data error NEVER
 * shows Next's raw error screen — the staff member (or patient) sees a calm,
 * on-brand card with a one-click recovery instead of a white-screen crash.
 *
 * - `reset()` is React's in-place retry (re-runs the failed Server Component
 *   subtree / refetches its data) — the right first move for a transient load
 *   error. A secondary hard reload is offered for stubborn cases (and covers a
 *   deployment-skew chunk/action mismatch, the same reasoning as the auth
 *   boundary; the app-wide ChunkReloadGuard handles most of those upstream).
 * - `inContent` renders centered within an existing layout's content area (the
 *   dashboard keeps its sidebar/header); the default fills the surface for
 *   pages that have no chrome (portal / public site / the root catch-all).
 */
export function RouteError({
  error,
  reset,
  title = 'Something went wrong',
  message = 'We hit a snag loading this page. Trying again usually fixes it.',
  inContent = false,
  retryLabel = 'Try again',
  scope = 'route',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
  inContent?: boolean
  retryLabel?: string
  /** Tag for the console log so prod logs say which surface failed. */
  scope?: string
}) {
  useEffect(() => {
    // Surfaced in CloudWatch (App Runner stdout) so a recurring boundary hit is
    // diagnosable; the digest correlates to the server-side stack.
    console.error(`[route error boundary: ${scope}]`, error)
  }, [error, scope])

  return (
    <div
      className={`v2-app flex items-center justify-center px-4 ${inContent ? 'min-h-[60vh]' : 'min-h-[100dvh]'}`}
    >
      <div className="v2-card w-full max-w-sm p-6 text-center" role="alert" aria-live="assertive">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
          <svg
            className="h-6 w-6 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <button
          onClick={() => reset()}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition-colors"
        >
          {retryLabel}
        </button>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 w-full rounded-lg px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          Reload the page
        </button>
        {error.digest && (
          <p className="mt-4 text-xs font-mono text-gray-400 dark:text-gray-600">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  )
}

export default RouteError
