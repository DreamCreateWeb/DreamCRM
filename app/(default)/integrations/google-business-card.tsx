'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { ZernioConnectionView } from '@/lib/types/zernio'
import { syncZernioAccountsAction, disconnectZernioGoogleAction } from './actions'

/**
 * Google Business Profile card for the Integrations page. Foundation scope:
 * connect / refresh / disconnect ONLY — reviews / hours / metrics arrive in
 * later PRs (teased honestly, never shown as if we already pull them).
 *
 * Connect opens the hosted-OAuth route in a NEW TAB. Because Zernio's default
 * return target is its own dashboard, we also re-sync on window focus (when the
 * clinic tabs back) + via the Refresh button, so a completed connection is
 * always detected. Demo connections never hit the network (the service
 * short-circuits) — the card just shows the seeded "connected" state.
 */
export default function GoogleBusinessCard({
  connection,
  configured,
}: {
  connection: ZernioConnectionView
  configured: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(connection.lastError)
  // After opening the connect tab, poll on focus until an account appears.
  const awaitingConnect = useRef(false)

  const connected = connection.status === 'connected' && connection.googleBusinessAccounts.length > 0
  const account = connection.googleBusinessAccounts[0]

  function refresh() {
    setError(null)
    start(async () => {
      const r = await syncZernioAccountsAction()
      if (!r.ok) setError(r.error ?? 'Could not refresh Google Business.')
      router.refresh()
    })
  }

  function disconnect() {
    setError(null)
    start(async () => {
      const r = await disconnectZernioGoogleAction()
      if (!r.ok) setError(r.error ?? 'Could not disconnect Google Business.')
      router.refresh()
    })
  }

  function onConnectClick() {
    // The link opens in a new tab (target=_blank). Mark that we're awaiting a
    // connection so the next focus re-syncs.
    awaitingConnect.current = true
  }

  // Re-sync when the tab regains focus after a connect attempt (or always, if
  // already connected, to keep the handle fresh). Cheap + best-effort.
  useEffect(() => {
    function onFocus() {
      if (awaitingConnect.current && !pending) {
        awaitingConnect.current = false
        refresh()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Google &amp; reviews</h2>
      <div className="v2-panel p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-[color:var(--color-brand-soft,theme(colors.teal.500/15))] text-teal-700 dark:text-teal-300 text-lg">
            📍
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Google Business Profile</h3>
              {connected ? (
                <StatusPill tone="ok" label="Connected" />
              ) : connection.status === 'error' ? (
                <StatusPill tone="urgent" label="Needs attention" />
              ) : (
                <StatusPill tone="neutral" label="Not connected" />
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connect your Google listing through Zernio&apos;s secure sign-in — no Google verification paperwork on your
              end.
            </p>
          </div>
        </div>

        {connected ? (
          <>
            <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-3 py-2.5 mb-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {account?.displayName || account?.username || 'Your Google Business listing'}
              </p>
              {account?.username && account?.displayName && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num">{account.username}</p>
              )}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              You&apos;re connected. <span className="font-medium">What&apos;s next:</span> pulling your Google reviews
              (with real star ratings for your website), syncing your verified hours &amp; address, and local search
              metrics — those land in the next update.
            </p>

            <div className="flex flex-wrap gap-2">
              <ActionButton variant="secondary" size="sm" onClick={refresh} disabled={pending}>
                {pending ? 'Refreshing…' : 'Refresh'}
              </ActionButton>
              <ActionButton variant="danger" size="sm" onClick={disconnect} disabled={pending}>
                Disconnect
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Linking your Google Business Profile lets DreamCRM bring your Google reviews, verified hours, address, and
              local search stats into one place — and reply to reviews from your dashboard (arriving in the next update).
              You&apos;ll need to be an owner or manager of your Google listing.
            </p>

            {configured ? (
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  variant="primary"
                  size="sm"
                  href="/api/integrations/zernio/connect?platform=googlebusiness"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onConnectClick}
                >
                  Connect Google Business
                </ActionButton>
                <ActionButton variant="ghost" size="sm" onClick={refresh} disabled={pending}>
                  {pending ? 'Checking…' : 'I just connected — refresh'}
                </ActionButton>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                Google Business isn&apos;t enabled on this DreamCRM instance yet.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
