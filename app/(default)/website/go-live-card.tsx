'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { goLiveAction } from './go-live-actions'

/**
 * The GO-LIVE LEVER card (Website hub, owner/admin, only while the site is
 * behind the lever). Shows the readiness resolver's honest state — what
 * still needs eyes, what's still open, what's in someone else's queue —
 * then one deliberate button. Nothing here blocks the pull: the clinic
 * decides ("clinics choose before it goes live"), the card just makes sure
 * they decide with the truth in front of them.
 */
export interface GoLiveCardProps {
  siteHost: string
  attention: Array<{ id: string; label: string }>
  openRequired: Array<{ id: string; label: string }>
  waiting: Array<{ id: string; label: string }>
}

export default function GoLiveCard({ siteHost, attention, openRequired, waiting }: GoLiveCardProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const clean = attention.length === 0 && openRequired.length === 0

  function pull() {
    setError(null)
    startTransition(async () => {
      const res = await goLiveAction()
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error)
        setConfirming(false)
      }
    })
  }

  return (
    <section className="mb-6">
      <div className="v2-card rounded-[var(--r-lg)] border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[16rem]">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 mb-1">
              Not live yet
            </p>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              Your site is ready when you are
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Visitors to <span className="font-medium">{siteHost}</span> currently see a
              “coming soon” page. Everything you build here stays behind the curtain until you
              take it live — booking included.
            </p>

            {clean ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-3 font-medium">
                Everything checks out — nothing is waiting on you.
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {attention.map((f) => (
                  <p key={f.id} className="text-sm text-amber-800 dark:text-amber-300">
                    <span aria-hidden="true">⚠️ </span>
                    {f.label}
                  </p>
                ))}
                {openRequired.map((f) => (
                  <p key={f.id} className="text-sm text-gray-600 dark:text-gray-400">
                    <span aria-hidden="true">○ </span>
                    {f.label}
                  </p>
                ))}
              </div>
            )}
            {waiting.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                In someone else’s queue (not blocking):{' '}
                {waiting.map((f) => f.label.toLowerCase()).join(' · ')}
              </p>
            )}
            {!clean && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                None of this blocks you — it’s your call when the site goes public.
              </p>
            )}
            {error && (
              <p className="text-sm text-rose-600 mt-2" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="shrink-0 self-center">
            {confirming ? (
              <div className="flex flex-col items-stretch gap-2">
                <button
                  type="button"
                  onClick={pull}
                  disabled={pending}
                  className="btn bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                >
                  {pending ? 'Going live…' : 'Yes — put my site online'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="btn-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Not yet
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Go live
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The lever's reverse gear, tucked in the hub's utility footer: takes the
 * public site back behind the coming-soon page. Two-step confirm, same as
 * going live — both directions are deliberate acts.
 */
export function TakeOfflineLink() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function pull() {
    startTransition(async () => {
      const { takeSiteOfflineAction } = await import('./go-live-actions')
      const res = await takeSiteOfflineAction()
      if (res.ok) router.refresh()
      setConfirming(false)
    })
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <span className="text-gray-600 dark:text-gray-300">
          Visitors will see “coming soon” until you go live again.
        </span>
        <button
          type="button"
          onClick={pull}
          disabled={pending}
          className="font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-60"
        >
          {pending ? 'Taking offline…' : 'Take it offline'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Keep it live
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="group inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-rose-600"
    >
      <span aria-hidden="true">🌙</span>
      <span className="font-semibold">Take site offline</span>
    </button>
  )
}
