'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { syncZernioAccountsAction, disconnectChannelAction } from '../actions'

/**
 * Google Business detail-page controls — the same Zernio connect/refresh/
 * disconnect behavior as the marketplace card, lifted to its own client island
 * so the detail page can stay a server component. Preserves: connect opens
 * Zernio hosted OAuth in a NEW TAB, re-syncs on window focus after a connect
 * attempt, a Refresh button, and disconnect. All best-effort `{ ok | error }`.
 */
export default function GbpDetailControls({
  connected,
  configured,
}: {
  connected: boolean
  configured: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const awaitingConnect = useRef(false)

  function refresh() {
    setError(null)
    start(async () => {
      const r = await syncZernioAccountsAction()
      if (!r.ok) setError(r.error ?? 'Could not refresh.')
      router.refresh()
    })
  }

  function disconnect() {
    if (!confirm('Disconnect Google Business? Your reviews, hours, and metrics will stop syncing.')) return
    setError(null)
    start(async () => {
      const r = await disconnectChannelAction('googlebusiness')
      if (!r.ok) setError(r.error ?? 'Could not disconnect.')
      router.refresh()
    })
  }

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
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            <ActionButton variant="secondary" size="sm" onClick={refresh} disabled={pending}>
              {pending ? 'Refreshing…' : 'Refresh from Google'}
            </ActionButton>
            <ActionButton variant="danger" size="sm" onClick={disconnect} disabled={pending} className="ml-auto">
              Disconnect
            </ActionButton>
          </>
        ) : configured ? (
          <>
            <ActionButton
              variant="primary"
              size="sm"
              href="/api/integrations/zernio/connect?platform=googlebusiness"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                awaitingConnect.current = true
              }}
            >
              Connect Google Business
            </ActionButton>
            <ActionButton variant="ghost" size="sm" onClick={refresh} disabled={pending}>
              {pending ? 'Checking…' : 'I just connected — refresh'}
            </ActionButton>
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Google Business isn’t enabled on this DreamCRM instance yet.
          </p>
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
