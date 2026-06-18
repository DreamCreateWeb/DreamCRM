'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { generateCalendarFeedAction, disableCalendarFeedAction } from './calendar-feed-actions'

/**
 * Settings → Clinic "Calendar feed" card. Surfaces a tokenized, read-only .ics
 * URL the clinic subscribes to in Google / Apple / Outlook Calendar to see its
 * live agenda. The URL is private (token = auth); regenerating rotates it to
 * revoke old subscriptions. Generate/regenerate/off are owner/admin-gated in the
 * actions; any staff viewing settings can copy the URL once it exists.
 */

interface Props {
  initialToken: string | null
  baseUrl: string
  canManage: boolean
}

export default function CalendarFeedCard({ initialToken, baseUrl, canManage }: Props) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const feedUrl = token ? `${baseUrl}/api/calendar/${token}.ics` : null
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:\/\//, 'webcal://') : null

  function generate() {
    setError(null)
    startTransition(async () => {
      const r = await generateCalendarFeedAction()
      if (r.ok) setToken(r.token)
      else setError(r.error)
    })
  }

  function disable() {
    if (!confirm('Turn off the calendar feed? Anyone subscribed will stop getting updates.')) return
    setError(null)
    startTransition(async () => {
      const r = await disableCalendarFeedAction()
      if (r.ok) setToken(null)
      else setError(r.error)
    })
  }

  async function copy() {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the input is selectable as a fallback */
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700/60 p-6">
      <div className="flex items-start gap-3 mb-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/12 text-teal-700 dark:text-teal-300">
          <svg className="h-5 w-5 fill-current" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 0a1 1 0 0 1 1 1v1h6V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1a1 1 0 0 1 1-1Zm10 6H2v8h12V6Z" />
          </svg>
        </span>
        <div className="grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Calendar feed</h3>
            <StatusPill tone={token ? 'ok' : 'neutral'} label={token ? 'On' : 'Off'} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Subscribe to your live appointment schedule in Google, Apple, or Outlook Calendar — it refreshes
            automatically, so the whole team sees the day in the calendar app they already use.
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">{error}</p>}

      {feedUrl ? (
        <div className="space-y-3 mt-3">
          <div>
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">Subscribe URL</span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={feedUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="form-input flex-1 text-sm font-mono"
                aria-label="Calendar feed URL"
              />
              <ActionButton variant="secondary" size="sm" onClick={copy}>
                {copied ? 'Copied ✓' : 'Copy'}
              </ActionButton>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {webcalUrl && (
              <ActionButton href={webcalUrl} variant="secondary" size="sm">
                Subscribe in Calendar
              </ActionButton>
            )}
            {canManage && (
              <ActionButton variant="ghost" size="sm" onClick={generate} disabled={pending}>
                {pending ? 'Working…' : 'Regenerate link'}
              </ActionButton>
            )}
            {canManage && (
              <ActionButton
                variant="ghost"
                size="sm"
                onClick={disable}
                disabled={pending}
                className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
              >
                Turn off
              </ActionButton>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            In <strong>Google Calendar</strong>: Other calendars → <strong>+</strong> → <strong>From URL</strong>, then
            paste the link above. This link is private — anyone with it can see your schedule, so don’t share it
            publicly. Lost it or shared by mistake? <strong>Regenerate</strong> to revoke the old one.
          </p>
        </div>
      ) : canManage ? (
        <div className="mt-3">
          <ActionButton variant="primary" size="sm" onClick={generate} disabled={pending}>
            {pending ? 'Generating…' : 'Generate calendar link'}
          </ActionButton>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          An owner or admin can turn on the calendar feed.
        </p>
      )}
    </div>
  )
}
