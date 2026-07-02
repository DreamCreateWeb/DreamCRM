'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { createNewsletterDraftAction } from './actions'

/**
 * One-click monthly newsletter: drafts a campaign from the clinic's latest
 * published blog posts (the content engine no vendor can match) and opens it
 * in the composer for review. Never sends on its own.
 */
export function NewsletterCard({ publishedPostCount }: { publishedPostCount: number }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function draft() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await createNewsletterDraftAction()
        // On success the action redirects; only an error ever returns.
        if (r && !r.ok) setError(r.error)
      } catch (err) {
        // Next's redirect() throws internally — let it propagate to navigation.
        if (err && typeof err === 'object' && 'digest' in err) throw err
        setError('Could not draft the newsletter — try again in a moment.')
      }
    })
  }

  return (
    <div className="v2-card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Patient newsletter</h2>
            <span className="text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 rounded-full px-2 py-0.5">
              From your blog
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-prose">
            One click drafts this month&apos;s newsletter from your latest published blog posts —
            you review and send it like any campaign (unsubscribe link included).{' '}
            {publishedPostCount > 0 ? (
              <span className="tabular-nums">
                {publishedPostCount} published post{publishedPostCount === 1 ? '' : 's'} ready to feature.
              </span>
            ) : (
              'Publish a blog post first and this lights up.'
            )}
          </p>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p>}
        </div>
        <ActionButton
          variant="secondary"
          size="sm"
          onClick={draft}
          disabled={pending || publishedPostCount === 0}
          title={publishedPostCount === 0 ? 'Publish a blog post first — the newsletter is built from your posts' : undefined}
        >
          {pending ? 'Drafting…' : 'Draft this month’s issue'}
        </ActionButton>
      </div>
    </div>
  )
}
