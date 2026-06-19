import Link from 'next/link'

/**
 * Shared "not found" card for in-context `not-found.tsx` boundaries. A
 * `notFound()` from a dashboard or portal page (a stale patient link, a deleted
 * record) used to bubble to the chrome-less ROOT 404 — dumping the user out of
 * their shell with no nav. An in-context not-found keeps the surrounding layout
 * (sidebar / portal chrome) and points back to a sensible home in the same
 * teal v2 language as RouteError, so the two read as a set.
 */
export function RouteNotFound({
  title = 'Page not found',
  message = "That page or record doesn't exist, or it may have been removed.",
  href = '/dashboard',
  linkLabel = 'Back to dashboard',
  inContent = false,
}: {
  title?: string
  message?: string
  href?: string
  linkLabel?: string
  inContent?: boolean
}) {
  return (
    <div className={`v2-app flex items-center justify-center px-4 ${inContent ? 'min-h-[60vh]' : 'min-h-[100dvh]'}`}>
      <div className="v2-card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15">
          <svg
            className="h-6 w-6 text-teal-600 dark:text-teal-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
          </svg>
        </div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-600 dark:text-teal-400">404</p>
        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{message}</p>
        <Link
          href={href}
          className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          {linkLabel}
        </Link>
      </div>
    </div>
  )
}

export default RouteNotFound
